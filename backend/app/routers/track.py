from fastapi import APIRouter, HTTPException, status

from app.core.supabase_client import fetch_one, get_admin_client
from app.models.phase5 import TrackOut, TrackTimelineEvent

router = APIRouter(prefix="/track", tags=["track"])


@router.get("/{code}", response_model=TrackOut)
def public_track(code: str) -> TrackOut:
    """Public, unauthenticated — this is what powers /track/[id]. Deliberately
    hand-picks fields rather than returning the raw shipments row: no
    recipient_phone, no declared_value, no msme_id, no delivery_otp, no
    staff_id anywhere in the response. This is the ONLY way the public gets
    shipment data — there is no anon RLS policy on `shipments` at all.

    Looked up by `shortcode` first — a cryptographically random 6-char code
    (32^6 ≈ 1.07B combinations), not enumerable by incrementing a number the
    way the sequential tracking_id (TRK-000017, TRK-000018, ...) is. This is
    what every new SMS/QR links with. `tracking_id` is still accepted as a
    fallback purely so links already sent before this fix don't break."""
    admin = get_admin_client()
    shipment = fetch_one(admin.table("shipments").select("*").eq("shortcode", code.upper()).maybe_single())
    if not shipment:
        shipment = fetch_one(admin.table("shipments").select("*").eq("tracking_id", code).maybe_single())
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No shipment found for that tracking ID")
    tracking_id = shipment["tracking_id"]

    own_events = admin.table("tracking_events").select("*").eq("tracking_id", tracking_id).execute().data

    # A package's own event history only carries bag_id on the events that
    # also happen to be tracking_id-scoped (CONSOLIDATED, ARRIVED_AT_HUB,
    # AUTO_HEALED). DEPARTED is logged once per bag with no tracking_id —
    # pull those in too so "left the origin hub" actually shows up for the
    # customer, and so we can check every bag this package ever rode in for
    # a COMPROMISED (clone-attack) event, not just events tagged to it directly.
    bag_ids = {e["bag_id"] for e in own_events if e.get("bag_id")}
    if shipment.get("current_bag_id"):
        bag_ids.add(shipment["current_bag_id"])

    bag_departed_events: list[dict] = []
    compromised_on_bags: list[dict] = []
    if bag_ids:
        bag_departed_events = admin.table("tracking_events").select("*").in_("bag_id", list(bag_ids)).eq("event_type", "DEPARTED").execute().data
        compromised_on_bags = admin.table("tracking_events").select("id").in_("bag_id", list(bag_ids)).eq("event_type", "COMPROMISED").execute().data

    all_events = sorted(own_events + bag_departed_events, key=lambda e: e["created_at"])
    timeline = [TrackTimelineEvent(event_type=e["event_type"], lat=e.get("lat"), lng=e.get("lng"), created_at=e["created_at"]) for e in all_events]

    own_compromised = any(e["event_type"] == "COMPROMISED" for e in own_events)
    badge = "CLONE_ATTACK_DETECTED" if (own_compromised or compromised_on_bags) else "VERIFIED_GENUINE"

    return TrackOut(
        tracking_id=shipment["tracking_id"],
        status=shipment["status"],
        status_confidence=shipment["status_confidence"],
        recipient_name=shipment.get("recipient_name"),
        delivery_pincode=shipment.get("delivery_pincode"),
        condition_photo_urls=shipment.get("condition_photo_urls") or [],
        timeline=timeline,
        badge=badge,
        created_at=shipment["created_at"],
        delivered_at=shipment.get("delivered_at"),
    )
