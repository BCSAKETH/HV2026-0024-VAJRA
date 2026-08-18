-- =========================================================
-- LOCUS — Real 5-hub network (replaces the 3 inner-city seed hubs)
--
-- North (Jeedimetla), South (Shamshabad), West (Patancheru),
-- East (Cherlapally), Center (Balanagar) — anchored on ORR/IRR for fast
-- inter-hub trucking. Coordinates are live-verified against Nominatim
-- (OSM), not guessed.
--
-- This is a DATA migration, not a schema migration — no new tables/columns.
-- It's recorded here for history/reproducibility; it was actually applied
-- to the live project via the Supabase Management API (see chat log), in
-- this order:
--   1. Insert the 5 new hubs.
--   2. Remap every staff/master_bags/pincode_routes row pointing at the 3
--      old inner-city hubs (Begumpet, Gachibowli, Hitec City) onto the new
--      Center hub — verified via Haversine as the nearest of the 5 to all
--      3 old locations, so nothing needed splitting across zones.
--   3. Delete the 3 old hubs (now unreferenced).
--   4. Add real, Nominatim-verified pincode coverage across all 5 zones
--      (15 new routes, 3 per hub, on top of the 6 legacy ones remapped
--      to Center).
--   5. Bulk-create the full per-hub staffing model (1 Hub Manager,
--      1 QR Paster, 1 Bill Scanner, 1 Consolidator, 2 Truck Drivers,
--      5 Delivery Agents = 11/hub, 55 total) via POST /api/admin/staff —
--      NOT raw SQL, because staff.id is a foreign key into auth.users and
--      only the real endpoint (via get_or_create_auth_user) provisions a
--      matching Supabase Auth user. See backend/app/seed.py for the exact
--      roster generation this mirrors for fresh local dev databases.
-- =========================================================

-- Hub UUIDs used across the live migration, for reference:
--   North Hub — Jeedimetla   f002fb58-d53e-4da9-81da-eaca5993eda7
--   South Hub — Shamshabad   5dd7fc1b-2ed5-4f44-a694-de6efa195048
--   West Hub — Patancheru    2a72a12e-92b2-49f7-8737-89d84a91cd15
--   East Hub — Cherlapally   47728777-e85e-4278-8497-c8ea3b4decb1
--   Center Hub — Balanagar   7c8a09cb-2cd2-4213-ad99-fe47d674c849

insert into public.hubs (id, name, type, gps_lat, gps_lng) values
  ('f002fb58-d53e-4da9-81da-eaca5993eda7', 'North Hub — Jeedimetla', 'WAREHOUSE', 17.5197, 78.4469),
  ('5dd7fc1b-2ed5-4f44-a694-de6efa195048', 'South Hub — Shamshabad', 'WAREHOUSE', 17.2572, 78.3451),
  ('2a72a12e-92b2-49f7-8737-89d84a91cd15', 'West Hub — Patancheru', 'WAREHOUSE', 17.5286, 78.2674),
  ('47728777-e85e-4278-8497-c8ea3b4decb1', 'East Hub — Cherlapally', 'WAREHOUSE', 17.4687, 78.6025),
  ('7c8a09cb-2cd2-4213-ad99-fe47d674c849', 'Center Hub — Balanagar', 'SORTING_CENTER', 17.4768, 78.4220)
on conflict (id) do nothing;

-- Remap: adjust these old IDs if your project's seed hubs used different
-- UUIDs (query `select id, name from hubs` first to find them).
-- update public.staff set assigned_hub_id = '7c8a09cb-2cd2-4213-ad99-fe47d674c849' where assigned_hub_id in (<old hub ids>);
-- update public.master_bags set origin_hub_id = '7c8a09cb-2cd2-4213-ad99-fe47d674c849' where origin_hub_id in (<old hub ids>);
-- update public.master_bags set destination_hub_id = '7c8a09cb-2cd2-4213-ad99-fe47d674c849' where destination_hub_id in (<old hub ids>);
-- update public.pincode_routes set destination_hub_id = '7c8a09cb-2cd2-4213-ad99-fe47d674c849' where destination_hub_id in (<old hub ids>);
-- delete from public.hubs where id in (<old hub ids>);

insert into public.pincode_routes (pincode, destination_hub_id) values
  ('500055', 'f002fb58-d53e-4da9-81da-eaca5993eda7'),
  ('500067', 'f002fb58-d53e-4da9-81da-eaca5993eda7'),
  ('501401', 'f002fb58-d53e-4da9-81da-eaca5993eda7'),
  ('501218', '5dd7fc1b-2ed5-4f44-a694-de6efa195048'),
  ('500052', '5dd7fc1b-2ed5-4f44-a694-de6efa195048'),
  ('500075', '5dd7fc1b-2ed5-4f44-a694-de6efa195048'),
  ('502319', '2a72a12e-92b2-49f7-8737-89d84a91cd15'),
  ('502032', '2a72a12e-92b2-49f7-8737-89d84a91cd15'),
  ('502300', '2a72a12e-92b2-49f7-8737-89d84a91cd15'),
  ('500098', '47728777-e85e-4278-8497-c8ea3b4decb1'),
  ('500060', '47728777-e85e-4278-8497-c8ea3b4decb1'),
  ('500074', '47728777-e85e-4278-8497-c8ea3b4decb1'),
  ('500018', '7c8a09cb-2cd2-4213-ad99-fe47d674c849'),
  ('500037', '7c8a09cb-2cd2-4213-ad99-fe47d674c849'),
  ('500042', '7c8a09cb-2cd2-4213-ad99-fe47d674c849')
on conflict (pincode) do nothing;

-- Staff roster: run `python -m app.seed` from backend/ against this project
-- (it's idempotent) to create the 55-person roster via the real API path.
