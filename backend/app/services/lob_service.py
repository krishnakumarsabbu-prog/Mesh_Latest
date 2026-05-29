from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from app.models.lob import Lob, LobMember
from app.models.project import Project
from app.models.user import User
from app.schemas.lob import LobCreate, LobUpdate
import uuid


class LobService:
    async def create(self, db: AsyncSession, data: LobCreate, user_id: str) -> Lob:
        lob = Lob(
            id=str(uuid.uuid4()),
            name=data.name,
            slug=data.slug,
            description=data.description,
            color=data.color,
            icon=data.icon,
            tenant_id=data.tenant_id,
            created_by=user_id,
        )
        db.add(lob)
        await db.flush()
        return lob

    async def get_all(self, db: AsyncSession, tenant_id: str) -> List[dict]:
        from app.models.team import Team
        from app.models.component import Component
        from app.models.connector import Connector, ConnectorStatus
        result = await db.execute(
            select(Lob).where(Lob.tenant_id == tenant_id, Lob.is_active == True)
        )
        lobs = result.scalars().all()
        output = []
        for lob in lobs:
            team_count = await db.execute(select(func.count(Team.id)).where(Team.lob_id == lob.id))
            component_count = await db.execute(select(func.count(Component.id)).where(Component.lob_id == lob.id))
            proj_count = await db.execute(select(func.count(Project.id)).where(Project.lob_id == lob.id))
            member_count = await db.execute(select(func.count(LobMember.id)).where(LobMember.lob_id == lob.id))
            # Connector health across all projects in this LOB
            total_connectors = await db.execute(
                select(func.count(Connector.id)).where(Connector.project_id.in_(
                    select(Project.id).where(Project.lob_id == lob.id)
                ))
            )
            healthy_connectors = await db.execute(
                select(func.count(Connector.id)).where(
                    Connector.project_id.in_(select(Project.id).where(Project.lob_id == lob.id)),
                    Connector.status == ConnectorStatus.HEALTHY
                )
            )
            d = {**lob.__dict__}
            d.pop("_sa_instance_state", None)
            d["team_count"] = team_count.scalar()
            d["component_count"] = component_count.scalar()
            d["project_count"] = proj_count.scalar()
            d["member_count"] = member_count.scalar()
            d["total_connectors"] = total_connectors.scalar()
            d["healthy_connectors"] = healthy_connectors.scalar()
            output.append(d)
        return output

    async def get_by_id(self, db: AsyncSession, lob_id: str) -> Optional[Lob]:
        result = await db.execute(select(Lob).where(Lob.id == lob_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_counts(self, db: AsyncSession, lob_id: str) -> Optional[dict]:
        from app.models.team import Team
        from app.models.component import Component
        from app.models.connector import Connector, ConnectorStatus
        lob = await self.get_by_id(db, lob_id)
        if not lob:
            return None
        team_count = await db.execute(select(func.count(Team.id)).where(Team.lob_id == lob.id))
        component_count = await db.execute(select(func.count(Component.id)).where(Component.lob_id == lob.id))
        proj_count = await db.execute(select(func.count(Project.id)).where(Project.lob_id == lob.id))
        member_count = await db.execute(select(func.count(LobMember.id)).where(LobMember.lob_id == lob.id))
        total_connectors = await db.execute(
            select(func.count(Connector.id)).where(Connector.project_id.in_(
                select(Project.id).where(Project.lob_id == lob.id)
            ))
        )
        healthy_connectors = await db.execute(
            select(func.count(Connector.id)).where(
                Connector.project_id.in_(select(Project.id).where(Project.lob_id == lob.id)),
                Connector.status == ConnectorStatus.HEALTHY
            )
        )
        d = {**lob.__dict__}
        d.pop("_sa_instance_state", None)
        d["team_count"] = team_count.scalar()
        d["component_count"] = component_count.scalar()
        d["project_count"] = proj_count.scalar()
        d["member_count"] = member_count.scalar()
        d["total_connectors"] = total_connectors.scalar()
        d["healthy_connectors"] = healthy_connectors.scalar()
        return d

    async def update(self, db: AsyncSession, lob_id: str, data: LobUpdate) -> Optional[Lob]:
        lob = await self.get_by_id(db, lob_id)
        if not lob:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(lob, key, val)
        await db.flush()
        return lob

    async def delete(self, db: AsyncSession, lob_id: str) -> bool:
        lob = await self.get_by_id(db, lob_id)
        if not lob:
            return False
        lob.is_active = False
        await db.flush()
        return True

    async def assign_admin(self, db: AsyncSession, lob_id: str, user_id: str) -> Optional[LobMember]:
        existing = await db.execute(
            select(LobMember).where(
                and_(LobMember.lob_id == lob_id, LobMember.user_id == user_id)
            )
        )
        member = existing.scalar_one_or_none()
        if member:
            member.role = "admin"
            await db.flush()
            return member
        member = LobMember(
            id=str(uuid.uuid4()),
            lob_id=lob_id,
            user_id=user_id,
            role="admin",
        )
        db.add(member)
        await db.flush()
        return member

    async def remove_admin(self, db: AsyncSession, lob_id: str, user_id: str) -> bool:
        result = await db.execute(
            select(LobMember).where(
                and_(LobMember.lob_id == lob_id, LobMember.user_id == user_id, LobMember.role == "admin")
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return False
        await db.delete(member)
        await db.flush()
        return True

    async def get_admins(self, db: AsyncSession, lob_id: str) -> List[dict]:
        result = await db.execute(
            select(LobMember, User).join(User, LobMember.user_id == User.id).where(
                and_(LobMember.lob_id == lob_id, LobMember.role == "admin")
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

    async def get_members(self, db: AsyncSession, lob_id: str) -> List[dict]:
        result = await db.execute(
            select(LobMember, User).join(User, LobMember.user_id == User.id).where(
                LobMember.lob_id == lob_id
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


lob_service = LobService()
