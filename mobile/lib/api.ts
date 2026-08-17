import { useAuthStore } from "./store/auth";

// Mobile is a separate app, not served from the Vercel domain — this needs
// the full deployed URL (https://your-app.vercel.app/api) once shipped, set
// via EXPO_PUBLIC_API_BASE_URL. Defaults to the local backend for dev.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export type StaffRole = "SUPER_ADMIN" | "HUB_MANAGER" | "WAREHOUSE_STAFF" | "LINE_HAUL" | "LAST_MILE";

export interface StaffProfile {
  id: string;
  phone: string;
  name: string | null;
  role: StaffRole;
  assigned_hub_id: string | null;
  error_points: number;
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

export interface OcrResult {
  sender_name: string | null;
  sender_phone: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  delivery_address: string | null;
  delivery_pincode: string | null;
  declared_value: number | null;
  weight_grams: number | null;
}

export interface ManifestStop {
  sequence: number;
  lat: number | null;
  lng: number | null;
  needs_manual_location: boolean;
  shipments: Shipment[];
}

export interface Manifest {
  stops: ManifestStop[];
  total_packages: number;
}

export class ApiError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  constructor(
    public status: number,
    message: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function parseErrorDetail(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const detail = body.detail;
  if (detail && typeof detail === "object") {
    return new ApiError(res.status, detail.message ?? "Request failed", detail.code, detail);
  }
  return new ApiError(res.status, typeof detail === "string" ? detail : `Request failed with ${res.status}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (!(init?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = useAuthStore.getState().accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) throw await parseErrorDetail(res);
  return res.json() as Promise<T>;
}

function toFormData(uris: { uri: string; name: string; type: string }[], field = "files"): FormData {
  const form = new FormData();
  for (const f of uris) {
    // @ts-expect-error React Native's FormData accepts this file-like shape
    form.append(field, { uri: f.uri, name: f.name, type: f.type });
  }
  return form;
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

  me: () => request<StaffProfile>("/auth/me"),

  resolve: (code: string) => {
    const upper = code.trim().toUpperCase();
    if (upper.startsWith("TRK-")) return Promise.resolve({ type: "PARCEL" as const, id: upper });
    if (upper.startsWith("BAG-")) return Promise.resolve({ type: "BAG" as const, id: upper });
    return request<{ type: "PARCEL" | "BAG"; id: string }>(`/resolve/${encodeURIComponent(upper)}`);
  },

  ocrBill: (photo: { uri: string; name: string; type: string }) =>
    request<OcrResult>("/ocr/bill", { method: "POST", body: toFormData([photo], "file") }),

  msmeByPhone: (phone: string) => request<{ id: string; business_name: string; owner_name: string | null; phone: string; pincode: string | null }>(`/msmes/by-phone/${encodeURIComponent(phone)}`),

  getShipment: (trackingId: string) => request<Shipment>(`/shipments/${trackingId}`),

  confirmIntake: (
    trackingId: string,
    payload: {
      recipient_name?: string | null;
      recipient_phone?: string | null;
      delivery_address?: string | null;
      delivery_pincode?: string | null;
      weight_grams?: number | null;
      declared_value?: number | null;
      msme_phone?: string | null;
      msme_business_name?: string | null;
      staff_lat?: number | null;
      staff_lng?: number | null;
    }
  ) => request<Shipment>(`/shipments/${trackingId}/intake`, { method: "POST", body: JSON.stringify(payload) }),

  uploadConditionPhotos: (trackingId: string, photos: { uri: string; name: string; type: string }[]) =>
    request<{ tracking_id: string; condition_photo_urls: string[] }>(`/shipments/${trackingId}/condition-photos`, {
      method: "POST",
      body: toFormData(photos, "files"),
    }),

  getBag: (bagId: string) => request<Bag>(`/bags/${bagId}`),

  bindBag: (bagId: string, destinationHubId: string) =>
    request<Bag>(`/bags/${bagId}/bind`, { method: "POST", body: JSON.stringify({ destination_hub_id: destinationHubId }) }),

  scanChild: (bagId: string, trackingId: string, tamperSealId?: string, lat?: number, lng?: number) =>
    request<{ shipment: Shipment; bag_child_count: number }>(`/bags/${bagId}/scan-child`, {
      method: "POST",
      body: JSON.stringify({ tracking_id: trackingId, tamper_seal_id: tamperSealId ?? null, staff_lat: lat ?? null, staff_lng: lng ?? null }),
    }),

  dispatchBag: (bagId: string, actualWeight: number) =>
    request<{
      bag: Bag;
      expected_weight: number;
      actual_weight: number;
      tolerance_pct: number;
      diff_pct: number;
      within_tolerance: boolean;
    }>(`/bags/${bagId}/dispatch`, { method: "POST", body: JSON.stringify({ actual_weight: actualWeight }) }),

  listHubs: () => request<{ id: string; name: string; type: string; gps_lat: number; gps_lng: number }[]>("/hubs"),

  departBag: (bagId: string, lat?: number, lng?: number) =>
    request<Bag>(`/bags/${bagId}/depart`, { method: "POST", body: JSON.stringify({ staff_lat: lat ?? null, staff_lng: lng ?? null }) }),

  arriveBag: (bagId: string, lat: number | undefined, lng: number | undefined, viaShortcode: boolean, softAuditTrackingIds: string[]) =>
    request<Bag>(`/bags/${bagId}/arrive`, {
      method: "POST",
      body: JSON.stringify({ staff_lat: lat ?? null, staff_lng: lng ?? null, via_shortcode: viaShortcode, soft_audit_tracking_ids: softAuditTrackingIds }),
    }),

  unsealBag: (bagId: string, lat?: number, lng?: number) =>
    request<Bag>(`/bags/${bagId}/unseal`, { method: "POST", body: JSON.stringify({ staff_lat: lat ?? null, staff_lng: lng ?? null }) }),

  claimChild: (bagId: string, trackingId: string, lat?: number, lng?: number) =>
    request<{ shipment: Shipment; stowaway: boolean; penalized_staff_id: string | null; message: string | null }>(`/bags/${bagId}/claim-child`, {
      method: "POST",
      body: JSON.stringify({ tracking_id: trackingId, staff_lat: lat ?? null, staff_lng: lng ?? null }),
    }),

  getClaimed: () => request<Shipment[]>("/agent/claimed"),

  proceedToDeliver: () => request<{ manifest_size: number; notified: number }>("/agent/proceed-to-deliver", { method: "POST" }),

  getManifest: (lat?: number, lng?: number) => {
    const params = lat !== undefined && lng !== undefined ? `?lat=${lat}&lng=${lng}` : "";
    return request<Manifest>(`/agent/manifest${params}`);
  },

  deliverShipment: (trackingId: string, otp: string, lat?: number, lng?: number) =>
    request<Shipment>(`/shipments/${trackingId}/deliver`, {
      method: "POST",
      body: JSON.stringify({ otp, staff_lat: lat ?? null, staff_lng: lng ?? null }),
    }),

  rtoShipment: (trackingId: string, reason: string | undefined, lat?: number, lng?: number) =>
    request<Shipment>(`/shipments/${trackingId}/rto`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null, staff_lat: lat ?? null, staff_lng: lng ?? null }),
    }),

  syncBagEvents: (events: BagEvent[]) =>
    request<SyncResult[]>("/sync/bag-events", {
      method: "POST",
      body: JSON.stringify({
        events: events.map((e) => ({
          client_event_id: e.clientEventId,
          action: e.action,
          bag_id: e.bagId,
          lat: e.lat ?? null,
          lng: e.lng ?? null,
          client_timestamp: e.clientTimestamp,
          via_shortcode: e.viaShortcode ?? false,
          soft_audit_tracking_ids: e.softAuditTrackingIds ?? [],
        })),
      }),
    }),
};

// Offline-queueable line-haul actions — mirrors what /sync/bag-events expects.
export interface BagEvent {
  clientEventId: string;
  action: "DEPART" | "ARRIVE";
  bagId: string;
  lat?: number;
  lng?: number;
  clientTimestamp: string; // ISO 8601, captured at scan time on-device
  viaShortcode?: boolean;
  softAuditTrackingIds?: string[];
}

export interface SyncResult {
  client_event_id: string;
  status: "applied" | "discarded_stale" | "failed";
  message: string | null;
  bag: Bag | null;
}
