from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from app.models.sub_lob import SubLob, SubLobMember
from app.models.team import Team
from app.models.project import Project
from app.models.component import Component
from app.models.connector import Connector, ConnectorStatus
from app.models.user import User
from app.schemas.sub_lob import SubLobCreate, SubLobUpdate
import uuid


class SubLobService:
    async def create(self, db: AsyncSession, data: SubLobCreate, user_id: str) -> SubLob:
        sub_lob = SubLob(
            id=str(uuid.uuid4()),
            name=data.name,
            slug=data.slug,
            description=data.description,
            color=data.color,
            icon=data.icon,
            lob_id=data.lob_id,
            tenant_id=data.tenant_id,
            created_by=user_id,
        )
        db.add(sub_lob)
        await db.flush()
        return sub_lob

    async def get_all(self, db: AsyncSession, tenant_id: str, lob_id: Optional[str] = None) -> List[dict]:
        query = select(SubLob).where(SubLob.tenant_id == tenant_id, SubLob.is_active == True)
        if lob_id:
            query = query.where(SubLob.lob_id == lob_id)
        
        result = await db.execute(query)
        sub_lobs = result.scalars().all()
        
        output = []
        for sub_lob in sub_lobs:
            # Count teams
            team_count_res = await db.execute(
                select(func.count(Team.id)).where(Team.sub_lob_id == sub_lob.id)
            )
            team_count = team_count_res.scalar() or 0

            # Count projects belonging to those teams
            proj_count_res = await db.execute(
                select(func.count(Project.id)).where(
                    Project.team_id.in_(
                        select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                    )
                )
            )
            proj_count = proj_count_res.scalar() or 0

            # Count components belonging to those teams
            comp_count_res = await db.execute(
                select(func.count(Component.id)).where(
                    Component.team_id.in_(
                        select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                    )
                )
            )
            comp_count = comp_count_res.scalar() or 0

            # Count members
            member_count_res = await db.execute(
                select(func.count(SubLobMember.id)).where(SubLobMember.sub_lob_id == sub_lob.id)
            )
            member_count = member_count_res.scalar() or 0

            # Connector health across all projects in this SubLob
            total_connectors_res = await db.execute(
                select(func.count(Connector.id)).where(
                    Connector.project_id.in_(
                        select(Project.id).where(
                            Project.team_id.in_(
                                select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                            )
                        )
                    )
                )
            )
            total_connectors = total_connectors_res.scalar() or 0

            healthy_connectors_res = await db.execute(
                select(func.count(Connector.id)).where(
                    Connector.project_id.in_(
                        select(Project.id).where(
                            Project.team_id.in_(
                                select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                            )
                        )
                    ),
                    Connector.status == ConnectorStatus.HEALTHY
                )
            )
            healthy_connectors = healthy_connectors_res.scalar() or 0

            d = {**sub_lob.__dict__}
            d.pop("_sa_instance_state", None)
            d["team_count"] = team_count
            d["component_count"] = comp_count
            d["project_count"] = proj_count
            d["member_count"] = member_count
            d["total_connectors"] = total_connectors
            d["healthy_connectors"] = healthy_connectors
            output.append(d)
            
        return output

    async def get_by_id(self, db: AsyncSession, sub_lob_id: str) -> Optional[SubLob]:
        result = await db.execute(select(SubLob).where(SubLob.id == sub_lob_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_counts(self, db: AsyncSession, sub_lob_id: str) -> Optional[dict]:
        sub_lob = await self.get_by_id(db, sub_lob_id)
        if not sub_lob:
            return None

        team_count_res = await db.execute(
            select(func.count(Team.id)).where(Team.sub_lob_id == sub_lob.id)
        )
        team_count = team_count_res.scalar() or 0

        proj_count_res = await db.execute(
            select(func.count(Project.id)).where(
                Project.team_id.in_(
                    select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                )
            )
        )
        proj_count = proj_count_res.scalar() or 0

        comp_count_res = await db.execute(
            select(func.count(Component.id)).where(
                Component.team_id.in_(
                    select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                )
            )
        )
        comp_count = comp_count_res.scalar() or 0

        member_count_res = await db.execute(
            select(func.count(SubLobMember.id)).where(SubLobMember.sub_lob_id == sub_lob.id)
        )
        member_count = member_count_res.scalar() or 0

        total_connectors_res = await db.execute(
            select(func.count(Connector.id)).where(
                Connector.project_id.in_(
                    select(Project.id).where(
                        Project.team_id.in_(
                            select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                        )
                    )
                )
            )
        )
        total_connectors = total_connectors_res.scalar() or 0

        healthy_connectors_res = await db.execute(
            select(func.count(Connector.id)).where(
                Connector.project_id.in_(
                    select(Project.id).where(
                        Project.team_id.in_(
                            select(Team.id).where(Team.sub_lob_id == sub_lob.id)
                        )
                    )
                ),
                Connector.status == ConnectorStatus.HEALTHY
            )
        )
        healthy_connectors = healthy_connectors_res.scalar() or 0

        d = {**sub_lob.__dict__}
        d.pop("_sa_instance_state", None)
        d["team_count"] = team_count
        d["component_count"] = comp_count
        d["project_count"] = proj_count
        d["member_count"] = member_count
        d["total_connectors"] = total_connectors
        d["healthy_connectors"] = healthy_connectors
        return d

    async def update(self, db: AsyncSession, sub_lob_id: str, data: SubLobUpdate) -> Optional[SubLob]:
        sub_lob = await self.get_by_id(db, sub_lob_id)
        if not sub_lob:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(sub_lob, key, val)
        await db.flush()
        return sub_lob

    async def delete(self, db: AsyncSession, sub_lob_id: str) -> bool:
        sub_lob = await self.get_by_id(db, sub_lob_id)
        if not sub_lob:
            return False
        sub_lob.is_active = False
        await db.flush()
        return True

    async def assign_admin(self, db: AsyncSession, sub_lob_id: str, user_id: str) -> Optional[SubLobMember]:
        existing = await db.execute(
            select(SubLobMember).where(
                and_(SubLobMember.sub_lob_id == sub_lob_id, SubLobMember.user_id == user_id)
            )
        )
        member = existing.scalar_one_or_none()
        if member:
            member.role = "admin"
            await db.flush()
            return member
        member = SubLobMember(
            id=str(uuid.uuid4()),
            sub_lob_id=sub_lob_id,
            user_id=user_id,
            role="admin",
        )
        db.add(member)
        await db.flush()
        return member

    async def remove_admin(self, db: AsyncSession, sub_lob_id: str, user_id: str) -> bool:
        result = await db.execute(
            select(SubLobMember).where(
                and_(SubLobMember.sub_lob_id == sub_lob_id, SubLobMember.user_id == user_id, SubLobMember.role == "admin")
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return False
        await db.delete(member)
        await db.flush()
        return True

    async def get_admins(self, db: AsyncSession, sub_lob_id: str) -> List[dict]:
        result = await db.execute(
            select(SubLobMember, User).join(User, SubLobMember.user_id == User.id).where(
                and_(SubLobMember.sub_lob_id == sub_lob_id, SubLobMember.role == "admin")
            )
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

    async def get_members(self, db: AsyncSession, sub_lob_id: str) -> List[dict]:
        result = await db.execute(
            select(SubLobMember, User).join(User, SubLobMember.user_id == User.id).where(
                SubLobMember.sub_lob_id == sub_lob_id
            )
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


sub_lob_service = SubLobService()
