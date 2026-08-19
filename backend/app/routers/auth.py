import logging
from datetime import datetime, timezone
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


@router.get("/me")
def me(staff: Annotated[dict, Depends(get_current_staff)]) -> StaffProfile:
    return StaffProfile(**staff)


@router.get("/me/activity")
def me_activity(staff: Annotated[dict, Depends(get_current_staff)]) -> dict:
    """Self-service activity feed — any authenticated staff member can call
    this on themselves (unlike /admin/staff/{id}/manifest, which is
    Hub-Manager/Super-Admin only). Backed by the real tracking_events
    ledger, not a device-local store, so the numbers survive a reinstall
    or a swap to a different phone -- same reasoning as Defense 10's
    handover design."""
    admin = get_admin_client()

    events_res = (
        admin.table("tracking_events")
        .select("*")
        .eq("staff_id", staff["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    events = events_res.data or []

    # today_count/total_count must NOT be len(events) or a raw row count --
    # `events` is capped at 50 for the feed display (would silently plateau
    # forever for anyone with more history), and a raw tracking_events count
    # over-counts: one package's lifecycle (e.g. CLAIMED -> OUT_FOR_DELIVERY
    # -> DELIVERED) logs several separate ledger rows against the same
    # staff_id -- confirmed live, one delivered package inflated the count
    # by 4, not 1. Both stats must reflect distinct packages/bags touched,
    # deduped by tracking_id where present, else bag_id (covers bag-side-only
    # events like a Line-Haul driver's DEPARTED/ARRIVED_AT_HUB, which carry
    # no tracking_id at all).
    def _distinct_touch_count(gte_date: str | None = None) -> int:
        query = admin.table("tracking_events").select("tracking_id,bag_id").eq("staff_id", staff["id"])
        if gte_date:
            query = query.gte("created_at", gte_date)
        rows = query.execute().data
        ids = {r.get("tracking_id") or r.get("bag_id") for r in rows if r.get("tracking_id") or r.get("bag_id")}
        return len(ids)

    total_count = _distinct_touch_count()
    today_count = _distinct_touch_count(datetime.now(timezone.utc).date().isoformat())

    staff_row = fetch_one(admin.table("staff").select("error_points").eq("id", staff["id"]).maybe_single())
    error_points = staff_row.get("error_points", 0) if staff_row else staff.get("error_points", 0)

    return {
        "stats": {
            "today_count": today_count,
            "total_count": total_count,
            "error_points": error_points,
        },
        "events": events,
    }

