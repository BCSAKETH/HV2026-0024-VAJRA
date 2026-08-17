const EARTH_RADIUS_M = 6371000;

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
