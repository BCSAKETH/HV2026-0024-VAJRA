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
-- Postgres can't drop a value from an enum type directly, so this creates
-- the new type, migrates the column across, then drops the old type.
-- =========================================================

create type staff_role_new as enum (
  'SUPER_ADMIN',
  'HUB_MANAGER',
  'QR_PASTER',     -- web — Digital Printer. Generates + "prints" QRs, pastes physically.
  'BILL_SCANNER',  -- mobile — Intake: bill photo -> OCR -> proof-of-condition -> confirm.
  'CONSOLIDATOR',  -- mobile — Master Bag: scan bag -> pick destination hub -> scan children in.
  'LINE_HAUL',     -- mobile — middle-mile transit driver
  'LAST_MILE'      -- mobile — last-mile delivery agent
);

alter table public.staff add column role_new staff_role_new;

-- Any existing WAREHOUSE_STAFF account becomes BILL_SCANNER by default —
-- a reasonable landing spot, reassignable afterward via the Staff tab if
-- that particular person should actually be a CONSOLIDATOR or QR_PASTER.
update public.staff set role_new = (
  case role::text
    when 'WAREHOUSE_STAFF' then 'BILL_SCANNER'
    else role::text
  end
)::staff_role_new;

alter table public.staff alter column role_new set not null;
alter table public.staff drop column role;
alter table public.staff rename column role_new to role;

drop type staff_role;
alter type staff_role_new rename to staff_role;
