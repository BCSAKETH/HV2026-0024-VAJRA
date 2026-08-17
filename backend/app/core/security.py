from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.supabase_client import get_admin_client

bearer_scheme = HTTPBearer(auto_error=False)


def create_session_token(staff_id: str, phone: str, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.APP_JWT_EXPIRE_MINUTES)
    payload = {"sub": staff_id, "phone": phone, "role": role, "exp": expire}
    return jwt.encode(payload, settings.APP_JWT_SECRET, algorithm=settings.APP_JWT_ALGORITHM)


def decode_session_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.APP_JWT_SECRET, algorithms=[settings.APP_JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc


async def get_current_staff(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    """Decodes the app-issued session JWT, then re-fetches the staff row so
    role/hub changes made by a Super Admin take effect immediately without
    requiring the staff member to log out and back in."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_session_token(credentials.credentials)
    staff_id = payload.get("sub")

    admin = get_admin_client()
    result = admin.table("staff").select("*").eq("id", staff_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff profile no longer exists")

    return result.data


def require_roles(*allowed_roles: str):
    async def _checker(staff: Annotated[dict, Depends(get_current_staff)]) -> dict:
        if staff["role"] not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not permitted for this action")
        return staff

    return _checker
