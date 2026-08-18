-- =========================================================
-- LOCUS — Role split
--
-- WAREHOUSE_STAFF (one role, two tabs: Intake + Consolidate) splits into
-- three distinct, separately-logged-in roles, matching the real staffing
-- plan: one person pastes QR labels, one scans bills, one runs the master
-- bag. QR_PASTER is a new WEB role (they operate the Digital Printer, not
-- a mobile scanner) — BILL_SCANNER and CONSOLIDATOR are mobile, same as
-- WAREHOUSE_STAFF was.
--
-- Postgres can't drop a value from an enum type in place, and this
-- project's `staff_role` type is referenced by several RLS policies and
-- by current_staff_role() — dropping/recreating the type (the originally
-- planned approach) would require CASCADE-dropping every one of those and
-- hand-rewriting them blind, which is far riskier than necessary here.
--
-- Postgres DOES allow adding new enum values without touching the type's
-- identity, so that's what this does instead. WAREHOUSE_STAFF stays in
-- the type's value list forever as a harmless, permanently-unused legacy
-- value — nothing in the app ever assigns it again after this runs.
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction as a statement that references the new value, so the ADD
-- VALUE statements and the UPDATE below must run as two separate calls
-- (two separate SQL Editor executions), not pasted and run together.
-- =========================================================

-- Run this block first, on its own:
alter type staff_role add value 'QR_PASTER';
alter type staff_role add value 'BILL_SCANNER';
alter type staff_role add value 'CONSOLIDATOR';

-- Then run this separately, after the above has committed:
-- update public.staff set role = 'BILL_SCANNER' where role = 'WAREHOUSE_STAFF';
