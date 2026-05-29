from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from app.models.component import Component
from app.models.team import Team
from app.models.project import Project
from app.schemas.component import ComponentCreate, ComponentUpdate
import uuid


class ComponentService:
    async def create(self, db: AsyncSession, data: ComponentCreate, user_id: str) -> Component:
        # Verify team exists
        team_result = await db.execute(select(Team).where(Team.id == data.team_id))
        team = team_result.scalar_one_or_none()
        if not team:
            raise ValueError("Team not found")
        if team.lob_id != data.lob_id:
            raise ValueError("Team does not belong to the selected LOB")

        # Verify slug uniqueness
        existing_result = await db.execute(select(Component).where(Component.slug == data.slug))
        if existing_result.scalar_one_or_none():
            raise ValueError("A component with this slug already exists")

        component = Component(
            id=str(uuid.uuid4()),
            name=data.name,
            slug=data.slug,
            description=data.description,
            color=data.color,
            icon=data.icon,
            lob_id=data.lob_id,
            team_id=data.team_id,
            created_by=user_id,
        )
        db.add(component)
        await db.flush()
        return component

    async def _enrich_component(self, db: AsyncSession, c: Component) -> dict:
        # Count projects belonging to this component
        project_count_result = await db.execute(
            select(func.count(Project.id)).where(Project.component_id == c.id)
        )
        
        team_name = None
        if c.team_id:
            team_result = await db.execute(select(Team).where(Team.id == c.team_id))
            team = team_result.scalar_one_or_none()
            team_name = team.name if team else None

        d = {**c.__dict__}
        d.pop("_sa_instance_state", None)
        d["project_count"] = project_count_result.scalar()
        d["team_name"] = team_name
        return d

    async def get_all(
        self, db: AsyncSession, lob_id: Optional[str] = None, team_id: Optional[str] = None
    ) -> List[dict]:
        q = select(Component)
        if lob_id:
            q = q.where(Component.lob_id == lob_id)
        if team_id:
            q = q.where(Component.team_id == team_id)

        result = await db.execute(q)
        components = result.scalars().all()
        output = []
        for c in components:
            output.append(await self._enrich_component(db, c))
        return output

    async def get_by_id(self, db: AsyncSession, component_id: str) -> Optional[Component]:
        result = await db.execute(select(Component).where(Component.id == component_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_counts(self, db: AsyncSession, component_id: str) -> Optional[dict]:
        component = await self.get_by_id(db, component_id)
        if not component:
            return None
        return await self._enrich_component(db, component)

    async def update(self, db: AsyncSession, component_id: str, data: ComponentUpdate) -> Optional[Component]:
        component = await self.get_by_id(db, component_id)
        if not component:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(component, key, val)
        await db.flush()
        return component

    async def delete(self, db: AsyncSession, component_id: str) -> bool:
        component = await self.get_by_id(db, component_id)
        if not component:
            return False
        # Set project.component_id to null for associated projects
        await db.execute(
            Project.__table__.update()
            .where(Project.component_id == component_id)
            .values(component_id=None)
        )
        await db.delete(component)
        await db.flush()
        return True


component_service = ComponentService()
