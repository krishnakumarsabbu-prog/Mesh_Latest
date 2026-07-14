"""
ReadinessService — computes migration readiness for a DC exit scope.

Scores each infrastructure category (database, messaging, dns, firewall,
secrets, certificates, storage, replication, monitoring) by aggregating
RuntimeAsset health + confidence for the target DC's assets. Reuses
confidence_service for per-asset scoring — no duplicate confidence logic.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.runtime import RuntimeAsset, RuntimeDataCenter, ApplicationIntent
from app.services.confidence_service import engine as confidence_engine

logger = logging.getLogger(__name__)

# Category -> tech_stacks that belong to that category
_CATEGORY_STACKS: Dict[str, List[str]] = {
    "database": ["oracle", "mssql", "mongodb"],
    "messaging": ["ibm_mq", "kafka"],
    "dns": ["dns"],
    "firewall": ["firewall"],
    "storage": ["storage"],
    "compute": ["ocp", "vm"],
    "network": ["avi_loadbalancer"],
}

# Categories that are derived from metadata_json, not tech_stack
_META_CATEGORIES = ["secrets", "certificates", "replication", "monitoring"]


class ReadinessService:
    """Compute per-category readiness scores and blockers for a DC exit."""

    async def assess(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """Full readiness assessment for a target data center exit."""
        assets = await self._load_dc_assets(db, data_center_short)
        if not assets:
            return {
                "data_center": data_center_short,
                "overall_score": 0,
                "overall_status": "unknown",
                "categories": [],
                "blockers": [],
                "assessed_at": datetime.utcnow().isoformat() + "Z",
            }

        categories = []
        blockers: List[Dict[str, Any]] = []

        # Tech-stack-based categories
        for cat, stacks in _CATEGORY_STACKS.items():
            cat_assets = [a for a in assets if a.tech_stack in stacks]
            if not cat_assets:
                continue
            cat_result = self._score_category(cat, cat_assets)
            categories.append(cat_result)
            blockers.extend(self._derive_blockers(cat_result))

        # Meta-derived categories (confidence-based proxies)
        for cat in _META_CATEGORIES:
            cat_result = self._score_meta_category(cat, assets)
            if cat_result["total"] > 0:
                categories.append(cat_result)
                blockers.extend(self._derive_blockers(cat_result))

        categories.sort(key=lambda c: c["score"] / max(c["total"], 1))
        overall = self._overall_score(categories)

        return {
            "data_center": data_center_short,
            "overall_score": overall["score"],
            "overall_status": overall["status"],
            "categories": categories,
            "blockers": blockers,
            "blocker_count": len(blockers),
            "critical_blocker_count": sum(1 for b in blockers if b["severity"] == "critical"),
            "assessed_at": datetime.utcnow().isoformat() + "Z",
        }

    async def get_blockers(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """Return only the readiness blockers for a DC."""
        assessment = await self.assess(db, data_center_short, tenant_id)
        return {
            "data_center": data_center_short,
            "blockers": assessment["blockers"],
            "blocker_count": assessment["blocker_count"],
            "critical_blocker_count": assessment["critical_blocker_count"],
        }

    # ── internals ──────────────────────────────────────────────────────────────

    async def _load_dc_assets(self, db: AsyncSession, dc_short: str) -> List[RuntimeAsset]:
        res = await db.execute(
            select(RuntimeAsset).where(RuntimeAsset.data_center_short == dc_short)
        )
        return list(res.scalars().all())

    def _score_category(self, category: str, assets: List[RuntimeAsset]) -> Dict[str, Any]:
        total = len(assets)
        healthy = 0
        degraded = 0
        down = 0
        at_risk = 0
        conf_scores: List[int] = []

        for a in assets:
            state = (a.latest_operational_state or "").upper()
            health = self._health_from_state(state)
            if health == "healthy":
                healthy += 1
            elif health == "degraded":
                degraded += 1
                at_risk += 1
            elif health == "down":
                down += 1
                at_risk += 1

            conf = confidence_engine.score_numeric([a])
            conf_scores.append(conf)
            if conf <= 2:
                at_risk += 1

        score = healthy
        status = self._status_from_ratio(score, total)
        detail = self._category_detail(category, healthy, total, degraded, down)

        return {
            "id": category,
            "label": category.title(),
            "status": status,
            "score": score,
            "total": total,
            "healthy": healthy,
            "degraded": degraded,
            "down": down,
            "at_risk": at_risk,
            "avg_confidence": round(sum(conf_scores) / len(conf_scores), 1) if conf_scores else 0,
            "detail": detail,
        }

    def _score_meta_category(self, category: str, assets: List[RuntimeAsset]) -> Dict[str, Any]:
        """
        Proxy scoring for categories not directly mapped to tech_stack.
        Uses confidence signals: high-confidence assets count as 'pass',
        low-confidence as 'warn', conflicts as 'fail'.
        """
        total = len(assets)
        pass_count = 0
        warn_count = 0
        fail_count = 0

        for a in assets:
            conf = confidence_engine.score_numeric([a])
            if conf >= 4:
                pass_count += 1
            elif conf >= 3:
                warn_count += 1
            else:
                fail_count += 1

        score = pass_count
        status = self._status_from_ratio(score, total)

        return {
            "id": category,
            "label": category.title(),
            "status": status,
            "score": score,
            "total": total,
            "healthy": pass_count,
            "degraded": warn_count,
            "down": fail_count,
            "at_risk": warn_count + fail_count,
            "avg_confidence": 0,
            "detail": f"{pass_count}/{total} {category} checks pass confidence threshold.",
        }

    def _derive_blockers(self, cat_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        blockers: List[Dict[str, Any]] = []
        if cat_result["status"] == "fail":
            blockers.append({
                "id": f"blk-{cat_result['id']}",
                "category": cat_result["label"],
                "title": f"{cat_result['down']} of {cat_result['total']} {cat_result['label']} assets are down",
                "severity": "critical" if cat_result["down"] > 0 else "high",
                "owner": f"{cat_result['label']} Ops",
                "due_date": None,
                "detail": cat_result["detail"],
            })
        elif cat_result["status"] == "warn":
            blockers.append({
                "id": f"blk-{cat_result['id']}",
                "category": cat_result["label"],
                "title": f"{cat_result['at_risk']} {cat_result['label']} assets at risk",
                "severity": "medium",
                "owner": f"{cat_result['label']} Ops",
                "due_date": None,
                "detail": cat_result["detail"],
            })
        return blockers

    def _overall_score(self, categories: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not categories:
            return {"score": 0, "status": "unknown"}
        total_score = sum(c["score"] for c in categories)
        total_possible = sum(c["total"] for c in categories)
        pct = int((total_score / max(total_possible, 1)) * 100)
        if pct >= 90:
            status = "pass"
        elif pct >= 70:
            status = "warn"
        else:
            status = "fail"
        return {"score": pct, "status": status}

    def _health_from_state(self, state: str) -> str:
        if state in ("ACTIVE", "ONLINE", "STANDBY"):
            return "healthy"
        if state in ("DEGRADED",):
            return "degraded"
        if state in ("INACTIVE", "DOWN", "OFFLINE"):
            return "down"
        return "unknown"

    def _status_from_ratio(self, score: int, total: int) -> str:
        if total == 0:
            return "pass"
        ratio = score / total
        if ratio >= 0.9:
            return "pass"
        if ratio >= 0.7:
            return "warn"
        return "fail"

    def _category_detail(self, category: str, healthy: int, total: int, degraded: int, down: int) -> str:
        if down > 0:
            return f"{down} {category} assets are down — cutover will fail until resolved."
        if degraded > 0:
            return f"{degraded} {category} assets degraded — resolve before cutover window."
        return f"All {total} {category} assets healthy."


readiness_service = ReadinessService()
