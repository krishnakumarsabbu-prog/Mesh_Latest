from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.base import get_db
from app.services.auth_service import auth_service
from app.services.rbac_service import rbac_service
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer()

ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}
SUPER_ADMIN_ROLES = {UserRole.SUPER_ADMIN}
LOB_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}
PROJECT_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}
TEAM_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}
READ_ONLY_ROLES = {UserRole.ANALYST, UserRole.VIEWER, UserRole.PROJECT_USER}


class TenantScopedSession:
    """Wraps AsyncSession and exposes tenant_id for downstream filtering."""

    def __init__(self, session: AsyncSession, tenant_id: str):
        self._session = session
        self.tenant_id = tenant_id

    def __getattr__(self, name):
        return getattr(self._session, name)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    user = await auth_service.get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    return user


async def get_tenant_db(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantScopedSession:
    """Returns a session wrapper with tenant_id pre-attached for scoped queries."""
    return TenantScopedSession(db, user.tenant_id or "default")


def require_roles(allowed: List[str]):
    """Dependency factory: rejects requests from users not in the allowed role list."""
    allowed_set = set(allowed)

    async def guard(user: User = Depends(get_current_user)) -> User:
        if user.role.value not in allowed_set:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return guard


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in SUPER_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return current_user


async def require_lob_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="LOB admin access required")
    return current_user


async def require_project_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in PROJECT_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project admin access required")
    return current_user


def check_permission(user: User, allowed_roles: set) -> bool:
    return user.role in allowed_roles


def require_permission(entity: str, action: str):
    async def _dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        has_perm = await rbac_service.user_has_permission(db, current_user.role.value, entity, action)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {entity}:{action}",
            )
        return current_user
    return _dependency


async def require_rbac_manage(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in {UserRole.SUPER_ADMIN, UserRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin or Admin can manage roles and permissions",
        )
    return current_user
