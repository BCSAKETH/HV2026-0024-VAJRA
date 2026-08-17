-- =========================================================
-- LOCUS — Phase 5 addition
--
-- Live Topology Map + Security Inbox need genuine Supabase Realtime, which
-- is a direct browser-to-Supabase websocket — there is no way to proxy
-- Postgres logical-replication events through FastAPI without rebuilding
-- an equivalent pub/sub layer ourselves. Realtime's postgres_changes also
-- only works on tables, not views, and RLS is row-level, not column-level,
-- so there is no way to expose "just the safe columns" of tracking_events.
--
-- This is therefore a deliberate, narrow exception to "every client talks
-- only to FastAPI": the anon key gets read access to tracking_events, but
-- ONLY rows where bag_id is set (bag-level movement/security events —
-- departures, arrivals, clone-detection, stowaway heals). Rows scoped to a
-- tracking_id alone (a specific customer's package events with no bag_id)
-- stay fully blocked from anon — the public /track/[id] page still goes
-- through FastAPI's hand-picked, PII-safe response, never this policy.
--
-- The one acknowledged trade-off: these rows include `staff_id`, a bare
-- UUID with no name/phone attached (resolving it to a person still requires
-- an authenticated call to the staff table). That's judged an acceptable
-- cost for genuine live updates rather than polling.
-- =========================================================

create policy "anon can read bag-level events for the live map and security inbox"
  on public.tracking_events for select
  to anon
  using (bag_id is not null);
