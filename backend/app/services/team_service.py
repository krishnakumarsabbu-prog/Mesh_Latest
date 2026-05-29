from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from app.models.team import Team, TeamMember, TeamProject
from app.models.project import Project
from app.models.connector import Connector, ConnectorStatus
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate, TeamMemberCreate, TeamProjectAssign
import uuid


class TeamService:
    async def create(self, db: AsyncSession, data: TeamCreate, user_id: str, tenant_id: str) -> Team:
        team = Team(
            id=str(uuid.uuid4()),
            name=data.name,
            slug=data.slug,
            description=data.description,
            color=data.color,
            icon=data.icon,
            lob_id=data.lob_id,
            tenant_id=tenant_id,
            created_by=user_id,
        )
        db.add(team)
        await db.flush()
        return team

    async def get_all(self, db: AsyncSession, lob_id: Optional[str] = None) -> List[dict]:
        from app.models.component import Component
        from app.models.connector import Connector, ConnectorStatus
        q = select(Team)
        if lob_id:
            q = q.where(Team.lob_id == lob_id)
        result = await db.execute(q)
        teams = result.scalars().all()
        output = []
        for t in teams:
            member_count = await db.execute(
                select(func.count(TeamMember.id)).where(TeamMember.team_id == t.id)
            )
            project_count = await db.execute(
                select(func.count(Component.id)).where(Component.team_id == t.id)
            )
            component_count = await db.execute(
                select(func.count(Project.id)).where(Project.team_id == t.id)
            )
            total_connectors = await db.execute(
                select(func.count(Connector.id)).where(Connector.project_id.in_(
                    select(Project.id).where(Project.team_id == t.id)
                ))
            )
            healthy_connectors = await db.execute(
                select(func.count(Connector.id)).where(
                    Connector.project_id.in_(select(Project.id).where(Project.team_id == t.id)),
                    Connector.status == ConnectorStatus.HEALTHY
                )
            )
            d = {**t.__dict__}
            d.pop("_sa_instance_state", None)
            d["member_count"] = member_count.scalar()
            d["project_count"] = project_count.scalar()
            d["component_count"] = component_count.scalar()
            d["total_connectors"] = total_connectors.scalar()
            d["healthy_connectors"] = healthy_connectors.scalar()
            output.append(d)
        return output

    async def get_by_id(self, db: AsyncSession, team_id: str) -> Optional[Team]:
        result = await db.execute(select(Team).where(Team.id == team_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_counts(self, db: AsyncSession, team_id: str) -> Optional[dict]:
        from app.models.component import Component
        from app.models.connector import Connector, ConnectorStatus
        team = await self.get_by_id(db, team_id)
        if not team:
            return None
        member_count = await db.execute(
            select(func.count(TeamMember.id)).where(TeamMember.team_id == team_id)
        )
        project_count = await db.execute(
            select(func.count(Component.id)).where(Component.team_id == team_id)
        )
        component_count = await db.execute(
            select(func.count(Project.id)).where(Project.team_id == team_id)
        )
        total_connectors = await db.execute(
            select(func.count(Connector.id)).where(Connector.project_id.in_(
                select(Project.id).where(Project.team_id == team_id)
            ))
        )
        healthy_connectors = await db.execute(
            select(func.count(Connector.id)).where(
                Connector.project_id.in_(select(Project.id).where(Project.team_id == team_id)),
                Connector.status == ConnectorStatus.HEALTHY
            )
        )
        d = {**team.__dict__}
        d.pop("_sa_instance_state", None)
        d["member_count"] = member_count.scalar()
        d["project_count"] = project_count.scalar()
        d["component_count"] = component_count.scalar()
        d["total_connectors"] = total_connectors.scalar()
        d["healthy_connectors"] = healthy_connectors.scalar()
        return d

    async def update(self, db: AsyncSession, team_id: str, data: TeamUpdate) -> Optional[Team]:
        team = await self.get_by_id(db, team_id)
        if not team:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(team, key, val)
        await db.flush()
        return team

    async def delete(self, db: AsyncSession, team_id: str) -> bool:
        team = await self.get_by_id(db, team_id)
        if not team:
            return False
        await db.delete(team)
        await db.flush()
        return True

    async def get_members(self, db: AsyncSession, team_id: str) -> List[dict]:
        result = await db.execute(
            select(TeamMember, User)
            .join(User, TeamMember.user_id == User.id)
            .where(TeamMember.team_id == team_id)
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

    async def add_member(self, db: AsyncSession, team_id: str, data: TeamMemberCreate, assigned_by: str) -> dict:
        existing = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == data.user_id
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("User is already a member of this team")
        member = TeamMember(
            id=str(uuid.uuid4()),
            team_id=team_id,
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

    async def remove_member(self, db: AsyncSession, team_id: str, member_id: str) -> bool:
        result = await db.execute(
            select(TeamMember).where(
                TeamMember.id == member_id,
                TeamMember.team_id == team_id
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return False
        await db.delete(member)
        await db.flush()
        return True

    async def get_projects(self, db: AsyncSession, team_id: str) -> List[dict]:
        result = await db.execute(
            select(TeamProject, Project)
            .join(Project, TeamProject.project_id == Project.id)
            .where(TeamProject.team_id == team_id)
        )
        rows = result.all()
        output = []
        for tp, proj in rows:
            conn_count = await db.execute(
                select(func.count(Connector.id)).where(Connector.project_id == proj.id)
            )
            healthy = await db.execute(
                select(func.count(Connector.id)).where(
                    Connector.project_id == proj.id,
                    Connector.status == ConnectorStatus.HEALTHY
                )
            )
            d = {**tp.__dict__}
            d.pop("_sa_instance_state", None)
            d["project_name"] = proj.name
            d["project_color"] = proj.color
            d["project_status"] = proj.status.value if proj.status else None
            d["project_environment"] = proj.environment
            d["connector_count"] = conn_count.scalar()
            d["healthy_count"] = healthy.scalar()
            output.append(d)
        return output

    async def assign_project(self, db: AsyncSession, team_id: str, data: TeamProjectAssign, assigned_by: str) -> dict:
        existing = await db.execute(
            select(TeamProject).where(
                TeamProject.team_id == team_id,
                TeamProject.project_id == data.project_id
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Project is already assigned to this team")
        tp = TeamProject(
            id=str(uuid.uuid4()),
            team_id=team_id,
            project_id=data.project_id,
            assigned_by=assigned_by,
        )
        db.add(tp)
        await db.flush()
        proj_result = await db.execute(select(Project).where(Project.id == data.project_id))
        proj = proj_result.scalar_one_or_none()
        d = {**tp.__dict__}
        d.pop("_sa_instance_state", None)
        d["project_name"] = proj.name if proj else None
        d["project_color"] = proj.color if proj else None
        d["project_status"] = proj.status.value if proj and proj.status else None
        d["project_environment"] = proj.environment if proj else None
        d["connector_count"] = 0
        d["healthy_count"] = 0
        return d

    async def remove_project(self, db: AsyncSession, team_id: str, assignment_id: str) -> bool:
        result = await db.execute(
            select(TeamProject).where(
                TeamProject.id == assignment_id,
                TeamProject.team_id == team_id
            )
        )
        tp = result.scalar_one_or_none()
        if not tp:
            return False
        await db.delete(tp)
        await db.flush()
        return True

    async def get_team_project_ids(self, db: AsyncSession, team_id: str) -> List[str]:
        result = await db.execute(
            select(TeamProject.project_id).where(TeamProject.team_id == team_id)
        )
        return [row[0] for row in result.all()]


team_service = TeamService()
