from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import get_current_staff
from app.core.supabase_client import get_admin_client

router = APIRouter(prefix="/hubs", tags=["hubs"])


class HubOut(BaseModel):
    id: str
    name: str
    type: str
    gps_lat: float
    gps_lng: float


@router.get("", response_model=list[HubOut])
def list_hubs(staff: Annotated[dict, Depends(get_current_staff)]) -> list[HubOut]:
    admin = get_admin_client()
    result = admin.table("hubs").select("*").order("name").execute()
    return [HubOut(**row) for row in result.data]
