import * as Location from "expo-location";

const EARTH_RADIUS_M = 6371000;
const LOCATION_TIMEOUT_MS = 5000;

// Location.getCurrentPositionAsync has no built-in timeout -- on a weak GPS
// fix (indoors, poor sky view) it can hang far longer than anyone will
// wait, blocking whatever network call was supposed to follow it. Confirmed
// live: this was mistaken for a network/connectivity problem (0.00 KB/s
// reported, zero server-side trace) when the real cause was the app never
// getting past this GPS wait to attempt the network call at all. Location
// is always optional here (every caller's payload accepts lat/lng as
// null/undefined), so giving up after 5s and moving on is the right
// tradeoff, never a hard requirement worth hanging the whole flow over.
export async function getCurrentLocationSafe(): Promise<{ lat?: number; lng?: number }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return {};
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("location timeout")), LOCATION_TIMEOUT_MS)),
    ]);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return {};
  }
}

// Client-side mirror of the backend's Haversine check — used only to drive
// the UI lock (enable/disable buttons). The backend re-checks independently
// on every /deliver and /rto call, so this is a UX convenience, not the
// actual security boundary.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
