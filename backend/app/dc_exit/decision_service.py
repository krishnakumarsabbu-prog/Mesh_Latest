"""
DecisionService — produces a go/no-go verdict and prioritization plan
for a DC exit by combining ReadinessService + TraversalService + blast radius.

No duplicate readiness or traversal logic — this service orchestrates
the others and adds decision-specific synthesis (verdict, waves, evidence).
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.runtime import RuntimeAsset, ApplicationIntent
from app.dc_exit.readiness_service import readiness_service
from app.dc_exit.traversal_service import traversal_service
from app.services.confidence_service import engine as confidence_engine

logger = logging.getLogger(__name__)

# Complexity heuristics by dependency count
_COMPLEXITY_THRESHOLDS = [
    (6, "high"),
    (3, "medium"),
    (0, "low"),
]

# Tier -> business criticality mapping
_TIER_CRITICALITY = {
    "T1": "critical",
    "T2": "high",
    "T3": "medium",
}


class DecisionService:
    """Produce migration verdict, wave plan, evidence, and reasoning timeline."""

    async def get_decision(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """Full decision package: verdict + prioritization + evidence + reasoning."""
        readiness = await readiness_service.assess(db, data_center_short, tenant_id)
        scope = await traversal_service.compute_dc_exit_scope(db, data_center_short, tenant_id)

        apps = await self._collect_apps(db, data_center_short)
        priority_rows = self._prioritize(apps)
        waves = self._build_waves(priority_rows)

        verdict = self._compute_verdict(readiness, apps)
        evidence = self._collect_evidence(readiness, apps)
        reasoning = self._build_reasoning(readiness, scope, apps, verdict)

        return {
            "data_center": data_center_short,
            "verdict": verdict,
            "readiness": {
                "overall_score": readiness["overall_score"],
                "overall_status": readiness["overall_status"],
                "blocker_count": readiness["blocker_count"],
                "critical_blocker_count": readiness["critical_blocker_count"],
            },
            "prioritization": priority_rows,
            "waves": waves,
            "evidence": evidence,
            "reasoning_timeline": reasoning,
            "decided_at": datetime.utcnow().isoformat() + "Z",
        }

    async def get_verdict(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """Return only the verdict summary (lighter-weight)."""
        readiness = await readiness_service.assess(db, data_center_short, tenant_id)
        apps = await self._collect_apps(db, data_center_short)
        verdict = self._compute_verdict(readiness, apps)
        return {
            "data_center": data_center_short,
            "verdict": verdict,
            "decided_at": datetime.utcnow().isoformat() + "Z",
        }

    async def get_prioritization(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """Return only the prioritization / wave plan."""
        apps = await self._collect_apps(db, data_center_short)
        priority_rows = self._prioritize(apps)
        waves = self._build_waves(priority_rows)
        return {
            "data_center": data_center_short,
            "prioritization": priority_rows,
            "waves": waves,
        }

    # ── internals ──────────────────────────────────────────────────────────────

    async def _collect_apps(
        self, db: AsyncSession, dc_short: str
    ) -> List[Dict[str, Any]]:
        """Collect application summaries for apps with assets in the target DC."""
        asset_res = await db.execute(
            select(RuntimeAsset).where(RuntimeAsset.data_center_short == dc_short)
        )
        assets = asset_res.scalars().all()

        intent_res = await db.execute(select(ApplicationIntent))
        intents = {i.application_id: i for i in intent_res.scalars().all()}

        app_map: Dict[str, Dict[str, Any]] = {}
        for a in assets:
            meta = a.metadata_json or {}
            app_id = meta.get("application_id")
            if not app_id:
                continue
            if app_id not in app_map:
                intent = intents.get(app_id)
                app_map[app_id] = {
                    "app_id": app_id,
                    "app_name": meta.get("application_name", app_id),
                    "assets": [],
                    "intent": intent,
                    "tech_stacks": set(),
                }
            app_map[app_id]["assets"].append(a)
            app_map[app_id]["tech_stacks"].add(a.tech_stack)

        result: List[Dict[str, Any]] = []
        for app_id, info in app_map.items():
            app_assets = info["assets"]
            conf = confidence_engine.score_application(app_assets)
            dep_count = len(info["tech_stacks"])
            tier = self._derive_tier(info["intent"], conf.score)
            result.append({
                "app_id": app_id,
                "app_name": info["app_name"],
                "tier": tier,
                "business_criticality": _TIER_CRITICALITY.get(tier, "medium"),
                "dependency_count": dep_count,
                "dependency_detail": ", ".join(sorted(info["tech_stacks"])),
                "confidence_score": conf.score,
                "confidence_label": conf.level,
                "alignment_status": info["intent"].alignment_status if info["intent"] else "UNKNOWN",
                "asset_count": len(app_assets),
            })

        return result

    def _prioritize(self, apps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort apps into prioritized rows with complexity + wave assignment."""
        rows: List[Dict[str, Any]] = []
        for app in apps:
            dep_count = app["dependency_count"]
            complexity = "low"
            for threshold, label in _COMPLEXITY_THRESHOLDS:
                if dep_count >= threshold:
                    complexity = label
                    break

            rows.append({
                "id": f"pr-{app['app_id'].lower()[:12]}",
                "app_id": app["app_id"],
                "appName": app["app_name"],
                "tier": app["tier"],
                "complexity": complexity,
                "dependencies": dep_count,
                "dependencyDetail": app["dependency_detail"],
                "businessCriticality": app["business_criticality"],
                "confidenceScore": app["confidence_score"],
                "confidenceLabel": app["confidence_label"],
                "alignmentStatus": app["alignment_status"],
                "estimatedEffort": self._estimate_effort(complexity, app["tier"]),
                "wave": None,
            })

        # Sort: T1 critical first, then by confidence ascending (riskiest first)
        tier_order = {"T1": 0, "T2": 1, "T3": 2}
        rows.sort(key=lambda r: (tier_order.get(r["tier"], 3), -r["confidenceScore"]))

        # Assign waves
        for i, row in enumerate(rows):
            row["wave"] = self._assign_wave(i, len(rows))

        return rows

    def _build_waves(self, priority_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Group priority rows into migration waves."""
        wave_map: Dict[int, List[Dict[str, Any]]] = {}
        for row in priority_rows:
            wave = row["wave"] or 1
            wave_map.setdefault(wave, []).append({
                "app_id": row["app_id"],
                "appName": row["appName"],
                "tier": row["tier"],
                "complexity": row["complexity"],
                "estimatedEffort": row["estimatedEffort"],
            })

        waves: List[Dict[str, Any]] = []
        for wave_num in sorted(wave_map.keys()):
            apps_in_wave = wave_map[wave_num]
            waves.append({
                "wave": wave_num,
                "app_count": len(apps_in_wave),
                "apps": apps_in_wave,
                "total_effort": self._sum_effort_days(apps_in_wave),
            })
        return waves

    def _compute_verdict(
        self, readiness: Dict[str, Any], apps: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        score = readiness["overall_score"]
        critical = readiness["critical_blocker_count"]
        total_blockers = readiness["blocker_count"]

        if critical > 0:
            verdict = "DO_NOT_SHUTDOWN"
            headline = f"Blocked — {critical} critical blocker(s) must be resolved"
        elif total_blockers > 0:
            verdict = "CONDITIONAL"
            headline = f"Conditional Go — resolve {total_blockers} blocker(s) before cutover"
        elif score >= 90:
            verdict = "SAFE"
            headline = "Safe to proceed — all categories passing"
        else:
            verdict = "CONDITIONAL"
            headline = f"Conditional Go — readiness score {score}/100"

        confidence = min(100, score + (10 if critical == 0 else 0))

        if verdict == "SAFE":
            summary = (f"Migration readiness is strong (score {score}/100) with no blockers. "
                       "Proceed with cutover. Do not shut down source DC until post-cutover validation completes.")
        elif verdict == "CONDITIONAL":
            summary = (f"Migration readiness is {score}/100. {total_blockers} blocker(s) remain across "
                       f"{len(readiness['categories'])} categories. Proceed once blockers are cleared.")
        else:
            summary = (f"Migration blocked. {critical} critical blocker(s) detected. "
                       "Do not shut down source DC until all critical blockers are resolved.")

        return {
            "verdict": verdict,
            "headline": headline,
            "summary": summary,
            "confidence": confidence,
            "readiness_score": score,
        }

    def _collect_evidence(
        self, readiness: Dict[str, Any], apps: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build evidence list from readiness categories + app confidence."""
        evidence: List[Dict[str, Any]] = []
        for cat in readiness.get("categories", []):
            if cat["status"] != "pass":
                weight = "high" if cat["status"] == "fail" else "medium"
                evidence.append({
                    "id": f"ev-{cat['id']}",
                    "source": cat["label"],
                    "finding": cat["detail"],
                    "weight": weight,
                })
        for app in apps[:5]:
            evidence.append({
                "id": f"ev-app-{app['app_id'].lower()[:8]}",
                "source": f"Confidence engine — {app['app_name']}",
                "finding": f"Confidence {app['confidence_score']}/100 ({app['confidence_label']}). "
                           f"Alignment: {app['alignment_status']}.",
                "weight": "high" if app["confidence_score"] < 60 else "medium",
            })
        return evidence

    def _build_reasoning(
        self,
        readiness: Dict[str, Any],
        scope: Dict[str, Any],
        apps: List[Dict[str, Any]],
        verdict: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        steps: List[Dict[str, Any]] = []
        now = datetime.utcnow().isoformat() + "Z"

        steps.append({
            "id": "rs-discover",
            "phase": "Discovery",
            "timestamp": now,
            "title": f"{len(apps)} applications in scope",
            "detail": f"{scope['source_asset_count']} source assets identified in {scope['data_center']}.",
            "tone": "positive" if len(apps) > 0 else "negative",
        })

        blast = scope.get("blast_radius")
        if blast:
            steps.append({
                "id": "rs-impact",
                "phase": "Impact Analysis",
                "timestamp": now,
                "title": f"{blast['total_apps_impacted']} apps impacted — {blast['critical_count']} critical",
                "detail": blast.get("estimated_recovery_summary", "Impact analysis complete."),
                "tone": "warning" if blast["critical_count"] > 0 else "neutral",
            })

        steps.append({
            "id": "rs-readiness",
            "phase": "Readiness Scoring",
            "timestamp": now,
            "title": f"Readiness {readiness['overall_score']}/100 — {readiness['blocker_count']} blockers",
            "detail": f"{readiness['critical_blocker_count']} critical, "
                      f"{readiness['blocker_count'] - readiness['critical_blocker_count']} non-critical.",
            "tone": "negative" if readiness["critical_blocker_count"] > 0 else "warning",
        })

        steps.append({
            "id": "rs-verdict",
            "phase": "Verdict",
            "timestamp": now,
            "title": verdict["headline"],
            "detail": verdict["summary"],
            "tone": "positive" if verdict["verdict"] == "SAFE" else "warning",
        })

        return steps

    def _derive_tier(self, intent: Optional[ApplicationIntent], conf_score: int) -> str:
        if intent and intent.alignment_status == "ALIGNED" and conf_score >= 80:
            return "T1"
        if intent and conf_score >= 60:
            return "T2"
        return "T3"

    def _estimate_effort(self, complexity: str, tier: str) -> str:
        base = {"low": 3, "medium": 7, "high": 14}.get(complexity, 7)
        tier_mult = {"T1": 1.5, "T2": 1.2, "T3": 1.0}.get(tier, 1.0)
        days = int(base * tier_mult)
        return f"{days} days"

    def _assign_wave(self, index: int, total: int) -> int:
        if total <= 3:
            return index + 1
        if index < total // 3:
            return 1
        if index < (total * 2) // 3:
            return 2
        return 3

    def _sum_effort_days(self, apps: List[Dict[str, Any]]) -> int:
        total = 0
        for a in apps:
            effort = a.get("estimatedEffort", "0 days")
            try:
                total += int(effort.split()[0])
            except (ValueError, IndexError):
                pass
        return total


decision_service = DecisionService()
