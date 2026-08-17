-- =========================================================
-- LOCUS — "The Exact Point of Truth"
-- Phase 1: Core schema, enums, indexes, immutability trigger, RLS
-- =========================================================
-- Design notes:
--  * All client apps (web + mobile) talk to FastAPI only. FastAPI holds the
--    Supabase SERVICE ROLE key and enforces authorization in Python.
--  * RLS below is defense-in-depth (in case anything ever queries Supabase
--    directly with a user JWT) — it is NOT the primary authorization layer.
--  * No public/anon SELECT policies on shipments or tracking_events. The
--    public /track/[id] page is served by FastAPI (service role), which
--    returns a hand-picked, PII-safe subset of fields — never a raw table.
-- =========================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------
create type hub_type as enum ('SORTING_CENTER', 'WAREHOUSE');

-- Role model: Role 1A (Intake) and Role 1B (Consolidation) are collapsed
-- into a single WAREHOUSE_STAFF role, since both happen on the origin hub
-- floor and this is a single role-routed app, not four separate apps.
-- The app shows both an "Intake" and a "Consolidate" tab to this role.
create type staff_role as enum (
  'SUPER_ADMIN',
  'HUB_MANAGER',
  'WAREHOUSE_STAFF',  -- Role 1A + 1B: intake + consolidation
  'LINE_HAUL',        -- Role 2: middle-mile transit driver
  'LAST_MILE'         -- Role 3: last-mile delivery agent
);

create type master_bag_status as enum (
  'PRE_ALLOCATED', -- QR printed, no destination bound yet
  'OPEN',          -- bound to a destination hub, accepting child scans
  'SEALED',        -- weighed + sealed, ready for dispatch
  'IN_TRANSIT',
  'ARRIVED',
  'UNSEALED',
  'COMPROMISED'
);

create type shipment_status as enum (
  'PRE_ALLOCATED',   -- QR sticker printed, not yet married to a bill
  'CREATED',         -- intake confirmed
  'IN_BAG',          -- consolidated into a master bag
  'IN_TRANSIT',
  'ASSUMED_AT_HUB',  -- Defense 4: soft status until physically unsealed
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RTO',
  'COMPROMISED'
);

create type status_confidence as enum ('SOFT', 'HARD');

create type tracking_event_type as enum (
  'PRE_ALLOCATED',
  'INTAKE',
  'CONSOLIDATED',
  'SEALED',
  'DEPARTED',
  'ARRIVED_AT_HUB',
  'UNSEALED',
  'CLAIMED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RTO',
  'COMPROMISED',
  'AUTO_HEALED'
);

-- ---------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type hub_type not null default 'WAREHOUSE',
  gps_lat double precision not null,
  gps_lng double precision not null,
  created_at timestamptz not null default now()
);

create table public.pincode_routes (
  pincode text primary key,
  destination_hub_id uuid not null references public.hubs(id) on delete restrict
);

-- MSMEs are a lookup/reference entity only — no login, no portal.
-- Warehouse staff pick/create these while doing intake (Role 1A).
create table public.msmes (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name text,
  phone text unique not null,
  pincode text,
  created_at timestamptz not null default now()
);

-- Anchored to auth.users(id) so auth.uid() works cleanly in RLS.
create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  name text,
  role staff_role not null,
  assigned_hub_id uuid references public.hubs(id) on delete set null,
  error_points integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_staff_phone on public.staff(phone);

create table public.master_bags (
  bag_id text primary key,                 -- e.g. 'BAG-000001'
  shortcode text unique not null,          -- 6-digit alphanumeric fallback
  origin_hub_id uuid references public.hubs(id) on delete set null,
  destination_hub_id uuid references public.hubs(id) on delete set null,
  expected_weight numeric(10, 2) default 0,
  actual_weight numeric(10, 2),
  status master_bag_status not null default 'PRE_ALLOCATED',
  sealed_by_staff_id uuid references public.staff(id) on delete set null,
  assigned_staff_id uuid references public.staff(id) on delete set null, -- current custodian (line-haul driver)
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  dispatched_at timestamptz,
  arrived_at timestamptz
);
create index idx_master_bags_shortcode on public.master_bags(shortcode);
create index idx_master_bags_status on public.master_bags(status);
create index idx_master_bags_destination on public.master_bags(destination_hub_id);

create table public.shipments (
  tracking_id text primary key,            -- e.g. 'TRK-000001'
  shortcode text unique not null,          -- 6-digit alphanumeric fallback
  msme_id uuid references public.msmes(id) on delete set null,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  delivery_pincode text,
  delivery_lat double precision,           -- geocoded from delivery_address (Nominatim), NOT from OCR
  delivery_lng double precision,
  weight_grams numeric(10, 2),
  declared_value numeric(12, 2),
  tamper_seal_id text,                     -- Defense 2, nullable
  condition_photo_urls text[] not null default '{}',
  current_bag_id text references public.master_bags(bag_id) on delete set null,
  status shipment_status not null default 'PRE_ALLOCATED',
  status_confidence status_confidence not null default 'SOFT',
  delivery_otp text,                       -- 4-digit, set when out for delivery
  assigned_staff_id uuid references public.staff(id) on delete set null, -- current custodian (last-mile agent)
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint chk_declared_value_positive check (declared_value is null or declared_value >= 0)
);
create index idx_shipments_pincode on public.shipments(delivery_pincode);
create index idx_shipments_bag on public.shipments(current_bag_id);
create index idx_shipments_status on public.shipments(status);
create index idx_shipments_shortcode on public.shipments(shortcode);
create index idx_shipments_msme on public.shipments(msme_id);

-- Immutable ledger. Every scan/state-change across the whole system lands here.
create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  tracking_id text references public.shipments(tracking_id) on delete set null,
  bag_id text references public.master_bags(bag_id) on delete set null,
  event_type tracking_event_type not null,
  lat double precision,
  lng double precision,
  staff_id uuid references public.staff(id) on delete set null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint chk_event_has_subject check (tracking_id is not null or bag_id is not null)
);
create index idx_events_tracking on public.tracking_events(tracking_id, created_at desc);
create index idx_events_bag on public.tracking_events(bag_id, created_at desc);
create index idx_events_type on public.tracking_events(event_type);

-- ---------------------------------------------------------
-- IMMUTABILITY: block UPDATE/DELETE on tracking_events, no exceptions.
-- A trigger fires regardless of RLS or which key issued the query, so this
-- holds even for the service-role key FastAPI uses.
-- ---------------------------------------------------------
create or replace function public.block_tracking_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'tracking_events is an immutable ledger — % is not allowed', TG_OP;
end;
$$;

create trigger trg_block_tracking_events_update
  before update on public.tracking_events
  for each row execute function public.block_tracking_event_mutation();

create trigger trg_block_tracking_events_delete
  before delete on public.tracking_events
  for each row execute function public.block_tracking_event_mutation();

-- ---------------------------------------------------------
-- HELPER FUNCTIONS for RLS (avoid repeating subqueries in every policy)
-- ---------------------------------------------------------
create or replace function public.current_staff_role()
returns staff_role
language sql stable security definer
set search_path = public
as $$
  select role from public.staff where id = auth.uid();
$$;

create or replace function public.current_staff_hub()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select assigned_hub_id from public.staff where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.hubs enable row level security;
alter table public.pincode_routes enable row level security;
alter table public.msmes enable row level security;
alter table public.staff enable row level security;
alter table public.master_bags enable row level security;
alter table public.shipments enable row level security;
alter table public.tracking_events enable row level security;

-- hubs / pincode_routes: every logged-in staff member needs these to route
-- packages; no sensitive data here, no public policy.
create policy "authenticated staff can read hubs"
  on public.hubs for select to authenticated using (true);

create policy "super admin manages hubs"
  on public.hubs for all to authenticated
  using (public.current_staff_role() = 'SUPER_ADMIN')
  with check (public.current_staff_role() = 'SUPER_ADMIN');

create policy "authenticated staff can read pincode routes"
  on public.pincode_routes for select to authenticated using (true);

create policy "super admin manages pincode routes"
  on public.pincode_routes for all to authenticated
  using (public.current_staff_role() = 'SUPER_ADMIN')
  with check (public.current_staff_role() = 'SUPER_ADMIN');

-- msmes: warehouse staff can look up / create while doing intake.
create policy "authenticated staff can read msmes"
  on public.msmes for select to authenticated using (true);

create policy "warehouse staff can create msmes"
  on public.msmes for insert to authenticated
  with check (public.current_staff_role() in ('WAREHOUSE_STAFF', 'SUPER_ADMIN'));

-- staff: self read; super admin full manage.
create policy "staff can view own profile"
  on public.staff for select to authenticated
  using (id = auth.uid() or public.current_staff_role() = 'SUPER_ADMIN');

create policy "super admin manages staff"
  on public.staff for all to authenticated
  using (public.current_staff_role() = 'SUPER_ADMIN')
  with check (public.current_staff_role() = 'SUPER_ADMIN');

-- master_bags: readable by super admin, or staff whose assigned hub is the
-- origin/destination, or whoever currently holds it.
create policy "hub-scoped staff can read master bags"
  on public.master_bags for select to authenticated
  using (
    public.current_staff_role() = 'SUPER_ADMIN'
    or public.current_staff_hub() = origin_hub_id
    or public.current_staff_hub() = destination_hub_id
    or assigned_staff_id = auth.uid()
  );

create policy "authenticated staff can write master bags"
  on public.master_bags for insert to authenticated
  with check (public.current_staff_role() <> 'HUB_MANAGER'); -- hub managers are read-only observers

create policy "authenticated staff can update master bags"
  on public.master_bags for update to authenticated
  using (public.current_staff_role() <> 'HUB_MANAGER')
  with check (public.current_staff_role() <> 'HUB_MANAGER');

-- shipments: same shape as master_bags — coarse hub/holder scoping here,
-- FastAPI applies the fine-grained per-action rules (this is defense-in-depth
-- only, since all real traffic is routed through FastAPI's service-role key).
create policy "staff can read relevant shipments"
  on public.shipments for select to authenticated
  using (
    public.current_staff_role() = 'SUPER_ADMIN'
    or public.current_staff_role() = 'HUB_MANAGER'
    or assigned_staff_id = auth.uid()
    or exists (
      select 1 from public.master_bags b
      where b.bag_id = shipments.current_bag_id
        and (public.current_staff_hub() = b.origin_hub_id or public.current_staff_hub() = b.destination_hub_id)
    )
  );

create policy "warehouse/line-haul/last-mile staff can write shipments"
  on public.shipments for insert to authenticated
  with check (public.current_staff_role() in ('WAREHOUSE_STAFF', 'LINE_HAUL', 'LAST_MILE', 'SUPER_ADMIN'));

create policy "warehouse/line-haul/last-mile staff can update shipments"
  on public.shipments for update to authenticated
  using (public.current_staff_role() in ('WAREHOUSE_STAFF', 'LINE_HAUL', 'LAST_MILE', 'SUPER_ADMIN'))
  with check (public.current_staff_role() in ('WAREHOUSE_STAFF', 'LINE_HAUL', 'LAST_MILE', 'SUPER_ADMIN'));

-- tracking_events: any authenticated staff member can append; nobody can
-- read/write beyond that via RLS. No public SELECT policy — the public
-- /track/[id] page is served by FastAPI using the service role key, which
-- bypasses RLS entirely and returns a hand-picked safe subset of fields.
create policy "authenticated staff can insert tracking events"
  on public.tracking_events for insert to authenticated with check (true);

create policy "staff can read events for their scope"
  on public.tracking_events for select to authenticated
  using (
    public.current_staff_role() in ('SUPER_ADMIN', 'HUB_MANAGER')
    or staff_id = auth.uid()
    or exists (select 1 from public.shipments s where s.tracking_id = tracking_events.tracking_id and s.assigned_staff_id = auth.uid())
    or exists (select 1 from public.master_bags b where b.bag_id = tracking_events.bag_id and b.assigned_staff_id = auth.uid())
  );

-- ---------------------------------------------------------
-- STORAGE: 'package_conditions' bucket (private — read via signed URL only)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('package_conditions', 'package_conditions', false)
on conflict (id) do nothing;

create policy "authenticated staff can upload condition photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'package_conditions');

create policy "authenticated staff can read condition photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'package_conditions');
