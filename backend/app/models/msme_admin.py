from pydantic import BaseModel

from app.models.phase2 import ShipmentOut


class MsmeSummaryOut(BaseModel):
    id: str
    business_name: str
    owner_name: str | None
    phone: str
    pincode: str | None
    shipment_count: int
    first_shipped_at: str | None
    created_at: str


class MsmeDetailOut(BaseModel):
    id: str
    business_name: str
    owner_name: str | None
    phone: str
    pincode: str | None
    created_at: str
    total_shipments: int
    total_value: float
    delivered_count: int
    rto_count: int
    shipments: list[ShipmentOut]
