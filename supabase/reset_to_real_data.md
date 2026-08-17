# LOCUS — Reset to Real Data

One-time cleanup script. Removes all seeded/test data (fake hubs, fake pincode routes, fake staff, and every shipment/bag/event created during build-and-test) and leaves exactly one real account: the Super Admin at `+919059755179`.

**Run once, in the Supabase SQL Editor for the `LOCUS` project** (not the local repo — this doesn't run from your machine). Wrapped in a transaction: either the whole thing applies, or none of it does.

```sql
begin;

-- 1. tracking_events is deliberately immutable (a trigger blocks UPDATE/DELETE
--    even for the service-role key) — that's correct for the running app, but
--    it also blocks the FK cascade this cleanup needs (deleting a shipment
--    tries to null out its tracking_events.tracking_id, which the trigger
--    refuses). Lift it for this one-time reset only.
alter table public.tracking_events disable trigger trg_block_tracking_events_update;
alter table public.tracking_events disable trigger trg_block_tracking_events_delete;

-- 2. Clear everything, in FK-safe order (children before parents).
delete from public.tracking_events;
delete from public.shipments;
delete from public.master_bags;
delete from public.msmes;
delete from public.pincode_routes;
delete from public.hubs;

-- 3. Remove every staff/auth account except the real Super Admin.
--    auth.users.phone is stored without the leading '+' (Supabase's own
--    normalization) — staff rows for removed users disappear automatically
--    via their ON DELETE CASCADE to auth.users.
delete from auth.users where phone <> '919059755179';

-- 4. Restore the ledger's immutability protection.
alter table public.tracking_events enable trigger trg_block_tracking_events_update;
alter table public.tracking_events enable trigger trg_block_tracking_events_delete;

commit;

-- Sanity check — should return exactly one row.
select phone, name, role from public.staff;
```

## After running this

- **Log in** at `/login` (or `/dashboard` directly) with `+919059755179` and the demo OTP code (`000000`, until you configure a real SMS provider).
- **Add your first real hub** — Dashboard → Network tab (Super Admin only can add hubs).
- **Add pincode routes** for that hub — same tab.
- **Add real staff** — Dashboard → Staff tab. As Super Admin you can add Hub Managers for each hub; once a Hub Manager exists, they can add their own hub's operational staff (warehouse/line-haul/last-mile) without needing you.
- The Digital Printer, intake, consolidation, and every other flow work exactly as built — they just have nothing to operate on until real hubs/pincode routes/staff exist, which is the correct empty state now.

## If something goes wrong mid-script

The whole thing is one transaction — if any statement errors, Postgres rolls back everything automatically and your data is untouched. Nothing to manually undo.
