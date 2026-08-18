import base64
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.security import get_current_staff
from app.core.vision_ocr import VisionOcrError, extract_bill_fields
from app.models.phase2 import OcrExtractOut

router = APIRouter(prefix="/ocr", tags=["ocr"])


class OcrBase64In(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


@router.post("/bill", response_model=OcrExtractOut)
async def ocr_bill(
    staff: Annotated[dict, Depends(get_current_staff)],
    file: Annotated[UploadFile, File(...)],
) -> OcrExtractOut:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        fields = await extract_bill_fields(content, mime_type=file.content_type or "image/jpeg")
    except VisionOcrError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return OcrExtractOut(**{k: fields.get(k) for k in OcrExtractOut.model_fields})


@router.post("/bill-base64", response_model=OcrExtractOut)
async def ocr_bill_base64(
    payload: OcrBase64In,
    staff: Annotated[dict, Depends(get_current_staff)],
) -> OcrExtractOut:
    """JSON/Base64 alternative for mobile clients to avoid Android native multipart
    FormData streaming crashes."""
    raw_b64 = payload.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        content = base64.b64decode(raw_b64)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid base64 image data: {exc}")

    try:
        fields = await extract_bill_fields(content, mime_type=payload.mime_type or "image/jpeg")
    except VisionOcrError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return OcrExtractOut(**{k: fields.get(k) for k in OcrExtractOut.model_fields})
