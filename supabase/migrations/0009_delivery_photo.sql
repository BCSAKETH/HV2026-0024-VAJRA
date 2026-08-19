-- Proof-of-delivery photo, required client-side (mobile enforces it before
-- allowing "Mark Delivered") but nullable here so this stays backward-
-- compatible with any not-yet-updated mobile build still calling /deliver
-- without one.
alter table public.shipments add column delivery_photo_url text;
