-- Track which staff member generated each QR (Printer page redesign req. 1b).
-- Nullable + ON DELETE SET NULL: existing rows and any future staff
-- deactivation must never break a shipment/bag record.
alter table public.shipments add column generated_by_staff_id uuid references public.staff(id) on delete set null;
alter table public.master_bags add column generated_by_staff_id uuid references public.staff(id) on delete set null;
