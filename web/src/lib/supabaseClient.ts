import { createClient } from "@supabase/supabase-js";

// Anon-key client, used ONLY for the Live Topology Map / Security Inbox's
// Realtime subscription to tracking_events (bag-scoped rows only — see
// supabase/migrations/0003_phase5_realtime.sql). Every other piece of data
// on this dashboard comes from FastAPI, never this client directly.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseRealtime = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export interface RawTrackingEvent {
  id: string;
  tracking_id: string | null;
  bag_id: string | null;
  event_type: string;
  lat: number | null;
  lng: number | null;
  staff_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}
