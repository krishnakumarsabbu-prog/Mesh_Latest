from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from typing import List, Optional, Dict, Any
from app.models.rbac import Permission, RolePermission, ScopedRoleAssignment
from app.models.user import UserRole
import uuid

ENTITIES = [
    "users", "lobs", "teams", "projects", "connectors",
    "metrics", "dashboards", "monitoring_profiles", "analytics",
    "settings", "roles_permissions",
]

ACTIONS = ["create", "read", "update", "delete", "execute", "assign", "manage"]

ROLE_PERMISSION_MAP: Dict[str, List[tuple]] = {
    UserRole.SUPER_ADMIN.value: [
        (entity, action) for entity in ENTITIES for action in ACTIONS
    ],
    UserRole.ADMIN.value: [
        (entity, action) for entity in ENTITIES for action in ACTIONS
        if not (entity == "roles_permissions" and action in ("delete",))
    ],
    UserRole.LOB_ADMIN.value: [
        ("lobs", "read"), ("lobs", "update"), ("lobs", "manage"),
        ("teams", "create"), ("teams", "read"), ("teams", "update"), ("teams", "delete"), ("teams", "manage"),
        ("projects", "create"), ("projects", "read"), ("projects", "update"), ("projects", "delete"), ("projects", "manage"),
        ("users", "read"), ("users", "assign"),
        ("connectors", "create"), ("connectors", "read"), ("connectors", "update"), ("connectors", "delete"),
        ("metrics", "read"), ("metrics", "manage"),
        ("dashboards", "create"), ("dashboards", "read"), ("dashboards", "update"), ("dashboards", "delete"), ("dashboards", "assign"),
        ("monitoring_profiles", "read"), ("monitoring_profiles", "manage"),
        ("analytics", "read"),
        ("settings", "read"),
    ],
    UserRole.PROJECT_ADMIN.value: [
        ("projects", "read"), ("projects", "update"), ("projects", "manage"),
        ("teams", "read"),
        ("users", "read"), ("users", "assign"),
        ("connectors", "create"), ("connectors", "read"), ("connectors", "update"), ("connectors", "delete"), ("connectors", "execute"),
        ("metrics", "read"), ("metrics", "manage"),
        ("dashboards", "create"), ("dashboards", "read"), ("dashboards", "update"), ("dashboards", "delete"),
        ("monitoring_profiles", "read"), ("monitoring_profiles", "manage"),
        ("analytics", "read"),
        ("settings", "read"),
    ],
    UserRole.PROJECT_USER.value: [
        ("projects", "read"),
        ("connectors", "read"), ("connectors", "execute"),
        ("metrics", "read"),
        ("dashboards", "read"),
        ("monitoring_profiles", "read"),
        ("analytics", "read"),
    ],
    UserRole.ANALYST.value: [
        ("projects", "read"),
        ("lobs", "read"),
        ("teams", "read"),
        ("connectors", "read"),
        ("metrics", "read"),
        ("dashboards", "read"),
        ("monitoring_profiles", "read"),
        ("analytics", "read"),
    ],
    UserRole.VIEWER.value: [
        ("projects", "read"),
        ("lobs", "read"),
        ("teams", "read"),
        ("connectors", "read"),
        ("metrics", "read"),
        ("dashboards", "read"),
        ("monitoring_profiles", "read"),
        ("analytics", "read"),
    ],
}


class RbacService:
    async def seed_permissions(self, db: AsyncSession) -> None:
        result = await db.execute(select(Permission).limit(1))
        if result.scalars().first():
            return

        all_permissions: List[Permission] = []
        permission_lookup: Dict[tuple, str] = {}

        for entity in ENTITIES:
            for action in ACTIONS:
                perm_name = f"{entity}:{action}"
                perm = Permission(
                    id=str(uuid.uuid4()),
                    name=perm_name,
                    entity=entity,
                    action=action,
                    description=f"Can {action} {entity.replace('_', ' ')}",
                )
                all_permissions.append(perm)
                permission_lookup[(entity, action)] = perm.id

        db.add_all(all_permissions)
        await db.flush()

        role_perms: List[RolePermission] = []
        for role, pairs in ROLE_PERMISSION_MAP.items():
            for entity, action in pairs:
                perm_id = permission_lookup.get((entity, action))
                if perm_id:
                    role_perms.append(RolePermission(
                        id=str(uuid.uuid4()),
                        role=role,
                        permission_id=perm_id,
                    ))

        db.add_all(role_perms)
        await db.commit()

    async def get_all_permissions(self, db: AsyncSession) -> List[dict]:
        result = await db.execute(select(Permission).order_by(Permission.entity, Permission.action))
        perms = result.scalars().all()
        return [{"id": p.id, "name": p.name, "entity": p.entity, "action": p.action, "description": p.description} for p in perms]

    async def get_role_permissions(self, db: AsyncSession, role: str) -> List[str]:
        result = await db.execute(
            select(Permission.name)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role == role)
        )
        return list(result.scalars().all())

    async def get_role_permissions_matrix(self, db: AsyncSession) -> Dict[str, List[str]]:
        matrix: Dict[str, List[str]] = {}
        for role in UserRole:
            matrix[role.value] = await self.get_role_permissions(db, role.value)
        return matrix

    async def set_role_permissions(self, db: AsyncSession, role: str, permission_names: List[str]) -> List[str]:
        perm_result = await db.execute(
            select(Permission).where(Permission.name.in_(permission_names))
        )
        perms = perm_result.scalars().all()
        perm_ids = {p.id for p in perms}

        await db.execute(delete(RolePermission).where(RolePermission.role == role))

        new_rps = [
            RolePermission(id=str(uuid.uuid4()), role=role, permission_id=pid)
            for pid in perm_ids
        ]
        db.add_all(new_rps)
        await db.commit()
        return await self.get_role_permissions(db, role)

    async def user_has_permission(self, db: AsyncSession, user_role: str, entity: str, action: str) -> bool:
        result = await db.execute(
            select(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                and_(
                    RolePermission.role == user_role,
                    Permission.entity == entity,
                    Permission.action == action,
                )
            )
            .limit(1)
        )
        return result.scalars().first() is not None

    async def get_scoped_assignments(self, db: AsyncSession, user_id: str) -> List[dict]:
        result = await db.execute(
            select(ScopedRoleAssignment).where(
                and_(ScopedRoleAssignment.user_id == user_id, ScopedRoleAssignment.is_active == True)
            )
        )
        rows = result.scalars().all()
        return [
            {
                "id": r.id, "user_id": r.user_id, "role": r.role,
                "scope_type": r.scope_type, "scope_id": r.scope_id,
                "granted_by": r.granted_by, "is_active": r.is_active,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def get_all_scoped_assignments(self, db: AsyncSession, scope_type: Optional[str] = None, scope_id: Optional[str] = None) -> List[dict]:
        query = select(ScopedRoleAssignment).where(ScopedRoleAssignment.is_active == True)
        if scope_type:
            query = query.where(ScopedRoleAssignment.scope_type == scope_type)
        if scope_id:
            query = query.where(ScopedRoleAssignment.scope_id == scope_id)
        result = await db.execute(query)
        rows = result.scalars().all()
        return [
            {
                "id": r.id, "user_id": r.user_id, "role": r.role,
                "scope_type": r.scope_type, "scope_id": r.scope_id,
                "granted_by": r.granted_by, "is_active": r.is_active,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def create_scoped_assignment(
        self, db: AsyncSession, user_id: str, role: str,
        scope_type: str, scope_id: str, granted_by: str
    ) -> dict:
        existing = await db.execute(
            select(ScopedRoleAssignment).where(
                and_(
                    ScopedRoleAssignment.user_id == user_id,
                    ScopedRoleAssignment.role == role,
                    ScopedRoleAssignment.scope_type == scope_type,
                    ScopedRoleAssignment.scope_id == scope_id,
                )
            )
        )
        existing_row = existing.scalars().first()
        if existing_row:
            existing_row.is_active = True
            existing_row.granted_by = granted_by
            await db.commit()
            return {
                "id": existing_row.id, "user_id": existing_row.user_id,
                "role": existing_row.role, "scope_type": existing_row.scope_type,
                "scope_id": existing_row.scope_id, "granted_by": existing_row.granted_by,
                "is_active": existing_row.is_active,
                "created_at": existing_row.created_at.isoformat() if existing_row.created_at else None,
            }

        assignment = ScopedRoleAssignment(
            user_id=user_id, role=role,
            scope_type=scope_type, scope_id=scope_id,
            granted_by=granted_by, is_active=True,
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)
        return {
            "id": assignment.id, "user_id": assignment.user_id,
            "role": assignment.role, "scope_type": assignment.scope_type,
            "scope_id": assignment.scope_id, "granted_by": assignment.granted_by,
            "is_active": assignment.is_active,
            "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        }

    async def revoke_scoped_assignment(self, db: AsyncSession, assignment_id: str) -> bool:
        result = await db.execute(
            select(ScopedRoleAssignment).where(ScopedRoleAssignment.id == assignment_id)
        )
        row = result.scalars().first()
        if not row:
            return False
        row.is_active = False
        await db.commit()
        return True

    async def user_has_scope_access(
        self, db: AsyncSession, user_id: str, scope_type: str, scope_id: str
    ) -> bool:
        result = await db.execute(
            select(ScopedRoleAssignment).where(
                and_(
                    ScopedRoleAssignment.user_id == user_id,
                    ScopedRoleAssignment.scope_type == scope_type,
                    ScopedRoleAssignment.scope_id == scope_id,
                    ScopedRoleAssignment.is_active == True,
                )
            ).limit(1)
        )
        return result.scalars().first() is not None

    def get_permission_matrix_static(self) -> Dict[str, Any]:
        return {
            "entities": ENTITIES,
            "actions": ACTIONS,
            "role_permissions": ROLE_PERMISSION_MAP,
        }


rbac_service = RbacService()
