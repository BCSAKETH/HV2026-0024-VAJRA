from typing import Literal

from pydantic import BaseModel, Field

StaffRole = Literal["SUPER_ADMIN", "HUB_MANAGER", "WAREHOUSE_STAFF", "LINE_HAUL", "LAST_MILE"]


class RequestOtpIn(BaseModel):
    phone: str = Field(..., description="E.164 format, e.g. +919876543210")


class RequestOtpOut(BaseModel):
    message: str
    demo_bypass_available: bool


class VerifyOtpIn(BaseModel):
    phone: str
    token: str = Field(..., description="6-digit SMS code, or the demo bypass code")


class StaffProfile(BaseModel):
    id: str
    phone: str
    name: str | None
    role: StaffRole
    assigned_hub_id: str | None
    error_points: int


class VerifyOtpOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    staff: StaffProfile
