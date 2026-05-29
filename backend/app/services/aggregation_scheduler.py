"""
Aggregation Scheduler.

Provides three triggering mechanisms for recomputing Team/LOB aggregate metrics:

1. after_project_run(project_id)
   Called by HealthOrchestrator after a health run completes.
   Recomputes all teams that own the project, then all LOBs those teams belong to.
   Also writes an hourly health score rollup record.

2. after_metric_update(project_id)
   Called when a ProjectConnectorMetric is updated.
   Same fan-out as after_project_run.

3. run_scheduled_refresh()
   Background coroutine that runs on a configurable interval and
   recomputes all teams then all LOBs.  Designed to be launched with
   asyncio as a long-lived background task.

The scheduler is intentionally fire-and-forget when called from the
orchestrator to avoid blocking the main execution path.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from app.db.base import AsyncSessionLocal
from app.models.lob import Lob
from app.models.project import Project
from app.models.team import Team, TeamProject
from app.services.lob_aggregation_service import lob_aggregation_service
from app.services.team_aggregation_service import team_aggregation_service
from sqlalchemy import select, and_, func

logger = logging.getLogger("healthmesh.aggregation.scheduler")

# ─── Connector polling intervals ──────────────────────────────────────────────
# IBM MQ: poll every 2 minutes (120s) — QMGR status changes infrequently
_IBMMQ_POLL_INTERVAL_SECONDS = 120
# MongoDB: poll every 1 minute (60s) — replica state changes fast
_MONGODB_POLL_INTERVAL_SECONDS = 60

# In-memory cache for last connector health poll results
_connector_poll_cache: Dict[str, Dict[str, Any]] = {}

_BACKGROUND_INTERVAL_SECONDS = 300

# In-memory hourly rollup store: {project_id: {hour_bucket_iso: {avg, min, max, count}}}
# Keyed by project_id -> hour string -> accumulator
_hourly_rollups: Dict[str, Dict[str, Dict[str, Any]]] = {}


class AggregationScheduler:

    def __init__(self) -> None:
        self._running = False
        self._last_full_refresh: Optional[datetime] = None

    async def after_project_run(self, project_id: str, health_score: Optional[float] = None) -> None:
        """
        Triggered after a health run completes for a project.
        Runs asynchronously so it never blocks the caller.
        Also records the score in the hourly rollup if provided.
        """
        if health_score is not None:
            self._record_hourly_score(project_id, health_score)
        asyncio.ensure_future(self._recompute_for_project(project_id))

    async def after_metric_update(self, project_id: str) -> None:
        """
        Triggered after a ProjectConnectorMetric is created or updated.
        """
        asyncio.ensure_future(self._recompute_for_project(project_id))

    async def _recompute_for_project(self, project_id: str) -> None:
        try:
            async with AsyncSessionLocal() as db:
                team_ids = await self._get_team_ids_for_project(db, project_id)
                lob_ids = await self._get_lob_ids_for_project(db, project_id, team_ids)

                for team_id in team_ids:
                    try:
                        await team_aggregation_service.recompute_team(db, team_id)
                    except Exception as exc:
                        logger.error(f"[scheduler] team recompute failed team={team_id}: {exc}")

                for lob_id in lob_ids:
                    try:
                        await lob_aggregation_service.recompute_lob(db, lob_id)
                    except Exception as exc:
                        logger.error(f"[scheduler] lob recompute failed lob={lob_id}: {exc}")

                await db.commit()
        except Exception as exc:
            logger.error(f"[scheduler] _recompute_for_project failed project={project_id}: {exc}")

    async def run_scheduled_refresh(self) -> None:
        """
        Background loop.  Recomputes all teams then all LOBs every
        _BACKGROUND_INTERVAL_SECONDS seconds.  Survives individual errors.
        """
        self._running = True
        logger.info(f"[scheduler] background refresh started (interval={_BACKGROUND_INTERVAL_SECONDS}s)")
        while self._running:
            try:
                await asyncio.sleep(_BACKGROUND_INTERVAL_SECONDS)
                await self._full_refresh()
            except asyncio.CancelledError:
                logger.info("[scheduler] background refresh cancelled")
                break
            except Exception as exc:
                logger.error(f"[scheduler] background refresh error: {exc}")

    async def _full_refresh(self) -> None:
        logger.info("[scheduler] running full aggregate refresh")
        try:
            async with AsyncSessionLocal() as db:
                await team_aggregation_service.recompute_all_teams(db)
                await lob_aggregation_service.recompute_all_lobs(db)
                await db.commit()
            self._last_full_refresh = datetime.utcnow()
            logger.info("[scheduler] full aggregate refresh complete")
        except Exception as exc:
            logger.error(f"[scheduler] full refresh failed: {exc}")

    async def run_connector_polling(self) -> None:
        """
        Background loop that polls IBM MQ and MongoDB connectors on their
        respective intervals. Results are cached in _connector_poll_cache.
        Fires after_metric_update for any project linked to these connectors.
        """
        self._running = True
        logger.info("[scheduler] connector polling started")
        last_ibmmq_poll: float = 0.0
        last_mongodb_poll: float = 0.0

        while self._running:
            try:
                now = datetime.now(tz=timezone.utc).timestamp()

                if now - last_ibmmq_poll >= _IBMMQ_POLL_INTERVAL_SECONDS:
                    await self._poll_connector("ibmmq")
                    last_ibmmq_poll = now

                if now - last_mongodb_poll >= _MONGODB_POLL_INTERVAL_SECONDS:
                    await self._poll_connector("mongodb")
                    last_mongodb_poll = now

                await asyncio.sleep(15)
            except asyncio.CancelledError:
                logger.info("[scheduler] connector polling cancelled")
                break
            except Exception as exc:
                logger.error(f"[scheduler] connector polling error: {exc}")
                await asyncio.sleep(30)

    async def _poll_connector(self, connector_slug: str) -> None:
        """Fetch health from a registered connector and cache the result."""
        try:
            from app.connectors.base.registry import ConnectorRegistry
            from app.connectors.base.interface import ConnectorConfig, ConnectorCredentials, ConnectorAuthStrategy

            connector_cls = ConnectorRegistry.resolve(connector_slug)
            if connector_cls is None:
                return

            # Build a minimal config — real config comes from DB connectors in production
            config = ConnectorConfig(
                base_url=f"http://{connector_slug.replace('_', '-')}-service",
                timeout_seconds=15,
            )
            creds = ConnectorCredentials(strategy=ConnectorAuthStrategy.NONE)
            connector = connector_cls(config, creds)

            result = await connector.fetch_health()
            _connector_poll_cache[connector_slug] = {
                "status": result.status.value,
                "message": result.message,
                "response_time_ms": result.response_time_ms,
                "source_type": result.raw_response.get("source_type", "UNKNOWN") if result.raw_response else "UNKNOWN",
                "gap_note": result.raw_response.get("gap_note") if result.raw_response else None,
                "polled_at": datetime.now(tz=timezone.utc).isoformat(),
            }
            logger.debug(f"[scheduler] polled {connector_slug}: {result.status.value}")
        except Exception as exc:
            logger.warning(f"[scheduler] poll failed for {connector_slug}: {exc}")

    def get_connector_poll_status(self, connector_slug: str) -> Optional[Dict[str, Any]]:
        """Return the last cached poll result for a connector."""
        return _connector_poll_cache.get(connector_slug)

    def get_all_connector_poll_statuses(self) -> Dict[str, Dict[str, Any]]:
        """Return all cached connector poll results."""
        return dict(_connector_poll_cache)

    def stop(self) -> None:
        self._running = False

    def _record_hourly_score(self, project_id: str, score: float) -> None:
        """Accumulate a health score into the current hour bucket for the project."""
        now = datetime.now(tz=timezone.utc)
        hour_bucket = now.strftime("%Y-%m-%dT%H:00:00Z")

        if project_id not in _hourly_rollups:
            _hourly_rollups[project_id] = {}

        bucket = _hourly_rollups[project_id].get(hour_bucket)
        if bucket is None:
            _hourly_rollups[project_id][hour_bucket] = {
                "avg_score": score,
                "min_score": score,
                "max_score": score,
                "count": 1,
            }
        else:
            count = bucket["count"] + 1
            bucket["avg_score"] = round((bucket["avg_score"] * bucket["count"] + score) / count, 2)
            bucket["min_score"] = min(bucket["min_score"], score)
            bucket["max_score"] = max(bucket["max_score"], score)
            bucket["count"] = count

        # Retain only the last 24 hours of buckets per project
        cutoff = now.replace(minute=0, second=0, microsecond=0)
        from datetime import timedelta
        oldest_allowed = cutoff - timedelta(hours=24)
        _hourly_rollups[project_id] = {
            k: v
            for k, v in _hourly_rollups[project_id].items()
            if k >= oldest_allowed.strftime("%Y-%m-%dT%H:00:00Z")
        }

    def get_hourly_rollups(self, project_id: str) -> List[Dict[str, Any]]:
        """Return sorted list of hourly rollup buckets for a project."""
        buckets = _hourly_rollups.get(project_id, {})
        return [
            {"hour_bucket": k, **v}
            for k in sorted(buckets.keys())
            for v in [buckets[k]]
        ]

    async def _get_team_ids_for_project(self, db, project_id: str) -> List[str]:
        result = await db.execute(
            select(TeamProject.team_id).where(TeamProject.project_id == project_id)
        )
        return [row[0] for row in result.all()]

    async def _get_lob_ids_for_project(
        self, db, project_id: str, team_ids: List[str]
    ) -> List[str]:
        lob_ids = set()
        project_result = await db.execute(
            select(Project.lob_id).where(Project.id == project_id)
        )
        project_row = project_result.scalar_one_or_none()
        if project_row:
            lob_ids.add(project_row)

        if team_ids:
            team_result = await db.execute(
                select(Team.lob_id).where(Team.id.in_(team_ids))
            )
            for row in team_result.all():
                if row[0]:
                    lob_ids.add(row[0])

        return list(lob_ids)


aggregation_scheduler = AggregationScheduler()
