"""Live smoke test for the external integrations wired into app/core:
Nominatim (geocoding), OSRM (routing), Fast2SMS (the active SMS provider),
and Twilio (dormant — kept working, no longer called from the app's real
send flows; see app/core/twilio_whatsapp.py for why).

Exercises the actual app.core functions against the real public endpoints —
not mocks — so a pass here means the app's own code, not a reimplementation
of it, really works. Run from anywhere; it locates the repo's .env itself.

Usage:
    python scripts/verify_integrations.py
    python scripts/verify_integrations.py --sms-to +91XXXXXXXXXX
    python scripts/verify_integrations.py --sms-to +91XXXXXXXXXX --twilio-to +91XXXXXXXXXX

--sms-to sends one real SMS via Fast2SMS (route=q). Note this route is
gated behind a real >=100 INR wallet top-up on Fast2SMS's side regardless
of trial status (confirmed live) — until that's cleared, expect a clean
FAIL with the exact reason printed, not a crash.

--twilio-to additionally sends through the dormant Twilio path, useful only
if you're checking whether that account's trial restriction has lifted.
Omit both to only verify credentials/wallet state, with nothing sent.
"""

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_REPO_ROOT / ".env", override=True)

import httpx  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.fast2sms import send_sms  # noqa: E402
from app.core.geocode import geocode_address  # noqa: E402
from app.core.osrm import get_route  # noqa: E402
from app.core.twilio_whatsapp import _basic_auth, send_whatsapp  # noqa: E402

PASS, FAIL, SKIP = "\033[32mPASS\033[0m", "\033[31mFAIL\033[0m", "\033[33mSKIP\033[0m"

# Two real Hyderabad points (matches the demo hubs seeded by app/seed.py) —
# far enough apart that a straight line and a real driving route visibly
# differ, which is the whole point of checking OSRM specifically.
GACHIBOWLI = (17.4401, 78.3489)
HITEC_CITY = (17.4483, 78.3915)


async def check_nominatim() -> bool:
    print("\n== Nominatim (geocoding) ==")
    result = await geocode_address("Gachibowli, Hyderabad", "500032")
    if result is None:
        print(f"{FAIL} geocode_address returned None — no match or request failed")
        return False
    lat, lng = result
    print(f"  'Gachibowli, Hyderabad, 500032' -> ({lat}, {lng})")
    # Loose Hyderabad bounding box — proves it's a real, plausible geocode,
    # not just "some number came back".
    if not (17.2 <= lat <= 17.7 and 78.2 <= lng <= 78.7):
        print(f"{FAIL} result is outside the expected Hyderabad bounding box")
        return False
    print(f"{PASS} Nominatim resolved a plausible Hyderabad coordinate")
    return True


async def check_osrm() -> bool:
    print("\n== OSRM (routing/directions) ==")
    route = await get_route([GACHIBOWLI, HITEC_CITY])
    if route is None:
        print(f"{FAIL} get_route returned None — OSRM unreachable or no road path found")
        return False
    km = route["distance_m"] / 1000
    minutes = route["duration_s"] / 60
    points = len(route["geometry"])
    print(f"  Gachibowli -> Hitec City: {km:.2f} km, ~{minutes:.1f} min, {points}-point road geometry")
    if route["distance_m"] <= 0 or route["duration_s"] <= 0 or points < 2:
        print(f"{FAIL} route came back with non-physical values")
        return False
    print(f"{PASS} OSRM returned a real driving route")
    return True


async def check_fast2sms(send_to: str | None) -> bool:
    print("\n== Fast2SMS (SMS — active provider) ==")
    settings = get_settings()
    if not settings.FAST2SMS_API_KEY:
        print(f"{SKIP} FAST2SMS_API_KEY is not set")
        return True

    # Wallet lookup costs nothing and proves the key authenticates, without
    # needing a recipient number.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://www.fast2sms.com/dev/wallet", headers={"authorization": settings.FAST2SMS_API_KEY})
    except Exception as exc:
        print(f"{FAIL} wallet lookup raised: {exc}")
        return False
    if resp.status_code != 200 or not resp.json().get("return"):
        print(f"{FAIL} Fast2SMS auth failed ({resp.status_code}): {resp.text[:300]}")
        return False
    wallet = resp.json()
    print(f"  Authenticated — wallet balance: INR {wallet.get('wallet')}, sms_count: {wallet.get('sms_count')}")
    print(f"{PASS} Fast2SMS credentials authenticate")

    if not send_to:
        print(f"{SKIP} No --sms-to given — skipping an actual send")
        return True

    print(f"  Sending the app's real message content (send_sms, route=q custom text) to {send_to} ...")
    ok = await send_sms(send_to, "LOCUS: this is a live integration test message. If you got this, SMS sending is wired up correctly.")
    if ok:
        print(f"{PASS} Fast2SMS accepted the app's real message content for delivery to {send_to}")
        return True

    print(f"{FAIL} send_sms returned False — most likely Fast2SMS's real->=100 INR wallet top-up gate on route=q")
    print("  (confirmed live: even with free trial credits sitting in the wallet, route=q refuses to")
    print("  fire without a real paid top-up first — this is a Fast2SMS account-tier restriction,")
    print("  not a bug in the app; send_sms is ready and will work the moment that's cleared)")
    return False


async def check_twilio(send_to: str | None) -> bool:
    print("\n== Twilio (WhatsApp — dormant, kept working) ==")
    settings = get_settings()
    auth = _basic_auth(settings)

    if not settings.TWILIO_ACCOUNT_SID:
        print(f"{SKIP} TWILIO_ACCOUNT_SID is not set — nothing to authenticate against")
        return True
    if not auth:
        print(f"{SKIP} No credential configured (need TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)")
        return True

    # Auth handshake: fetch the account resource. Costs nothing, sends
    # nothing — just proves the SID/secret pair still authenticates.
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}.json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, auth=auth)
    except Exception as exc:
        print(f"{FAIL} request to Twilio raised: {exc}")
        return False

    if resp.status_code != 200:
        print(f"{FAIL} Twilio auth handshake failed ({resp.status_code}): {resp.text[:300]}")
        return False
    body = resp.json()
    print(f"  Authenticated as account: {body.get('friendly_name')!r} (status={body.get('status')})")
    print(f"{PASS} Twilio credentials authenticate")

    if not send_to:
        print(f"{SKIP} No --twilio-to given — skipping an actual send (this path is dormant by design)")
        return True
    if not settings.TWILIO_WHATSAPP_FROM:
        print(f"{SKIP} TWILIO_WHATSAPP_FROM not set — can't send even though --twilio-to was given")
        return True

    print(f"  Sending the app's real message content (send_whatsapp, freeform Body) to {send_to} ...")
    ok = await send_whatsapp(send_to, "LOCUS: this is a live integration test message. If you got this, WhatsApp sending is wired up correctly.")
    if ok:
        print(f"{PASS} Twilio accepted the app's real message content for delivery to {send_to}")
        return True

    print(f"{FAIL} freeform Body send failed — likely still the trial Content-Template restriction (error 21654)")
    print("  Not fixable from here; not testing further since this path is dormant by design.")
    return False


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sms-to", default=None, help="Indian mobile number (e.g. +91XXXXXXXXXX) to send one real test SMS to via Fast2SMS")
    parser.add_argument("--twilio-to", default=None, help="WhatsApp-joined phone number to additionally test the dormant Twilio path")
    args = parser.parse_args()

    results = {
        "Nominatim": await check_nominatim(),
        "OSRM": await check_osrm(),
        "Fast2SMS": await check_fast2sms(args.sms_to),
    }
    if args.twilio_to:
        results["Twilio (dormant)"] = await check_twilio(args.twilio_to)
    else:
        await check_twilio(None)

    print("\n== Summary ==")
    for name, ok in results.items():
        print(f"  {name}: {PASS if ok else FAIL}")

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
