"""
Aggregated metric models for Team and LOB roll-up dashboards.

TeamAggregateMetric: Pre-computed roll-up metrics scoped to a team.
LobAggregateMetric:  Pre-computed roll-up metrics scoped to a LOB.

Design:
  - One row per (entity_id, metric_key) pair — upserted on every recompute.
  - numeric_value stores the float value; string_value for non-numeric fields.
  - last_computed_at is indexed so staleness checks are fast.
  - compute_window_hours records the horizon used (default 24 h).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.db.base import Base


class AggregateScope(str, enum.Enum):
    TEAM = "team"
    LOB = "lob"


class TeamAggregateMetric(Base):
    """
    Pre-computed aggregate metric for a single Team.

    Metric keys (one row each):
      avg_project_health       – 0-100 score
      healthy_projects_count
      warning_projects_count
      critical_projects_count
      total_open_incidents
      avg_latency              – ms
      max_latency              – ms
      avg_availability         – 0-100 %
      sla_breach_count
      total_alerts
      project_count            – total projects in team
    """

    __tablename__ = "team_aggregate_metrics"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String, ForeignKey("teams.id"), nullable=False, index=True)
    metric_key = Column(String, nullable=False, index=True)
    numeric_value = Column(Float, nullable=True)
    string_value = Column(Text, nullable=True)
    compute_window_hours = Column(Integer, default=24)
    last_computed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("team_id", "metric_key", name="uq_team_metric"),
        Index("ix_team_agg_computed", "team_id", "last_computed_at"),
    )


class LobAggregateMetric(Base):
    """
    Pre-computed aggregate metric for a single LOB.

    Metric keys (one row each):
      avg_team_health          – 0-100 score
      avg_project_health       – 0-100 score
      total_projects
      critical_projects_count
      critical_teams_count
      portfolio_availability   – 0-100 %
      total_incidents
      sla_breach_rate          – 0-100 %
      team_count               – total teams in LOB
    """

    __tablename__ = "lob_aggregate_metrics"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lob_id = Column(String, ForeignKey("lobs.id"), nullable=False, index=True)
    metric_key = Column(String, nullable=False, index=True)
    numeric_value = Column(Float, nullable=True)
    string_value = Column(Text, nullable=True)
    compute_window_hours = Column(Integer, default=24)
    last_computed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("lob_id", "metric_key", name="uq_lob_metric"),
        Index("ix_lob_agg_computed", "lob_id", "last_computed_at"),
    )
