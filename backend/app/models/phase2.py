from typing import Literal

from pydantic import BaseModel, Field

# ---- Digital Printer ----

PrinterType = Literal["PARCEL", "BAG"]


class PrinterGenerateIn(BaseModel):
    type: PrinterType
    count: int = Field(1, ge=1, le=100)


class PrinterItemOut(BaseModel):
    id: str  # tracking_id or bag_id, depending on `type`
    shortcode: str


class PrinterGenerateOut(BaseModel):
    type: PrinterType
    items: list[PrinterItemOut]


# ---- OCR ----


class OcrExtractOut(BaseModel):
    sender_name: str | None = None
    sender_phone: str | None = None
    recipient_name: str | None = None
    recipient_phone: str | None = None
    delivery_address: str | None = None
    delivery_pincode: str | None = None
    declared_value: float | None = None
    weight_grams: float | None = None


# ---- MSME lookup ----


class MsmeOut(BaseModel):
    id: str
    business_name: str
    owner_name: str | None
    phone: str
    pincode: str | None


# ---- Intake ----


class IntakeConfirmIn(BaseModel):
    recipient_name: str | None = None
    recipient_phone: str | None = None
    delivery_address: str | None = None
    delivery_pincode: str | None = None
    weight_grams: float | None = None
    declared_value: float | None = None
    msme_phone: str | None = None
    msme_business_name: str | None = None
    staff_lat: float | None = None
    staff_lng: float | None = None


class ShipmentOut(BaseModel):
    tracking_id: str
    shortcode: str
    status: str
    status_confidence: str
    recipient_name: str | None
    recipient_phone: str | None
    delivery_address: str | None
    delivery_pincode: str | None
    delivery_lat: float | None
    delivery_lng: float | None
    weight_grams: float | None
    declared_value: float | None
    tamper_seal_id: str | None
    condition_photo_urls: list[str]
    current_bag_id: str | None
    assigned_staff_id: str | None
    created_at: str


class ConditionPhotosOut(BaseModel):
    tracking_id: str
    condition_photo_urls: list[str]


# ---- Consolidation ----


class BagBindIn(BaseModel):
    destination_hub_id: str


class BagOut(BaseModel):
    bag_id: str
    shortcode: str
    origin_hub_id: str | None
    destination_hub_id: str | None
    expected_weight: float
    actual_weight: float | None
    status: str
    child_count: int


class ScanChildIn(BaseModel):
    tracking_id: str
    tamper_seal_id: str | None = None
    staff_lat: float | None = None
    staff_lng: float | None = None


class ScanChildOut(BaseModel):
    shipment: ShipmentOut
    bag_child_count: int


class DispatchIn(BaseModel):
    actual_weight: float = Field(..., gt=0)


class DispatchOut(BaseModel):
    bag: BagOut
    expected_weight: float
    actual_weight: float
    tolerance_pct: float
    diff_pct: float
    within_tolerance: bool
