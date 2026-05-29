from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.base import get_db
from app.schemas.user import UserCreate, LoginRequest, TokenResponse, RefreshRequest, UserResponse, ChangePasswordRequest
from app.services.auth_service import auth_service, COOKIE_REFRESH
from app.services.audit_service import audit_service
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.register(db, data)
        from app.core.security import create_access_token, create_refresh_token
        access_token = create_access_token({"sub": user.id, "email": user.email, "role": user.role, "tenant": user.tenant_id})
        refresh_token = create_refresh_token({"sub": user.id})
        await audit_service.log(
            db, action="user.register", resource_type="user", resource_id=user.id,
            user_id=user.id, tenant_id=user.tenant_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            changes={"email": user.email, "role": str(user.role)},
        )
        return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        result = await auth_service.login(db, data)
        # Set JWT tokens in HTTP-only, Secure, SameSite=Lax cookies
        auth_service.set_auth_cookies(response, result.access_token, result.refresh_token)
        await audit_service.log(
            db, action="user.login", resource_type="user", resource_id=result.user.id,
            user_id=result.user.id, tenant_id=result.user.tenant_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    data: RefreshRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """Silent token renewal — accepts refresh token from JSON body or HTTP-only cookie."""
    token = (data.refresh_token if data and data.refresh_token else None) or request.cookies.get(COOKIE_REFRESH)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")
    try:
        result = await auth_service.refresh_tokens(db, token)
        auth_service.set_auth_cookies(response, result.access_token, result.refresh_token)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def logout(response: Response):
    """Clears HTTP-only auth cookies."""
    auth_service.clear_auth_cookies(response)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await auth_service.change_password(db, current_user, data.current_password, data.new_password)
        await audit_service.log(
            db, action="user.change_password", resource_type="user", resource_id=current_user.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
