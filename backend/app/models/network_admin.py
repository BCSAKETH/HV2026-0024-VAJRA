from typing import Literal

from pydantic import BaseModel


class CreateHubIn(BaseModel):
    name: str
    type: Literal["SORTING_CENTER", "WAREHOUSE"]
    gps_lat: float
    gps_lng: float


class HubOut(BaseModel):
    id: str
    name: str
    type: str
    gps_lat: float
    gps_lng: float


class CreatePincodeRouteIn(BaseModel):
    pincode: str
    destination_hub_id: str | None = None  # ignored for Hub Managers — forced to their own hub server-side


class PincodeRouteOut(BaseModel):
    pincode: str
    destination_hub_id: str
