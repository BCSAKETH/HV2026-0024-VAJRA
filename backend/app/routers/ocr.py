from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.vision_ocr import VisionOcrError, extract_bill_fields
from app.core.security import get_current_staff
from app.models.phase2 import OcrExtractOut

router = APIRouter(prefix="/ocr", tags=["ocr"])


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
        # Never a hard failure for the caller's flow — the mobile app falls
        # back to its manual entry form on any 4xx/5xx here.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return OcrExtractOut(**{k: fields.get(k) for k in OcrExtractOut.model_fields})
