import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.security import create_session_token, get_current_staff
from app.core.supabase_client import fetch_one, get_admin_client, get_anon_client
from app.models.schemas import RequestOtpIn, RequestOtpOut, StaffProfile, VerifyOtpIn, VerifyOtpOut

logger = logging.getLogger("locus.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _get_staff_by_phone(phone: str) -> dict:
    admin = get_admin_client()
    result = fetch_one(admin.table("staff").select("*").eq("phone", phone).maybe_single())
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This number isn't registered as LOCUS staff. Ask a Super Admin to add you.",
        )
    return result


@router.post("/request-otp", response_model=RequestOtpOut)
def request_otp(payload: RequestOtpIn) -> RequestOtpOut:
    settings = get_settings()
    # Staff accounts are pre-seeded, not self-registered — reject unknown numbers early.
    _get_staff_by_phone(payload.phone)

    try:
        get_anon_client().auth.sign_in_with_otp({"phone": payload.phone})
        message = "OTP sent via SMS."
    except Exception as exc:  # pragma: no cover - depends on Supabase SMS provider config
        # Don't hard-fail the demo if no SMS provider is wired up yet — the
        # demo bypass code still lets staff log in.
        logger.warning("Supabase OTP send failed for %s: %s", payload.phone, exc)
        message = "Could not send a real SMS right now."

    return RequestOtpOut(message=message, demo_bypass_available=bool(settings.DEMO_OTP_BYPASS_CODE))


@router.post("/verify-otp", response_model=VerifyOtpOut)
def verify_otp(payload: VerifyOtpIn) -> VerifyOtpOut:
    settings = get_settings()
    staff = _get_staff_by_phone(payload.phone)

    is_demo_bypass = bool(settings.DEMO_OTP_BYPASS_CODE) and payload.token == settings.DEMO_OTP_BYPASS_CODE

    if not is_demo_bypass:
        try:
            get_anon_client().auth.verify_otp({"phone": payload.phone, "token": payload.token, "type": "sms"})
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired OTP") from exc

    access_token = create_session_token(staff_id=staff["id"], phone=staff["phone"], role=staff["role"])
    return VerifyOtpOut(access_token=access_token, staff=StaffProfile(**staff))


@router.get("/me", response_model=StaffProfile)
def me(staff: Annotated[dict, Depends(get_current_staff)]) -> StaffProfile:
    return StaffProfile(**staff)
