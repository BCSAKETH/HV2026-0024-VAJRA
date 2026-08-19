# LOCUS — *The Exact Point of Truth*

A state-aware 3PL logistics operating system for MSMEs: QR-based product tracking, inventory movement between hubs, and full-chain supply chain traceability — with ten real, backend-enforced anti-fraud/anti-error defenses baked into the package lifecycle, not bolted on after.

**📖 Full technical reference**: [`docs/LOCUS-Technical-Documentation.md`](docs/LOCUS-Technical-Documentation.md) — architecture, complete API surface, every module explained (what/why/how), step-by-step workflows per role, all 10 defenses, security model, UML diagrams (use-case, architecture, class, ER, state, sequence), and a worked example. This README is the quick-start; that document is the deep dive.

## Monorepo layout

- `/web` — Next.js (App Router) staff dashboard, Digital Printer, and the public `/track/[id]` page. Single deployment with the backend (see below).
- `/mobile` — one Expo app, role-routed. A single login; the screens shown depend on the logged-in staff member's `role`.
- `/backend` — FastAPI. Every client (web and mobile) talks only to this — it holds the Supabase service-role key and is the sole authorization layer.
- `/supabase/migrations` — SQL schema, enums, RLS policies, the immutable-ledger trigger, and the storage bucket.

No Docker. Everything runs natively.

---

## Quick start

### 0. One-time Supabase setup

1. Create a project at supabase.com (or via the Supabase MCP tools if you're doing this through Claude).
2. Open the SQL editor and run every file in `supabase/migrations/` in order (`0001` → `0008`).
3. Project Settings → API: copy the **Project URL**, **anon public key**, and **service_role key** — you'll need all three for `backend/.env`.
4. Authentication → Sign In / Providers: enable **Phone**. You don't need a real SMS provider wired up to demo — the `000000` bypass code covers that — but the phone provider toggle needs to be on for the schema/auth wiring to make sense.

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on WSL/macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # fill in SUPABASE_URL / keys from step 0
python -m app.seed              # creates 5 real Hyderabad hubs, pincode routes, and a full staffing roster (11 staff/hub)
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for the interactive API docs. `/api/health` should return `{"status": "ok"}`.

### 2. Web (Next.js)

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

Runs at `http://localhost:3000`.

### 3. Mobile (Expo)

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

Scan the QR with Expo Go (Android) or the Camera app (iOS), or press `a`/`i` for an emulator.

### Demo login

Every login is phone + OTP; the demo bypass code (`DEMO_OTP_BYPASS_CODE` in `.env`, default `000000`) skips real SMS. `app/seed.py` seeds one Super Admin plus a full roster (Hub Manager, QR Paster, Bill Scanner, Consolidator, 2× Line-Haul, 5× Last-Mile) for **each** of 5 real Hyderabad hubs — phones follow `+9190001-<hub><role><seq>`. A few to get started:

| Phone | Role |
|---|---|
| `+911000000001` | Super Admin (network-wide) |
| `+919000010101` | Hub Manager — North Hub (Jeedimetla) |
| `+919000010201` | QR Paster — North Hub |
| `+919000010301` | Bill Scanner — North Hub |
| `+919000010401` | Consolidator — North Hub |
| `+919000010501` | Line-Haul Driver — North Hub |
| `+919000010601` | Last-Mile Agent — North Hub |

Swap the hub-code digits (`01` North, `02` South, `03` West, `04` East, `05` Center) for the other four hubs' rosters — see `app/seed.py` for the exact generation logic.

---

## Design system

Warm Ivory `#F8F5EF` background · Deep Navy `#172B3A` text · Cobalt-Indigo `#4F46E5` primary actions · Burnt Orange `#E76F2F` active scans/warehouse actions · Muted Sage `#6B8F71` success · Brick-Red `#B84A3A` errors/quarantine. Newsreader (serif headings) + IBM Plex Sans (body) + IBM Plex Mono (all IDs/timestamps/scan codes). Defined once in `web/tailwind.config.ts` and `mobile/tailwind.config.js` — keep them in sync. Web additionally supports dark mode (CSS-variable-backed Tailwind tokens) and full English/Telugu/Hindi i18n.

## Architecture notes worth knowing before you touch anything

- **RLS is defense-in-depth, not the primary gate.** All real authorization happens in FastAPI (`backend/app/core/security.py`). The SQL policies in the migrations exist so that nothing catastrophic happens even if something ever queries Supabase directly with a user token.
- **Public tracking (`/track/[id]`) is served by FastAPI**, using the service-role key, returning a hand-picked safe subset of fields, looked up by a random 6-char shortcode (not the sequential tracking ID, which is enumerable). There is deliberately no public/anon SELECT policy on `shipments` or `tracking_events` — don't add one; route new public data needs through a FastAPI endpoint instead.
- **Staff auth is app-issued JWTs**, not raw Supabase sessions. `/auth/verify-otp` confirms the phone (or accepts the demo bypass code) and then FastAPI mints its own short-lived JWT embedding `staff.id`/`role`. Every request re-fetches the staff row from Postgres for authorization — a role/hub change takes effect on the next request, no re-login needed.
- **`tracking_events` cannot be UPDATE'd or DELETE'd**, enforced by a Postgres trigger — this holds even for the backend's service-role key. Corrections must be new events, never edits.
- **A Hub Manager "assigning" a driver is only ever a notification, never a real assignment.** `assigned_staff_id` is a physical-custody claim and can only be set by a real scan (depart/arrive/unseal/claim) — this is what keeps the stowaway self-healing and dead-battery handover defenses honest.
- **Roles**: `SUPER_ADMIN`, `HUB_MANAGER`, `QR_PASTER` (web only — runs the Digital Printer), `BILL_SCANNER`, `CONSOLIDATOR`, `LINE_HAUL`, `LAST_MILE` (mobile only).
- Verify `MISTRAL_VISION_MODEL` in `.env` is still live before relying on OCR — vision models get renamed/retired; this project already switched providers once for exactly this reason (Groq → Mistral, see the full technical doc §3.2).

## Single Vercel deployment

Next.js and the FastAPI backend deploy as **one Vercel project**, one domain, no CORS in production. `vercel.json` routes `/api/(.*)` to `api/index.py` (a thin shim importing the real `backend/app` FastAPI app) with an explicit `{"handle": "filesystem"}` step first, so Next's own dynamic routes (like the public `/track/[id]` page) aren't shadowed by the API catch-all. `requirements.txt` at the repo root is a one-line `-r backend/requirements.txt`, so there's still only one real Python dependency list.

To deploy: `vercel login`, then `vercel --prod` from the repo root. Set every backend `.env` var plus `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `web/.env.local`) in the Vercel project's environment variables; leave `NEXT_PUBLIC_API_BASE_URL` unset in production (defaults to same-origin `/api`). Set `PUBLIC_WEB_BASE_URL` to your real production domain once you have one — it's what gets used to build the tracking link sent over SMS, and a mismatch here is a real bug class (a local `.env` pointed at `localhost` while running against the live database will put a dead link in a real customer's SMS).

The mobile app is a separate Expo build — point `EXPO_PUBLIC_API_BASE_URL` at `https://your-deployment.vercel.app/api`.

## Current status

Every feature described in the [full technical documentation](docs/LOCUS-Technical-Documentation.md) is live and verified against the real production Supabase project and Vercel deployment — this isn't a roadmap document, it describes what's actually running. One piece of exploratory work, a fully interactive 3D hero scene (`PackageBoxScene` + courier vignette on the landing/login/track pages), exists as a real, working prototype on the unmerged `feat/locus-3d-visual-redesign` branch but has not yet been integrated into `main`.

## Bootstrapping with real data

Logging in requires a phone number that already exists in the `staff` table — there's no self-signup. `python -m app.seed` is idempotent and safe to re-run. Everything beyond the seeded roster — new hubs, pincode routes, staff — gets added through the app itself via the Network and Staff tabs; no raw SQL needed after initial setup.
