"""Seed demo hubs, pincode routes and staff accounts.

Run from the backend/ directory (with the venv active and .env populated):
    python -m app.seed

Idempotent — safe to re-run. Existing rows are matched and skipped/reused
rather than duplicated, so you can run this again after tweaking data.
"""

import logging

from app.core.supabase_client import fetch_one, get_admin_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("locus.seed")

# Hyderabad-area coordinates so Haversine/geofence/TSP logic has something
# realistic to chew on later in the build.
HUBS = [
    {"name": "Gachibowli Sorting Center", "type": "SORTING_CENTER", "gps_lat": 17.4400, "gps_lng": 78.3489},
    {"name": "Hitec City Warehouse", "type": "WAREHOUSE", "gps_lat": 17.4485, "gps_lng": 78.3762},
    {"name": "Begumpet Hub", "type": "WAREHOUSE", "gps_lat": 17.4437, "gps_lng": 78.4482},
]

# pincode -> hub name (resolved to hub_id after hubs are inserted)
PINCODE_ROUTES = {
    "500032": "Gachibowli Sorting Center",
    "500019": "Gachibowli Sorting Center",
    "500081": "Hitec City Warehouse",
    "500084": "Hitec City Warehouse",
    "500016": "Begumpet Hub",
    "500003": "Begumpet Hub",
}

# phone -> (name, role, hub name or None)
STAFF = [
    ("+911000000001", "Anita Rao — Super Admin", "SUPER_ADMIN", None),
    ("+911000000002", "Vikram Shah — Hub Manager", "HUB_MANAGER", "Gachibowli Sorting Center"),
    ("+911000000003", "Farhan Ali — QR Paster", "QR_PASTER", "Gachibowli Sorting Center"),
    ("+911000000004", "Meera Iyer — Bill Scanner", "BILL_SCANNER", "Gachibowli Sorting Center"),
    ("+911000000005", "Arjun Reddy — Consolidator", "CONSOLIDATOR", "Gachibowli Sorting Center"),
    ("+911000000006", "Sunita Devi — Line-Haul Driver", "LINE_HAUL", "Gachibowli Sorting Center"),
    ("+911000000007", "Ravi Teja — Last-Mile Agent", "LAST_MILE", "Hitec City Warehouse"),
]


def upsert_hubs(admin) -> dict[str, str]:
    name_to_id: dict[str, str] = {}
    for hub in HUBS:
        existing = fetch_one(admin.table("hubs").select("id").eq("name", hub["name"]).maybe_single())
        if existing:
            name_to_id[hub["name"]] = existing["id"]
            log.info("hub already exists: %s", hub["name"])
            continue
        inserted = admin.table("hubs").insert(hub).execute()
        name_to_id[hub["name"]] = inserted.data[0]["id"]
        log.info("created hub: %s", hub["name"])
    return name_to_id


def upsert_pincode_routes(admin, name_to_id: dict[str, str]) -> None:
    for pincode, hub_name in PINCODE_ROUTES.items():
        existing = fetch_one(admin.table("pincode_routes").select("pincode").eq("pincode", pincode).maybe_single())
        if existing:
            continue
        admin.table("pincode_routes").insert(
            {"pincode": pincode, "destination_hub_id": name_to_id[hub_name]}
        ).execute()
        log.info("routed pincode %s -> %s", pincode, hub_name)


def get_or_create_auth_user(admin, phone: str) -> str:
    try:
        created = admin.auth.admin.create_user({"phone": phone, "phone_confirm": True})
        return created.user.id
    except Exception as exc:
        log.info("auth user for %s likely already exists (%s), looking it up", phone, exc)
        page = admin.auth.admin.list_users()
        for user in page:
            if getattr(user, "phone", None) == phone.lstrip("+"):
                return user.id
        raise RuntimeError(f"Could not create or find auth user for {phone}") from exc


def upsert_staff(admin, name_to_id: dict[str, str]) -> None:
    for phone, name, role, hub_name in STAFF:
        existing = fetch_one(admin.table("staff").select("id").eq("phone", phone).maybe_single())
        if existing:
            log.info("staff already exists: %s", name)
            continue

        user_id = get_or_create_auth_user(admin, phone)
        admin.table("staff").insert(
            {
                "id": user_id,
                "phone": phone,
                "name": name,
                "role": role,
                "assigned_hub_id": name_to_id[hub_name] if hub_name else None,
            }
        ).execute()
        log.info("created staff: %s (%s)", name, phone)


def main() -> None:
    admin = get_admin_client()
    name_to_id = upsert_hubs(admin)
    upsert_pincode_routes(admin, name_to_id)
    upsert_staff(admin, name_to_id)
    log.info("Seed complete. Demo login: any phone above + OTP code from DEMO_OTP_BYPASS_CODE in .env")


if __name__ == "__main__":
    main()
