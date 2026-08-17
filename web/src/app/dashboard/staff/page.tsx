"use client";

import { useEffect, useState } from "react";

import { ALL_STAFF_ROLES, ApiError, HUB_MANAGER_CREATABLE_ROLES, type Staff, type StaffRole, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

const ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin",
  HUB_MANAGER: "Hub Manager",
  WAREHOUSE_STAFF: "Warehouse Staff",
  LINE_HAUL: "Line-Haul Driver",
  LAST_MILE: "Last-Mile Agent",
};

export default function StaffPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentStaff = useAuthStore((s) => s.staff);
  const { hubs, previewHubId } = useDashboard();

  const isHubManager = currentStaff?.role === "HUB_MANAGER";
  const creatableRoles = isHubManager ? HUB_MANAGER_CREATABLE_ROLES : ALL_STAFF_ROLES;

  const [roster, setRoster] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("+91");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>(creatableRoles[0]);
  const [hubId, setHubId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!accessToken) return;
    setLoading(true);
    api
      .listStaff(accessToken, previewHubId)
      .then(setRoster)
      .finally(() => setLoading(false));
  }

  useEffect(load, [accessToken, previewHubId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createStaff(accessToken, {
        phone,
        name: name || null,
        role,
        // Hub Managers never send a hub choice — the backend forces it to
        // their own hub regardless, so the field is hidden for them entirely.
        assigned_hub_id: isHubManager ? null : role === "SUPER_ADMIN" ? null : hubId || null,
      });
      setPhone("+91");
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this staff member.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    if (!confirm("Remove this staff member? They will lose access immediately.")) return;
    try {
      await api.deleteStaff(accessToken, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this staff member.");
    }
  }

  function hubName(id: string | null) {
    if (!id) return "—";
    return hubs.find((h) => h.id === id)?.name ?? id;
  }

  return (
    <main className="p-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">
            Roster {isHubManager ? "— your hub" : ""} ({roster.length})
          </p>
          {loading ? (
            <p className="text-navy/40">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-navy/40">No staff yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {roster.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-navy/10 px-4 py-3">
                  <div>
                    <p className="text-navy">
                      {s.name ?? "Unnamed"} <span className="font-mono text-xs text-navy/40">{s.phone}</span>
                    </p>
                    <p className="text-xs text-navy/50">
                      {ROLE_LABEL[s.role]} · {hubName(s.assigned_hub_id)}
                      {s.error_points > 0 ? <span className="ml-2 text-brick">{s.error_points} error pt{s.error_points === 1 ? "" : "s"}</span> : null}
                    </p>
                  </div>
                  {s.id !== currentStaff?.id ? (
                    <button onClick={() => handleDelete(s.id)} className="rounded-lg border border-brick px-3 py-1.5 text-xs font-semibold text-brick hover:bg-brick/5">
                      Remove
                    </button>
                  ) : (
                    <span className="text-xs text-navy/30">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">Add Staff</p>
          {isHubManager ? <p className="mb-4 text-sm text-navy/50">New staff are automatically assigned to your hub.</p> : null}

          <label className="mb-1 block text-sm font-medium text-navy">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" />

          <label className="mb-1 block text-sm font-medium text-navy">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" />

          <label className="mb-1 block text-sm font-medium text-navy">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
            {creatableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>

          {!isHubManager && role !== "SUPER_ADMIN" ? (
            <>
              <label className="mb-1 block text-sm font-medium text-navy">Hub</label>
              <select value={hubId} onChange={(e) => setHubId(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
                <option value="">Select a hub…</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {error ? <p className="mb-3 text-sm text-brick">{error}</p> : null}

          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {submitting ? "Adding…" : "Add Staff"}
          </button>
        </form>
      </div>
    </main>
  );
}
