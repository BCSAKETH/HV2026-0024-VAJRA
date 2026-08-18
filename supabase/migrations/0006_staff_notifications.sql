-- =========================================================
-- LOCUS — Push-assignment as notification (Plan item 5c)
--
-- A Hub Manager "assigning" a driver to a bag/package must NEVER write to
-- assigned_staff_id directly -- that field is a physical-custody claim,
-- and only a real scan (depart/arrive/unseal/claim) is allowed to set it,
-- preserving Defense 7 (stowaway self-healing) and Defense 10 (dead-battery
-- handover)'s guarantee that the system state always reflects who actually
-- has the package in hand, not who was merely told to go get it.
--
-- So a Hub Manager's "assignment" is just a notification: a nudge that
-- shows up in the driver's app. It carries zero authority — the driver
-- still has to walk over and physically scan the bag/parcel for anything
-- to actually change.
-- =========================================================

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_by uuid references public.staff(id) on delete set null,
  message text not null,
  bag_id text references public.master_bags(bag_id) on delete set null,
  tracking_id text references public.shipments(tracking_id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists staff_notifications_staff_id_idx on public.staff_notifications(staff_id, created_at desc);

alter table public.staff_notifications enable row level security;

-- Defense-in-depth only (FastAPI with the service-role key is the real
-- gate, same as every other table) -- a staff member can read/update their
-- own notifications if anything ever queries Supabase directly with a user
-- token.
create policy "staff can read own notifications" on public.staff_notifications
  for select using (staff_id = auth.uid());

create policy "staff can mark own notifications read" on public.staff_notifications
  for update using (staff_id = auth.uid());
