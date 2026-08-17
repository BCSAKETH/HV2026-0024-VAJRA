import secrets

from app.core.supabase_client import fetch_one, get_admin_client

# No ambiguous characters (0/O, 1/I) — this code gets read off a torn label by
# a warehouse worker under time pressure (Defense 5's mutilated-QR fallback).
_SHORTCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_shortcode() -> str:
    return "".join(secrets.choice(_SHORTCODE_ALPHABET) for _ in range(6))


def _unique_shortcode(table: str) -> str:
    admin = get_admin_client()
    for _ in range(10):
        code = generate_shortcode()
        existing = fetch_one(admin.table(table).select("shortcode").eq("shortcode", code).maybe_single())
        if not existing:
            return code
    raise RuntimeError(f"Could not generate a unique shortcode for {table} after 10 attempts")


def next_tracking_id() -> str:
    admin = get_admin_client()
    result = admin.rpc("next_tracking_id").execute()
    return result.data


def next_bag_id() -> str:
    admin = get_admin_client()
    result = admin.rpc("next_bag_id").execute()
    return result.data


def new_shipment_ids() -> tuple[str, str]:
    return next_tracking_id(), _unique_shortcode("shipments")


def new_bag_ids() -> tuple[str, str]:
    return next_bag_id(), _unique_shortcode("master_bags")
