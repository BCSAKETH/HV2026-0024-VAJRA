from typing import Literal

from pydantic import BaseModel

StaffRole = Literal["SUPER_ADMIN", "HUB_MANAGER", "WAREHOUSE_STAFF", "LINE_HAUL", "LAST_MILE"]

# Roles a Hub Manager is allowed to create/delete — operational floor staff
# for their own hub only. HUB_MANAGER and SUPER_ADMIN are never creatable by
# a Hub Manager, regardless of what's in the request — that's a privilege
# escalation path and is rejected server-side, not just hidden in the UI.
HUB_MANAGER_CREATABLE_ROLES = ("WAREHOUSE_STAFF", "LINE_HAUL", "LAST_MILE")


class StaffOut(BaseModel):
    id: str
    phone: str
    name: str | None
    role: StaffRole
    assigned_hub_id: str | None
    error_points: int
    created_at: str


class CreateStaffIn(BaseModel):
    phone: str
    name: str | None = None
    role: StaffRole
    assigned_hub_id: str | None = None
