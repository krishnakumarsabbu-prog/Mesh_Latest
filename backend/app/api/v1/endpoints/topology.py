from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.lob import Lob
from app.models.team import Team, TeamMember
from app.models.project import Project
from app.models.connector import Connector
from app.models.runtime import RuntimeAsset

router = APIRouter(prefix="/topology", tags=["topology"])


def _health_color(status: str) -> str:
    mapping = {
        "healthy": "#30D158",
        "degraded": "#FF9F0A",
        "down": "#FF453A",
        "unknown": "#636366",
        "active": "#30D158",
        "standby": "#FF9F0A",
    }
    return mapping.get(status or "unknown", "#636366")


@router.get("/graph")
async def get_topology_graph(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id or "default"

    lobs_result = await db.execute(
        select(Lob).where(Lob.tenant_id == tenant_id, Lob.is_active == True)
    )
    lobs = lobs_result.scalars().all()

    teams_result = await db.execute(
        select(Team).where(Team.tenant_id == tenant_id, Team.is_active == True)
    )
    teams = teams_result.scalars().all()

    projects_result = await db.execute(
        select(Project)
    )
    projects = projects_result.scalars().all()
    lob_ids = {l.id for l in lobs}
    projects = [p for p in projects if p.lob_id in lob_ids]

    project_ids = {p.id for p in projects}

    connectors_result = await db.execute(
        select(Connector).where(Connector.is_active == True)
    )
    connectors = connectors_result.scalars().all()
    connectors = [c for c in connectors if c.project_id in project_ids]

    assets_result = await db.execute(select(RuntimeAsset))
    assets = assets_result.scalars().all()

    # Member counts per team
    team_member_counts: dict[str, int] = {}
    for team in teams:
        res = await db.execute(
            select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
        )
        team_member_counts[team.id] = res.scalar() or 0

    # Project counts per LOB
    lob_project_counts: dict[str, int] = {}
    for lob in lobs:
        lob_project_counts[lob.id] = sum(1 for p in projects if p.lob_id == lob.id)

    # Connector counts per project
    project_connector_counts: dict[str, int] = {}
    for p in projects:
        project_connector_counts[p.id] = sum(1 for c in connectors if c.project_id == p.id)

    nodes = []
    edges = []

    # LOB nodes — top row
    LOB_Y = 0
    lob_x_step = 380
    lob_x_start = 0
    for i, lob in enumerate(lobs):
        x = lob_x_start + i * lob_x_step
        nodes.append({
            "id": f"lob-{lob.id}",
            "type": "lob",
            "position": {"x": x, "y": LOB_Y},
            "data": {
                "id": lob.id,
                "name": lob.name,
                "color": lob.color or "#0A84FF",
                "project_count": lob_project_counts.get(lob.id, 0),
                "status": "active" if lob.is_active else "inactive",
            },
        })

    # Team nodes — second row
    TEAM_Y = 200
    team_x_step = 300
    for i, team in enumerate(teams):
        x = i * team_x_step
        nodes.append({
            "id": f"team-{team.id}",
            "type": "team",
            "position": {"x": x, "y": TEAM_Y},
            "data": {
                "id": team.id,
                "name": team.name,
                "color": team.color or "#0A84FF",
                "member_count": team_member_counts.get(team.id, 0),
                "lob_id": team.lob_id,
            },
        })
        # Edge: LOB → Team
        edges.append({
            "id": f"e-lob-{team.lob_id}-team-{team.id}",
            "source": f"lob-{team.lob_id}",
            "target": f"team-{team.id}",
            "type": "health",
            "data": {"status": "active"},
            "animated": True,
        })

    # Project nodes — third row
    PROJECT_Y = 420
    project_x_step = 260
    for i, project in enumerate(projects):
        x = i * project_x_step
        status = project.status.value if hasattr(project.status, "value") else str(project.status)
        color = _health_color("healthy" if status == "active" else "unknown")
        nodes.append({
            "id": f"project-{project.id}",
            "type": "project",
            "position": {"x": x, "y": PROJECT_Y},
            "data": {
                "id": project.id,
                "name": project.name,
                "environment": project.environment or "production",
                "status": status,
                "color": color,
                "connector_count": project_connector_counts.get(project.id, 0),
                "lob_id": project.lob_id,
                "team_id": project.team_id,
            },
        })
        # Edge: LOB → Project
        edges.append({
            "id": f"e-lob-{project.lob_id}-proj-{project.id}",
            "source": f"lob-{project.lob_id}",
            "target": f"project-{project.id}",
            "type": "health",
            "data": {"status": "active"},
            "animated": True,
        })
        # Edge: Team → Project (if team assigned)
        if project.team_id:
            edges.append({
                "id": f"e-team-{project.team_id}-proj-{project.id}",
                "source": f"team-{project.team_id}",
                "target": f"project-{project.id}",
                "type": "health",
                "data": {"status": "active"},
                "animated": False,
            })

    # Connector nodes — fourth row
    CONN_Y = 660
    conn_x_step = 220
    for i, connector in enumerate(connectors):
        x = i * conn_x_step
        status = connector.status.value if hasattr(connector.status, "value") else str(connector.status)
        health_color = _health_color(status)
        nodes.append({
            "id": f"connector-{connector.id}",
            "type": "connector",
            "position": {"x": x, "y": CONN_Y},
            "data": {
                "id": connector.id,
                "name": connector.name,
                "type": connector.type.value if hasattr(connector.type, "value") else str(connector.type),
                "status": status,
                "color": health_color,
                "project_id": connector.project_id,
                "last_checked": connector.last_checked.isoformat() if connector.last_checked else None,
            },
        })
        # Edge: Project → Connector
        edges.append({
            "id": f"e-proj-{connector.project_id}-conn-{connector.id}",
            "source": f"project-{connector.project_id}",
            "target": f"connector-{connector.id}",
            "type": "health",
            "data": {"status": status},
            "animated": status == "healthy",
        })

    # Live physical infrastructure assets nodes — fifth row
    ASSET_Y = 880
    asset_x_step = 240
    for i, asset in enumerate(assets):
        x = i * asset_x_step
        op_state = asset.latest_operational_state.lower() if asset.latest_operational_state else "unknown"
        asset_color = _health_color("healthy" if op_state == "active" else "degraded" if op_state == "standby" else "down")
        
        nodes.append({
            "id": f"asset-{asset.id}",
            "type": "asset",
            "position": {"x": x, "y": ASSET_Y},
            "data": {
                "id": asset.id,
                "name": asset.name,
                "tech_stack": asset.tech_stack,
                "asset_type": asset.asset_type,
                "operational_state": asset.latest_operational_state,
                "replication_role": asset.latest_replication_role,
                "color": asset_color,
                "data_center": asset.data_center_short,
                "confidence": asset.latest_confidence_level
            }
        })
        
        # Determine target connection based on project code match
        app_id_raw = asset.metadata_json.get("application_id") if asset.metadata_json else None
        if app_id_raw:
            app_id = str(app_id_raw).upper()
            matched_proj = next((p for p in projects if app_id in p.id.upper() or app_id in p.name.upper()), None)
            if matched_proj:
                # Edge: Project → Host Asset
                edges.append({
                    "id": f"e-proj-{matched_proj.id}-asset-{asset.id}",
                    "source": f"project-{matched_proj.id}",
                    "target": f"asset-{asset.id}",
                    "type": "health",
                    "data": {"status": "active"},
                    "animated": op_state == "active",
                })
            else:
                # Fallback edge to the first project in lists to ensure graph connectivity
                if projects:
                    edges.append({
                        "id": f"e-proj-{projects[0].id}-asset-{asset.id}",
                        "source": f"project-{projects[0].id}",
                        "target": f"asset-{asset.id}",
                        "type": "health",
                        "data": {"status": "active"},
                        "animated": False,
                    })

    return {"nodes": nodes, "edges": edges}
