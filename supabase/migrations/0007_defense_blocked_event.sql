-- =========================================================
-- LOCUS — Analytics v2 groundwork: a real, queryable trail for the
-- defenses that previously only ever raised an HTTPException and left
-- nothing behind.
--
-- COMPROMISED (Defense 6) and AUTO_HEALED (Defense 7) were already
-- persisted to tracking_events. Pincode collision (1), tamper seal (2),
-- weight tolerance (3), soft audit (5), and geofence (9) were not --
-- they just rejected the request, so there was no way to build a real
-- "how many times has this fired" metric without fabricating one.
--
-- One additive enum value covers all five (meta.defense distinguishes
-- which one), rather than five new event types.
-- =========================================================

alter type tracking_event_type add value if not exists 'DEFENSE_BLOCKED';
