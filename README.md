# LOCUS — The Exact Point of Truth

A State-Aware 3PL Logistics Operating System for MSMEs: QR-based product tracking, inventory movement between hubs, and full-chain supply chain traceability.

Monorepo:
- `/web` — Next.js (App Router) admin dashboard, Digital Printer, and the public `/track/[id]` page.
- `/mobile` — one Expo app, role-routed. A single login; the screens shown depend on the logged-in staff member's `role`.
- `/backend` — FastAPI. Every client (web and mobile) talks only to this — it holds the Supabase service-role key and is the sole authorization layer.
- `/supabase/migrations` — SQL schema, enums, RLS policies, the immutable-ledger trigger, and the storage bucket.

No Docker. Everything runs natively.

---

## 0. One-time Supabase setup

1. Create a project at supabase.com (or via the Supabase MCP tools if you're doing this through Claude).
2. Open the SQL editor and run, in order: `0001_init.sql`, `0002_phase2_printer_and_photos.sql`, `0003_phase5_realtime.sql`.
3. Project Settings → API: copy the **Project URL**, **anon public key**, and **service_role key** — you'll need all three for `backend/.env`.
4. Authentication → Sign In / Providers: enable **Phone**. You don't need a real SMS provider wired up to demo — the `000000` bypass code covers that — but the phone provider toggle needs to be on for the schema/auth wiring to make sense.

## 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on WSL/macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # fill in SUPABASE_URL / keys from step 0
python -m app.seed              # creates demo hubs, pincode routes, and one staff account per role
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for the interactive API docs. `/health` should return `{"status": "ok"}`.

**Demo login numbers** (after seeding, OTP code = whatever you set `DEMO_OTP_BYPASS_CODE` to, default `000000`):

| Phone | Role |
|---|---|
| `+911000000001` | Super Admin |
| `+911000000002` | Hub Manager (Gachibowli) |
| `+911000000003` | Warehouse Staff — Intake & Consolidation (Gachibowli) |
| `+911000000004` | Line-Haul Driver (Gachibowli) |
| `+911000000005` | Last-Mile Agent (Hitec City) |

## 2. Web (Next.js)

```bash
cd web
npm install     # already run once during setup
cp .env.local.example .env.local
npm run dev
```

Runs at `http://localhost:3000`.

## 3. Mobile (Expo)

```bash
cd mobile
npm install     # already run once during setup
cp .env.example .env
npx expo start
```

Scan the QR with Expo Go (Android) or the Camera app (iOS), or press `a`/`i` for an emulator. Log in with any demo phone number above + the bypass code.

---

## Design system

Warm Ivory `#F8F5EF` background · Deep Navy `#172B3A` text · Cobalt-Indigo `#4F46E5` primary actions · Burnt Orange `#E76F2F` active scans/warehouse actions · Muted Sage `#6B8F71` success · Brick-Red `#B84A3A` errors/quarantine. Newsreader (serif headings) + IBM Plex Sans (body) + IBM Plex Mono (all IDs/timestamps/scan codes). Defined once in `web/tailwind.config.ts` and `mobile/tailwind.config.js` — keep them in sync.

## Architecture notes worth knowing before you touch Phase 2+

- **RLS is defense-in-depth, not the primary gate.** All real authorization happens in FastAPI (`app/core/security.py`). The SQL policies in the migration exist so that nothing catastrophic happens even if something ever queries Supabase directly with a user token.
- **Public tracking (`/track/[id]`) is served by FastAPI**, using the service-role key, returning a hand-picked safe subset of fields. There is deliberately no public/anon SELECT policy on `shipments` or `tracking_events` — don't add one; route new public data needs through a FastAPI endpoint instead.
- **Staff auth is app-issued JWTs**, not raw Supabase sessions. `/auth/verify-otp` confirms the phone (or accepts the demo bypass code) and then FastAPI mints its own short-lived JWT embedding `staff.id`/`role`. Mobile/web store that token and send it as `Authorization: Bearer <token>` on every request.
- **Fast2SMS is for consumers only** (SMS receipts + delivery OTP) — never for staff login. Custom-text sends (`route=q`) need a real ≥100 INR Fast2SMS wallet top-up before they're unlocked, regardless of trial status — top up before presenting, or expect sends to fail closed. Twilio (WhatsApp) is still in the codebase but dormant — swapped out because its trial tier requires an approved Content Template to send anything, and the API needed to create one is itself blocked on trial accounts; see `app/core/twilio_whatsapp.py` and `app/core/fast2sms.py`.
- **`tracking_events` cannot be UPDATE'd or DELETE'd**, enforced by a Postgres trigger — this holds even for the backend's service-role key. Corrections must be new events, never edits.
- **Roles**: Role 1A (Intake) and Role 1B (Consolidation) share a single `WAREHOUSE_STAFF` role — one worker, two tabs in the app — rather than being two separate roles. Adjust `staff_role` in the migration if you'd rather split them.
- **`delivery_lat`/`delivery_lng` come from geocoding the bill's address via Nominatim (OSM), not from Groq.** Groq's vision OCR only ever returns text fields (`name`, `phone`, `pincode`, `price`, `address`) — coordinates are a separate backend step, built in Phase 2.
- Verify `GROQ_VISION_MODEL` in `.env` is still a live model in Groq's console before Phase 2 — preview vision models get renamed/retired.

## Phase 2 — what's live now

- **Digital Printer** (`web/printer`, behind staff login): two tabs, generates batches of `TRK-######` or `BAG-######` QR codes with their 6-digit shortcode fallback printed underneath. IDs come from Postgres sequences (`0002` migration), never from counting rows, so concurrent batches can't collide.
- **Intake (Role 1A)**: `mobile` → log in as `WAREHOUSE_STAFF` → Intake tab. Scan a blank parcel QR → photograph the bill (Groq Vision OCR extracts name/phone/address/pincode/value — manual entry is the fallback, always editable) → 2 proof-of-condition photos → confirm. Confirming geocodes the address via Nominatim (never from Groq — OCR can't know coordinates), fires the Twilio WhatsApp receipt, and writes the `INTAKE` ledger event.
- **Consolidation (Role 1B)**: same app, Consolidate tab. Scan a blank bag QR → bottom drawer to pick the destination hub → scan children in, with a real per-frame bounding box (from `expo-camera`'s reported bounds, not a fake static square) drawn around whatever QR is in frame. Defense 1 (pincode collision) and Defense 2 (tamper seal on >₹5,000 parcels) are enforced backend-side and surfaced as a red flash + vibration or a blocking modal. Weigh-and-dispatch runs Defense 3's ±1.5% tolerance engine with a live progress bar; the bag only seals if the backend agrees the physical weight matches.
- One thing I can't verify from here: the bounding-box overlay's coordinates are documented by Expo as pre-adjusted to the camera view's own rendered size, so no manual scaling should be needed — but it's worth a quick look on a real device before the demo, since I have no physical camera to test against in this environment.

## Phase 3 — what's live now

- **Line-Haul (Role 2)**: `mobile` → log in as `LINE_HAUL` → lands on the bag scanner. Scanning a `SEALED` bag departs it (`IN_TRANSIT`, assigned to the driver); scanning an `IN_TRANSIT` bag arrives it at the hub.
- **Defense 4 (Transit Leakage)**: arrival bulk-flips every child in the bag to `ASSUMED_AT_HUB` / `SOFT` confidence and writes one ledger event per child, not just one event for the bag — so each package's own `/track` timeline shows the hub arrival too.
- **Defense 5 (Mutilated QR + Soft Audit)**: typing the bag's shortcode instead of scanning it flags the arrival as `via_shortcode`. If the driver doesn't then physically scan at least 3 (or however many the bag actually has, if fewer) of its real children, the backend rejects the arrival with `SOFT_AUDIT_REQUIRED` — the app enforces this by not offering an "Arrive" outcome until enough children are proven, live-verified against a mocked DB response before shipping (teleport case, normal-speed case, no-prior-event case, no-GPS case, and the zero-distance/zero-time edge case all check out).
- **Defense 6 (Haversine Anti-Clone Engine)**: runs on every depart/arrive scan, live and from the offline sync path alike. A speed above 1000 km/h since the bag's last located event rejects the scan and writes a `COMPROMISED` ledger entry instead.
- **Split-Brain Fix (offline mode)**: a global brick-red "Offline Mode" banner (root layout, so it's visible from any screen, not just Line-Haul) appears the moment connectivity drops. Depart/arrive actions taken offline are queued in AsyncStorage with the on-device timestamp and replayed through `POST /sync/bag-events` on reconnect; the backend discards any cached action whose timestamp is older than the bag's latest DB event rather than replaying stale state over newer reality.
- Depart/arrive share their core logic (`app/routers/linehaul.py`'s `_depart_bag`/`_arrive_bag`) between the live endpoints and the sync-replay path — one implementation, so the offline path can't silently drift from what the live scan does.

## Phase 4 — what's live now

- **Last-Mile (Role 3)**: `mobile` → log in as `LAST_MILE`. On entry the app always checks `GET /agent/manifest` first — if you have packages already `OUT_FOR_DELIVERY`, you land straight on the manifest (Defense 10: swap devices, log in, resume exactly where the last one left off — no separate handover step, it's just a query keyed on `staff.id`). Otherwise you land on the claim screen: unseal an arrived bag, scan children to claim them (`SOFT`→`HARD`), tap "Proceed to Deliver" to lock the manifest.
- **Defense 7 (Stowaway Self-Healing)**: scanning a child that isn't recorded in the bag you're holding checks whether it was actually supposed to arrive at this hub (via `pincode_routes`) — if yes, it self-heals `current_bag_id` onto the bag you're physically holding and dings `+1 error_points` on whoever consolidated it into the wrong bag in Phase 2; if the package genuinely belongs elsewhere, it's rejected instead of blindly reassigned, so a real misroute can't get auto-"fixed" into the wrong truck.
- **Twilio Webhook 2**: "Proceed to Deliver" generates a 4-digit OTP per package and fires the WhatsApp ETA+OTP message — verified against the mocked routing/grouping logic below, and reusing the same best-effort Twilio wrapper from Phase 2 (a failed send never blocks the manifest lock).
- **Defense 8 (TSP + Multi-Drop)**: `GET /agent/manifest` groups shipments sharing near-identical coordinates into one stop and orders stops by greedy nearest-neighbor from the agent's live position — verified against a synthetic 4-point set (two same-building parcels merged into one multi-drop group, route correctly starts at the nearest cluster, ungeocoded stop pushed to the end). The mobile "Navigate" button opens the phone's own Google Maps via a `google.navigation:q=` deep link — no in-app map was built, by design.
- **Defense 9 (Couch Delivery Fraud)**: the delivery screen watches live GPS and locks the OTP field and both action buttons until the agent is within 100m of the geocoded address — enforced server-side too (`_check_geofence` in `lastmile.py`), so a modified client can't bypass it by just unlocking its own UI. A package with no geocoded address skips the lock entirely (there's no ground truth to check against) and leans on the "Call Recipient" button instead.
- **Defense 10 (Dead-Battery Handover)**: there's deliberately no separate "manifest" table or device-local state — `assigned_staff_id` + `status='OUT_FOR_DELIVERY'` on `shipments` *is* the active manifest, so it follows whichever `staff.id` is logged in.

## Phase 5 — what's live now (final phase)

- **Command Center** (`web/dashboard`, Hub Manager / Super Admin only): KPI cards (Total Active Orders, Average TAT, Network Integrity Index — defined as the % of bag-level scan attempts that *weren't* flagged `COMPROMISED`), the Live Topology Map, and the Security Inbox, all role-scoped server-side.
- **RBAC "view as"**: a Super Admin gets a role switcher that genuinely re-scopes every widget to a chosen hub via `?preview_hub_id=`, backed by the same `resolve_scope_hub_id()` the backend uses everywhere — a real Hub Manager is hard-locked to their own hub and can't reach this control at all (attempting `preview_hub_id` as a non-Super-Admin is rejected with 403).
- **One deliberate architecture exception**: the Live Map and Security Inbox use genuine Supabase Realtime, which means the browser talks to Supabase directly — the one case in this whole app where that happens. `0003_phase5_realtime.sql` grants the anon key read access to `tracking_events`, but *only* rows where `bag_id` is set (bag-level movement/security events). Customer-scoped rows (`tracking_id`-only, no `bag_id`) stay fully blocked — the public `/track/[id]` page still goes exclusively through FastAPI's hand-picked response, never this policy. Reasoning is written directly in the migration file.
- **Live Topology Map**: static hub markers plus moving "truck" dots — since we only ever capture depart/arrive scan events (never continuous GPS), a truck's position is an honest straight-line, time-based estimate between its two known points, not a real live ping. Bottleneck reroutes render as burnt-orange dashed polylines on the same map.
- **Security Inbox**: streams `COMPROMISED` ("Teleportation Alert") and `AUTO_HEALED` ("Auto-Healed Stowaway") events live, resolving the penalized staff member's name via an authenticated lookup endpoint — the anon Realtime feed carries a bare staff UUID, never a name/phone, keeping the roster itself behind real auth.
- **AI Bottleneck Auditor**: a genuine background task (`asyncio` loop started in FastAPI's lifespan, no external scheduler/cron needed) rescans every 30s for `IN_TRANSIT` bags running over a documented time estimate (40 km/h average, no real traffic data available) and proposes a reroute waypoint via a nearest-hub heuristic — verified against a synthetic 2-bag mock (only the genuinely delayed bag gets flagged, a sensible waypoint gets suggested, on-time bags are correctly left alone).
- **Consumer Verification Page** (`/track/[tracking_id]`, fully public): GSAP-animated intro (a glowing dot traveling a grid line via `MotionPathPlugin`, inside a CSS-perspective 3D grid) fades into the real timeline. The "Verified Genuine" / "Clone Attack Detected" badge checks every bag a package ever rode in for a `COMPROMISED` event, not just events tagged to the package directly — Defense 6 fires at the bag level, so a package-level-only check would miss it.
- **Known trade-off, noted rather than silently shipped**: `npm audit` flags several Next.js advisories that only clear with a major-version jump to Next 16; none of the flagged CVE classes (Server Actions, Middleware, `next/image`, WebSocket upgrades) are used anywhere in this app, so I stayed on 14.2.35 (already the latest patched 14.x) rather than risk an unverified major bump this late in the build. Revisit before any real public deployment.

## Supabase project

Live project: **LOCUS** (`jjehgsstwbwnauirbxsb`, ap-south-1). All 3 migrations applied, storage bucket confirmed public, phone auth provider enabled, seeded with 3 hubs / 6 pincode routes / 5 demo staff, and the whole API verified end-to-end against it (login, hub listing, printer batch generation, resolve, public track — all hitting the real database, not mocks).

One real bug surfaced and fixed during that verification: the installed `postgrest-py` (0.16.11) returns a bare `None` from `.maybe_single().execute()` when zero rows match, not a response object with `.data = None` — every one of the ~19 "does this exist?" lookups across the backend was written assuming the latter, and would have thrown `AttributeError` on every legitimate not-found case (unregistered phone number, unknown tracking ID, unrouted pincode, mistyped shortcode — all real, expected paths, not edge cases). Fixed with a single `fetch_one()` helper in `app/core/supabase_client.py` that normalizes both shapes, applied everywhere `.maybe_single()` is used. Re-verified live afterward: unknown-phone login now returns a clean 404 instead of a 500, same for unknown tracking IDs and bad shortcodes.

## Deployment (Vercel — single project, Next.js + FastAPI together)

You asked for one deployment rather than splitting the backend onto a separate host. Vercel supports this: the Python API and the Next.js app both build and deploy from the same repo into one project, one domain. Two structural changes made this actually work rather than just look configured:

1. **Every backend route now lives under `/api`** (`app/main.py` mounts one `APIRouter(prefix="/api")` wrapping everything) — otherwise the backend's public `/track/{id}` *endpoint* and the Next.js `/track/[trackingId]` *page* would collide on the same path once they share a domain.
2. **The AI Bottleneck Auditor no longer runs as a background loop.** Serverless functions don't persist between requests, so the `asyncio` loop + in-memory cache pattern would silently stop refreshing after the first invocation. It now computes fresh on every call to `GET /api/admin/bottlenecks` instead — the dashboard already polls that endpoint every 20s on its own, so nothing user-visible changes.

New root-level files that make this work: `vercel.json` (routes `/api/*` to the Python function, everything else to the Next.js app), `api/index.py` (the Vercel entrypoint — just imports the real `app.main:app`, no duplicated code), `requirements.txt` (a one-line `-r backend/requirements.txt`, so there's still only one real dependency list).

**What I verified locally**: `vercel.json` is valid JSON; `api/index.py` genuinely imports and resolves all 36 routes; `pip install -r requirements.txt` from the repo root correctly resolves through to `backend/requirements.txt`; the live server under the new `/api` paths was re-tested end-to-end against the real Supabase project (auth gate rejects unauthenticated requests, login works, the reworked bottleneck endpoint responds correctly, public track works).

**What I can't verify from here**: the actual `routes` array in `vercel.json` — routing a Next.js app that isn't at the repo root alongside a Python function is a well-documented Vercel pattern, but its first real proof only happens on Vercel's own infrastructure, which requires your account (I have no Vercel CLI/OAuth access in this environment). If something 404s on first deploy, it's almost certainly a one-line fix to that `routes` array — tell me the exact error and I'll adjust it.

### To actually deploy

1. `npm i -g vercel` (if you don't have the CLI), then `vercel login` — this opens a browser for you to authenticate; I can't do this step.
2. From the repo root: `vercel` (first run links/creates the project and deploys a preview; `vercel --prod` promotes to production). Vercel auto-detects the `vercel.json` build config — no dashboard changes needed for the build itself.
3. In the Vercel project's **Settings → Environment Variables**, add everything currently in `backend/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `APP_JWT_SECRET`, `DEMO_OTP_BYPASS_CODE`, `MISTRAL_API_KEY`, `MISTRAL_VISION_MODEL`, `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`, `TWILIO_*` once you have them) **plus** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `web/.env.local`. Leave `NEXT_PUBLIC_API_BASE_URL` **unset** in production — it defaults to same-origin `/api`, which is what you want here.
4. Once you know your production domain, set `PUBLIC_WEB_BASE_URL` to it (used to build the WhatsApp tracking link sent on intake) and add it to `CORS_ORIGINS` too.
5. Redeploy (`vercel --prod`) after adding env vars — Vercel doesn't retroactively inject them into an already-built deployment.

The mobile app is unaffected by any of this — it's a separate Expo app that just needs `EXPO_PUBLIC_API_BASE_URL` pointed at `https://your-deployment.vercel.app/api` once you have a real domain.

## Post-Phase-5 hardening — live-verified against the real database

Everything below was found and fixed by actually exercising the running system against the real Supabase project, not by code review alone.

- **The `.maybe_single()` bug** (already covered above) — fixed and re-verified.
- **`/agent/proceed-to-deliver` threw a 500 on every real call.** Root cause: it used `.upsert()` with a partial row (missing `shortcode`, which is `NOT NULL` with no default) — postgrest has to construct a candidate INSERT row to check the upsert conflict target, and that construction fails the constraint even though the row was only ever going to be updated. Fixed by switching to plain per-row `.update()` calls, which have no such landmine. Caught by a full live lifecycle test (intake → consolidate → dispatch → depart → arrive → unseal → claim → proceed-to-deliver → OTP → deliver → public track), re-run clean afterward: 24/26 checks passed, and the other 2 "failures" were the test script reusing the same demo account across two runs without resetting state — which is actually Defense 10 (persistent per-staff manifest) working correctly, not a bug.
- **Groq has zero working vision-capable models as of this build.** Every Llama vision variant is decommissioned — confirmed via a live API call (not docs), a full model-catalog pull for the actual key, and Groq's own current docs page, all agreeing. **Switched to Mistral** (`app/core/vision_ocr.py`, `ministral-8b-latest`) after independently verifying *that* claim too (a pasted suggestion to use `pixtral-12b-2409` was also stale — that model's deprecated; the actual live, working vision lineup is the `ministral-*`/`mistral-medium-*` family, confirmed via `GET /v1/models` on the real key). End-to-end tested with a synthetic bill image through the real `/api/ocr/bill` endpoint — every field (sender name/phone, recipient name/phone, address, pincode, value, weight) extracted correctly.
- **The MSME auto-link never actually had sender data to link with.** The OCR prompt only ever asked for recipient-side fields — `sender_name`/`sender_phone` (the MSME's own identity) were never extracted, so the "zero extra clicks" auto-link only worked if an operator manually typed the MSME's phone. Fixed: the prompt now extracts sender fields too, and `app/warehouse/intake.tsx` pre-fills `msme_business_name`/`msme_phone` from the OCR result (still editable) — the backend's existing `_get_or_create_msme` upsert-by-phone logic was already correct and needed no change.

## Staff management (added post-Phase-5)

Originally staff/hubs/pincode routes were seed-only with no in-app way to manage them — flagged as a real gap and now closed for staff specifically (hubs/pincode routes are still seed/SQL-only — ask if you want those built out too).

- `GET/POST/DELETE /api/admin/staff` — Hub Managers can add/remove **operational** staff (`WAREHOUSE_STAFF`, `LINE_HAUL`, `LAST_MILE`) for **their own hub only**; the hub is forced server-side from the caller's own `assigned_hub_id`, never trusted from the request body. A Hub Manager attempting to create another `HUB_MANAGER`/`SUPER_ADMIN`, or delete staff outside their hub, gets a 403 — verified live with a 10-case authorization test (escalation attempts, cross-hub deletes, self-delete, all correctly rejected).
- Deleting a staff member removes both the `staff` row and the underlying Supabase Auth user, so there's no orphaned account left able to request an OTP.
- Web dashboard now has three tabs (`Overview` / `Analytics` / `Staff`) instead of one page — shared "preview as" state lives in `DashboardProvider` so it stays in sync across tabs. `Analytics` adds a shipments-by-status breakdown on top of the existing KPI cards. `Staff` is the roster + add-staff form, with the same role/hub restrictions enforced in the UI as the backend.

## Network management (added post-Phase-5)

`GET/POST/DELETE /api/admin/hubs` and `/api/admin/pincode-routes` close the other half of the seed-only gap. Hubs are Super-Admin-only (creating infrastructure isn't a "my hub" decision the way staff is); pincode routes follow the staff pattern — a Hub Manager can add/remove routes pointing to their own hub, Super Admin can touch any. Deleting a hub is blocked with a clear 409 while pincode routes still reference it, rather than silently orphaning them — verified live, including the "blocked, then succeeds once the dependent route is removed" path. Both live in the dashboard's new **Network** tab.

## Bootstrapping with real data (no demo data)

Logging in at all requires a phone number that already exists in the `staff` table — there's no self-signup. The real Super Admin account (`+919059755179`) now exists in the live project. Old seed/test data (fake hubs, fake staff, everything created during build-and-test) gets cleared via **`supabase/reset_to_real_data.md`** — a one-time, transaction-wrapped SQL script (paste into the Supabase SQL Editor). After that, everything else — hubs, pincode routes, staff — gets added through the app itself via the Network and Staff tabs; nothing else needs raw SQL again.
