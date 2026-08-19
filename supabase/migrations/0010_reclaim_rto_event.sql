-- =========================================================
-- LOCUS — RTO re-delivery.
--
-- Real bug: once a shipment hit RTO, lastmile.claim_child explicitly
-- rejected re-claiming it (status in DELIVERED/RTO/COMPROMISED is a hard
-- block there, by design — those are meant to be terminal). RTO was never
-- actually terminal in practice: an undelivered package comes back to the
-- hub and gets handed to a delivery agent again, same as any fresh
-- package. There was simply no code path back into the claimed pool for
-- it.
--
-- Fix (paired with a new /shipments/{tracking_id}/reclaim-rto endpoint in
-- lastmile.py): a direct-QR-scan reclaim, no bag involved, since an RTO
-- package sits loose at the hub rather than sealed inside one. This new
-- event type records that specific transition distinctly from a normal
-- CLAIMED (which always implies "scanned out of a bag").
-- =========================================================

alter type tracking_event_type add value if not exists 'RECLAIMED_RTO';
