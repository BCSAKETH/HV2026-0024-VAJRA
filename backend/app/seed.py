"""Seed the real hub network, pincode routes, and full per-hub staffing model
onto a fresh local dev database — mirrors exactly what's live in production.

Run from the backend/ directory (with the venv active and .env populated):
    python -m app.seed

Idempotent — safe to re-run. Existing rows are matched and skipped/reused
rather than duplicated, so you can run this again after tweaking data.
"""

import logging

from app.core.supabase_client import fetch_one, get_admin_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("locus.seed")

# The 5 real Hyderabad hubs, anchored on ORR/IRR for fast inter-hub trucking.
# Coordinates are live-verified against Nominatim (OSM), not guessed —
# they're the real locality centroids for Jeedimetla / Shamshabad /
# Patancheru / Cherlapally / Balanagar.
HUBS = [
    {"name": "North Hub — Jeedimetla", "type": "WAREHOUSE", "gps_lat": 17.5197, "gps_lng": 78.4469},
    {"name": "South Hub — Shamshabad", "type": "WAREHOUSE", "gps_lat": 17.2572, "gps_lng": 78.3451},
    {"name": "West Hub — Patancheru", "type": "WAREHOUSE", "gps_lat": 17.5286, "gps_lng": 78.2674},
    {"name": "East Hub — Cherlapally", "type": "WAREHOUSE", "gps_lat": 17.4687, "gps_lng": 78.6025},
    {"name": "Center Hub — Balanagar", "type": "SORTING_CENTER", "gps_lat": 17.4768, "gps_lng": 78.4220},
]

# pincode -> hub name. Real Hyderabad pincodes, each live-verified via
# Nominatim to actually sit in that hub's geographic zone.
PINCODE_ROUTES = {
    "500055": "North Hub — Jeedimetla",
    "500067": "North Hub — Jeedimetla",
    "501401": "North Hub — Jeedimetla",
    "501218": "South Hub — Shamshabad",
    "500052": "South Hub — Shamshabad",
    "500075": "South Hub — Shamshabad",
    "502319": "West Hub — Patancheru",
    "502032": "West Hub — Patancheru",
    "502300": "West Hub — Patancheru",
    "500098": "East Hub — Cherlapally",
    "500060": "East Hub — Cherlapally",
    "500074": "East Hub — Cherlapally",
    "500018": "Center Hub — Balanagar",
    "500037": "Center Hub — Balanagar",
    "500042": "Center Hub — Balanagar",
    "500016": "Center Hub — Balanagar",
    "500003": "Center Hub — Balanagar",
    "500019": "Center Hub — Balanagar",
    "500032": "Center Hub — Balanagar",
    "500081": "Center Hub — Balanagar",
    "500084": "Center Hub — Balanagar",
}

# Real per-hub staffing model: 1 Hub Manager, 1 QR Paster, 1 Bill Scanner,
# 1 Consolidator, 2 Truck Drivers, 5 Delivery Agents = 11 per hub, 55 total
# across the 5 hubs. Phone numbers use a readable +9190001-<hub><role><seq>
# scheme so a phone number alone tells you exactly who someone is.
ROLE_LABEL = {
    "HUB_MANAGER": "Hub Manager",
    "QR_PASTER": "QR Paster",
    "BILL_SCANNER": "Bill Scanner",
    "CONSOLIDATOR": "Consolidator",
    "LINE_HAUL": "Truck Driver",
    "LAST_MILE": "Delivery Agent",
}
ROLE_CODE = {"HUB_MANAGER": "01", "QR_PASTER": "02", "BILL_SCANNER": "03", "CONSOLIDATOR": "04", "LINE_HAUL": "05", "LAST_MILE": "06"}
FULL_ROSTER = [("HUB_MANAGER", 1), ("QR_PASTER", 1), ("BILL_SCANNER", 1), ("CONSOLIDATOR", 1), ("LINE_HAUL", 2), ("LAST_MILE", 5)]
HUB_CODE = {
    "North Hub — Jeedimetla": "01",
    "South Hub — Shamshabad": "02",
    "West Hub — Patancheru": "03",
    "East Hub — Cherlapally": "04",
    "Center Hub — Balanagar": "05",
}

_FIRST_NAMES = [
    "Srinivas", "Ramesh", "Suresh", "Prasad", "Naveen", "Kiran", "Praveen", "Manoj", "Rajesh", "Anil",
    "Vijay", "Sandeep", "Ashok", "Ravi", "Krishna", "Mahesh", "Ganesh", "Chandra Sekhar", "Bhaskar", "Venkatesh",
    "Satish", "Prakash", "Ramana", "Yadagiri", "Shiva Kumar", "Naresh", "Vinay", "Karthik", "Arjun", "Nagaraju",
    "Lakshmi", "Padma", "Swathi", "Priya", "Divya", "Sravani", "Anitha", "Kavitha", "Radha", "Meena",
    "Jyothi", "Vani", "Sudha", "Uma", "Latha", "Rani", "Sushma", "Pallavi", "Deepika", "Saritha",
    "Ramulu", "Yadamma", "Chinna",
]
_LAST_NAMES = ["Reddy", "Rao", "Naidu", "Goud", "Kumar", "Sharma", "Varma", "Chowdary", "Yadav", "Naik"]


def _build_staff_roster() -> list[tuple[str, str, str, str]]:
    """Generates the 55-person roster (phone, name, role, hub name) from
    FULL_ROSTER, applied identically to all 5 hubs."""
    roster = [("+911000000001", "Anita Rao — Super Admin", "SUPER_ADMIN", None)]
    name_i = 0
    for hub_name, hub_code in HUB_CODE.items():
        for role, count in FULL_ROSTER:
            for seq in range(1, count + 1):
                first = _FIRST_NAMES[name_i % len(_FIRST_NAMES)]
                last = _LAST_NAMES[(name_i // len(_FIRST_NAMES)) % len(_LAST_NAMES)]
                name_i += 1
                phone = f"+919000{hub_code}{ROLE_CODE[role]}{seq:02d}"
                name = f"{first} {last} — {ROLE_LABEL[role]} ({hub_name.split('—')[0].strip()})"
                roster.append((phone, name, role, hub_name))
    return roster


STAFF = _build_staff_roster()


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
    log.info("Seed complete: 5 hubs, %d pincode routes, %d staff. Demo login: any phone above + OTP code from DEMO_OTP_BYPASS_CODE in .env", len(PINCODE_ROUTES), len(STAFF))


if __name__ == "__main__":
    main()
