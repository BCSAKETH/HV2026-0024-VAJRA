// Defaults to same-origin "/api" — correct for the single-deployment Vercel
// setup where Next.js and the FastAPI function share one domain. Local dev
// overrides this in .env.local to point at the standalone uvicorn server.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export type StaffRole = "SUPER_ADMIN" | "HUB_MANAGER" | "QR_PASTER" | "BILL_SCANNER" | "CONSOLIDATOR" | "LINE_HAUL" | "LAST_MILE";

export interface StaffProfile {
  id: string;
  phone: string;
  name: string | null;
  role: StaffRole;
  assigned_hub_id: string | null;
  error_points: number;
}

export interface Hub {
  id: string;
  name: string;
  type: string;
  gps_lat: number;
  gps_lng: number;
}

export interface KpiOut {
  total_active_orders: number;
  average_tat_hours: number | null;
  network_integrity_index: number;
  status_breakdown: Record<string, number>;
  scope: { type: "NETWORK" | "HUB"; hub_id: string | null; hub_name: string | null };
}

export interface Staff {
  id: string;
  phone: string;
  name: string | null;
  role: StaffRole;
  assigned_hub_id: string | null;
  error_points: number;
  created_at: string;
}

export interface Bag {
  bag_id: string;
  shortcode: string;
  origin_hub_id: string | null;
  destination_hub_id: string | null;
  expected_weight: number;
  actual_weight: number | null;
  status: string;
  child_count: number;
}

export interface Shipment {
  tracking_id: string;
  shortcode: string;
  status: string;
  status_confidence: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  delivery_address: string | null;
  delivery_pincode: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  weight_grams: number | null;
  declared_value: number | null;
  tamper_seal_id: string | null;
  condition_photo_urls: string[];
  current_bag_id: string | null;
  assigned_staff_id: string | null;
  created_at: string;
}

export interface StaffManifest {
  bags: Bag[];
  shipments: Shipment[];
}

export interface StaffNotification {
  id: string;
  staff_id: string;
  created_by: string | null;
  message: string;
  bag_id: string | null;
  tracking_id: string | null;
  created_at: string;
  read_at: string | null;
}

export const HUB_MANAGER_CREATABLE_ROLES: StaffRole[] = ["QR_PASTER", "BILL_SCANNER", "CONSOLIDATOR", "LINE_HAUL", "LAST_MILE"];
export const ALL_STAFF_ROLES: StaffRole[] = ["SUPER_ADMIN", "HUB_MANAGER", "QR_PASTER", "BILL_SCANNER", "CONSOLIDATOR", "LINE_HAUL", "LAST_MILE"];

export interface PincodeRoute {
  pincode: string;
  destination_hub_id: string;
}

export interface ActiveTransit {
  bag_id: string;
  status: string;
  origin_hub: Hub;
  destination_hub: Hub;
  departed_at: string;
  estimated_hours: number;
  progress_hint: number;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  bag_id: string | null;
  tracking_id: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  meta: Record<string, unknown>;
  staff_id: string | null;
}

export interface StaffLookup {
  id: string;
  name: string | null;
  phone: string;
  role: string;
  error_points: number;
}

export interface Bottleneck {
  bag_id: string;
  origin_hub: Hub;
  destination_hub: Hub;
  departed_at: string;
  elapsed_hours: number;
  estimated_hours: number;
  delay_ratio: number;
  suggested_waypoint: Hub | null;
  polyline: [number, number][];
}

export interface TrackTimelineEvent {
  event_type: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface TrackResult {
  tracking_id: string;
  status: string;
  status_confidence: string;
  recipient_name: string | null;
  delivery_pincode: string | null;
  condition_photo_urls: string[];
  timeline: TrackTimelineEvent[];
  badge: "VERIFIED_GENUINE" | "CLONE_ATTACK_DETECTED";
  created_at: string;
  delivered_at: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : (body.detail?.message ?? `Request to ${path} failed with ${res.status}`);
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function withPreview(path: string, previewHubId?: string | null): string {
  return previewHubId ? `${path}?preview_hub_id=${encodeURIComponent(previewHubId)}` : path;
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ message: string; demo_bypass_available: boolean }>("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, token: string) =>
    request<{ access_token: string; token_type: string; staff: StaffProfile }>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, token }),
    }),

  generateQr: (accessToken: string, type: "PARCEL" | "BAG") =>
    request<{ type: string; item: { id: string; shortcode: string } }>(
      "/printer/generate",
      { method: "POST", body: JSON.stringify({ type }) },
      accessToken
    ),

  listHubs: (accessToken: string) => request<Hub[]>("/hubs", undefined, accessToken),

  getKpis: (accessToken: string, previewHubId?: string | null) => request<KpiOut>(withPreview("/admin/kpis", previewHubId), undefined, accessToken),

  getActiveTransits: (accessToken: string, previewHubId?: string | null) =>
    request<ActiveTransit[]>(withPreview("/admin/active-transits", previewHubId), undefined, accessToken),

  getBottlenecks: (accessToken: string, previewHubId?: string | null) =>
    request<Bottleneck[]>(withPreview("/admin/bottlenecks", previewHubId), undefined, accessToken),

  getSecurityEvents: (accessToken: string, previewHubId?: string | null) =>
    request<SecurityEvent[]>(withPreview("/admin/security-events", previewHubId), undefined, accessToken),

  staffLookup: (accessToken: string, ids: string[]) =>
    ids.length === 0 ? Promise.resolve([]) : request<StaffLookup[]>(`/admin/staff-lookup?ids=${ids.map(encodeURIComponent).join(",")}`, undefined, accessToken),

  track: (trackingId: string) => request<TrackResult>(`/track/${encodeURIComponent(trackingId)}`),

  listStaff: (accessToken: string, previewHubId?: string | null) => request<Staff[]>(withPreview("/admin/staff", previewHubId), undefined, accessToken),

  createStaff: (accessToken: string, payload: { phone: string; name: string | null; role: StaffRole; assigned_hub_id: string | null }) =>
    request<Staff>("/admin/staff", { method: "POST", body: JSON.stringify(payload) }, accessToken),

  deleteStaff: (accessToken: string, staffId: string) => request<void>(`/admin/staff/${encodeURIComponent(staffId)}`, { method: "DELETE" }, accessToken),

  createHub: (accessToken: string, payload: { name: string; type: "SORTING_CENTER" | "WAREHOUSE"; gps_lat: number; gps_lng: number }) =>
    request<Hub>("/admin/hubs", { method: "POST", body: JSON.stringify(payload) }, accessToken),

  deleteHub: (accessToken: string, hubId: string) => request<void>(`/admin/hubs/${encodeURIComponent(hubId)}`, { method: "DELETE" }, accessToken),

  listPincodeRoutes: (accessToken: string, previewHubId?: string | null) =>
    request<PincodeRoute[]>(withPreview("/admin/pincode-routes", previewHubId), undefined, accessToken),

  createPincodeRoute: (accessToken: string, payload: { pincode: string; destination_hub_id: string | null }) =>
    request<PincodeRoute>("/admin/pincode-routes", { method: "POST", body: JSON.stringify(payload) }, accessToken),

  deletePincodeRoute: (accessToken: string, pincode: string) =>
    request<void>(`/admin/pincode-routes/${encodeURIComponent(pincode)}`, { method: "DELETE" }, accessToken),

  getStaffManifest: (accessToken: string, staffId: string) =>
    request<StaffManifest>(`/admin/staff/${encodeURIComponent(staffId)}/manifest`, undefined, accessToken),

  notifyStaff: (accessToken: string, staffId: string, payload: { message: string; bag_id?: string | null; tracking_id?: string | null }) =>
    request<StaffNotification>(`/admin/staff/${encodeURIComponent(staffId)}/notify`, { method: "POST", body: JSON.stringify(payload) }, accessToken),
};
