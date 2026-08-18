-- =========================================================
-- LOCUS — Phase 2 additions
--  * Sequential, collision-proof ID generators for the Digital Printer
--    (TRK-000001 / BAG-000001), used instead of counting rows so
--    concurrent "Generate Batch" clicks never produce duplicate IDs.
--  * Switch 'package_conditions' to a public bucket. These are photos of
--    a box's physical condition (not people, not documents) — the
--    simplicity of a stable public URL outweighs the value of signed-URL
--    expiry here, and it matches the schema field name (condition_photo_urls
--    stores real URLs, not bucket-relative paths).
-- =========================================================

create sequence if not exists public.shipment_id_seq start 1;
create sequence if not exists public.bag_id_seq start 1;

create or replace function public.next_tracking_id()
returns text
language sql
as $$
  select 'TRK-' || lpad(nextval('public.shipment_id_seq')::text, 6, '0');
$$;

create or replace function public.next_bag_id()
returns text
language sql
as $$
  select 'BAG-' || lpad(nextval('public.bag_id_seq')::text, 6, '0');
$$;

grant execute on function public.next_tracking_id() to service_role, authenticated;
grant execute on function public.next_bag_id() to service_role, authenticated;

insert into storage.buckets (id, name, public)
values ('package_conditions', 'package_conditions', true)
on conflict (id) do update set public = true;
