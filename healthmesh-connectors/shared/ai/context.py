from datetime import datetime
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field

class AIContextModel(BaseModel):
    connector: str
    health_score: float = Field(..., ge=0.0, le=100.0)
    critical_findings: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    topology_summary: str
    active_alerts: List[str] = Field(default_factory=list)
    drift_analysis: Dict[str, Any] = Field(default_factory=dict)
    sla_status: Dict[str, Any] = Field(default_factory=dict)
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

def build_ai_context(
    connector_name: str,
    health_score: float,
    critical_findings: List[str],
    warnings: List[str],
    recommendations: List[str],
    topology_summary: str,
    active_alerts: List[str],
    drift_analysis: Dict[str, Any],
    sla_status: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Standard helper to format the AI ready context schema payload.
    """
    context = AIContextModel(
        connector=connector_name,
        health_score=round(health_score, 2),
        critical_findings=critical_findings,
        warnings=warnings,
        recommendations=recommendations,
        topology_summary=topology_summary,
        active_alerts=active_alerts,
        drift_analysis=drift_analysis,
        sla_status=sla_status
    )
    return context.dict()
