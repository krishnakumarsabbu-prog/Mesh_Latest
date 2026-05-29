from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from app.models.project import Project, ProjectMember, ProjectMemberRole
from app.models.team import Team
from app.models.component import Component
from app.models.connector import Connector, ConnectorStatus
from app.models.project_connector import ProjectConnector
from app.models.connector_execution_log import ConnectorAgentStatus, AgentHealthStatus
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberCreate, ProjectMemberUpdate
import uuid


class ProjectService:
    async def create(self, db: AsyncSession, data: ProjectCreate, user_id: str) -> Project:
        team_result = await db.execute(select(Team).where(Team.id == data.team_id))
        team = team_result.scalar_one_or_none()
        if not team:
            raise ValueError("Team not found")
        if team.lob_id != data.lob_id:
            raise ValueError("Team does not belong to the selected LOB")

        if getattr(data, "component_id", None):
            comp_result = await db.execute(select(Component).where(Component.id == data.component_id))
            comp = comp_result.scalar_one_or_none()
            if not comp:
                raise ValueError("Component not found")
            if comp.team_id != data.team_id:
                raise ValueError("Component does not belong to the selected Team")

        project = Project(
            id=str(uuid.uuid4()),
            name=data.name,
            slug=data.slug,
            description=data.description,
            lob_id=data.lob_id,
            team_id=data.team_id,
            component_id=getattr(data, "component_id", None),
            environment=data.environment,
            tags=data.tags,
            color=data.color,
            created_by=user_id,
        )
        db.add(project)
        await db.flush()
        return project

    async def _enrich_project(self, db: AsyncSession, p: Project) -> dict:
        # Count from project_connectors (the actual assigned connectors)
        conn_count = await db.execute(
            select(func.count(ProjectConnector.id)).where(ProjectConnector.project_id == p.id)
        )
        enabled_conn_count = await db.execute(
            select(func.count(ProjectConnector.id)).where(
                ProjectConnector.project_id == p.id, ProjectConnector.is_enabled == True
            )
        )

        # Count health statuses via agent status join
        healthy = await db.execute(
            select(func.count(ConnectorAgentStatus.id))
            .join(ProjectConnector, ConnectorAgentStatus.project_connector_id == ProjectConnector.id)
            .where(
                ProjectConnector.project_id == p.id,
                ConnectorAgentStatus.health_status == AgentHealthStatus.HEALTHY,
            )
        )
        degraded = await db.execute(
            select(func.count(ConnectorAgentStatus.id))
            .join(ProjectConnector, ConnectorAgentStatus.project_connector_id == ProjectConnector.id)
            .where(
                ProjectConnector.project_id == p.id,
                ConnectorAgentStatus.health_status == AgentHealthStatus.DEGRADED,
            )
        )
        down = await db.execute(
            select(func.count(ConnectorAgentStatus.id))
            .join(ProjectConnector, ConnectorAgentStatus.project_connector_id == ProjectConnector.id)
            .where(
                ProjectConnector.project_id == p.id,
                ConnectorAgentStatus.health_status.in_([
                    AgentHealthStatus.DOWN, AgentHealthStatus.ERROR, AgentHealthStatus.TIMEOUT
                ]),
            )
        )

        member_count = await db.execute(select(func.count(ProjectMember.id)).where(ProjectMember.project_id == p.id))

        team_name = None
        if p.team_id:
            team_result = await db.execute(select(Team).where(Team.id == p.team_id))
            team = team_result.scalar_one_or_none()
            team_name = team.name if team else None

        component_name = None
        if p.component_id:
            comp_result = await db.execute(select(Component).where(Component.id == p.component_id))
            comp = comp_result.scalar_one_or_none()
            component_name = comp.name if comp else None

        d = {**p.__dict__}
        d.pop("_sa_instance_state", None)
        d["connector_count"] = conn_count.scalar()
        d["enabled_connector_count"] = enabled_conn_count.scalar()
        d["healthy_count"] = healthy.scalar()
        d["degraded_count"] = degraded.scalar()
        d["down_count"] = down.scalar()
        d["member_count"] = member_count.scalar()
        d["team_name"] = team_name
        d["component_name"] = component_name
        return d

    async def get_all(self, db: AsyncSession, lob_id: Optional[str] = None, team_id: Optional[str] = None, user_id: Optional[str] = None, user_role: Optional[str] = None, component_id: Optional[str] = None) -> List[dict]:
        q = select(Project)
        if lob_id:
            q = q.where(Project.lob_id == lob_id)
        if team_id:
            q = q.where(Project.team_id == team_id)
        if component_id:
            q = q.where(Project.component_id == component_id)

        if user_role in ("project_admin", "project_user"):
            member_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
            q = q.where(Project.id.in_(member_subq))

        result = await db.execute(q)
        projects = result.scalars().all()
        output = []
        for p in projects:
            output.append(await self._enrich_project(db, p))
        return output

    async def get_by_id(self, db: AsyncSession, project_id: str) -> Optional[Project]:
        result = await db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_counts(self, db: AsyncSession, project_id: str) -> Optional[dict]:
        project = await self.get_by_id(db, project_id)
        if not project:
            return None
        return await self._enrich_project(db, project)

    async def update(self, db: AsyncSession, project_id: str, data: ProjectUpdate) -> Optional[Project]:
        project = await self.get_by_id(db, project_id)
        if not project:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(project, key, val)
        await db.flush()
        return project

    async def delete(self, db: AsyncSession, project_id: str) -> bool:
        project = await self.get_by_id(db, project_id)
        if not project:
            return False
        await db.delete(project)
        await db.flush()
        return True

    async def get_members(self, db: AsyncSession, project_id: str) -> List[dict]:
        result = await db.execute(
            select(ProjectMember, User)
            .join(User, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
        )
        rows = result.all()
        output = []
        for member, user in rows:
            d = {**member.__dict__}
            d.pop("_sa_instance_state", None)
            d["user_email"] = user.email
            d["user_full_name"] = user.full_name
            d["user_avatar_url"] = user.avatar_url
            output.append(d)
        return output

    async def add_member(self, db: AsyncSession, project_id: str, data: ProjectMemberCreate, assigned_by: str) -> dict:
        existing = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == data.user_id
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("User is already a member of this project")

        member = ProjectMember(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=data.user_id,
            role=data.role,
            assigned_by=assigned_by,
        )
        db.add(member)
        await db.flush()

        user_result = await db.execute(select(User).where(User.id == data.user_id))
        user = user_result.scalar_one_or_none()
        d = {**member.__dict__}
        d.pop("_sa_instance_state", None)
        d["user_email"] = user.email if user else None
        d["user_full_name"] = user.full_name if user else None
        d["user_avatar_url"] = user.avatar_url if user else None
        return d

    async def update_member(self, db: AsyncSession, project_id: str, member_id: str, data: ProjectMemberUpdate) -> Optional[dict]:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return None
        member.role = data.role
        await db.flush()

        user_result = await db.execute(select(User).where(User.id == member.user_id))
        user = user_result.scalar_one_or_none()
        d = {**member.__dict__}
        d.pop("_sa_instance_state", None)
        d["user_email"] = user.email if user else None
        d["user_full_name"] = user.full_name if user else None
        d["user_avatar_url"] = user.avatar_url if user else None
        return d

    async def remove_member(self, db: AsyncSession, project_id: str, member_id: str) -> bool:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return False
        await db.delete(member)
        await db.flush()
        return True

    async def is_member(self, db: AsyncSession, project_id: str, user_id: str) -> bool:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id
            )
        )
        return result.scalar_one_or_none() is not None


project_service = ProjectService()
