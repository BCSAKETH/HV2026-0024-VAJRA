"use client";

import { useEffect, useState } from "react";

import { ApiError, type PincodeRoute, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

export default function NetworkPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentStaff = useAuthStore((s) => s.staff);
  const isSuperAdmin = currentStaff?.role === "SUPER_ADMIN";
  const { hubs, refreshHubs, previewHubId } = useDashboard();

  const [routes, setRoutes] = useState<PincodeRoute[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [hubName, setHubName] = useState("");
  const [hubType, setHubType] = useState<"SORTING_CENTER" | "WAREHOUSE">("WAREHOUSE");
  const [hubLat, setHubLat] = useState("");
  const [hubLng, setHubLng] = useState("");
  const [creatingHub, setCreatingHub] = useState(false);

  const [pincode, setPincode] = useState("");
  const [routeHubId, setRouteHubId] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);

  function loadRoutes() {
    if (!accessToken) return;
    api.listPincodeRoutes(accessToken, previewHubId).then(setRoutes);
  }

  useEffect(loadRoutes, [accessToken, previewHubId]);

  function hubNameById(id: string) {
    return hubs.find((h) => h.id === id)?.name ?? id;
  }

  async function handleCreateHub(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setCreatingHub(true);
    try {
      await api.createHub(accessToken, { name: hubName, type: hubType, gps_lat: Number(hubLat), gps_lng: Number(hubLng) });
      setHubName("");
      setHubLat("");
      setHubLng("");
      refreshHubs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this hub.");
    } finally {
      setCreatingHub(false);
    }
  }

  async function handleDeleteHub(id: string) {
    if (!accessToken) return;
    if (!confirm("Delete this hub? This is blocked if any pincode routes still point to it.")) return;
    try {
      await api.deleteHub(accessToken, id);
      refreshHubs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this hub.");
    }
  }

  async function handleCreateRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setCreatingRoute(true);
    try {
      await api.createPincodeRoute(accessToken, { pincode, destination_hub_id: isSuperAdmin ? routeHubId || null : null });
      setPincode("");
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this route.");
    } finally {
      setCreatingRoute(false);
    }
  }

  async function handleDeleteRoute(code: string) {
    if (!accessToken) return;
    try {
      await api.deletePincodeRoute(accessToken, code);
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this route.");
    }
  }

  return (
    <main className="p-8">
      {error ? <p className="mb-4 text-brick">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hubs — Super Admin only manages; everyone can see the list */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">Hubs ({hubs.length})</p>
          <div className="mb-5 flex flex-col gap-2">
            {hubs.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl border border-navy/10 px-4 py-3">
                <div>
                  <p className="text-navy">{h.name}</p>
                  <p className="font-mono text-xs text-navy/50">
                    {h.type} · {h.gps_lat.toFixed(4)}, {h.gps_lng.toFixed(4)}
                  </p>
                </div>
                {isSuperAdmin ? (
                  <button onClick={() => handleDeleteHub(h.id)} className="rounded-lg border border-brick px-3 py-1.5 text-xs font-semibold text-brick hover:bg-brick/5">
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {hubs.length === 0 ? <p className="text-navy/40">No hubs yet.</p> : null}
          </div>

          {isSuperAdmin ? (
            <form onSubmit={handleCreateHub} className="border-t border-navy/10 pt-4">
              <p className="mb-3 text-sm font-semibold text-navy">Add Hub</p>
              <input value={hubName} onChange={(e) => setHubName(e.target.value)} placeholder="Hub name" className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" required />
              <select value={hubType} onChange={(e) => setHubType(e.target.value as "SORTING_CENTER" | "WAREHOUSE")} className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
                <option value="WAREHOUSE">Warehouse</option>
                <option value="SORTING_CENTER">Sorting Center</option>
              </select>
              <div className="mb-3 flex gap-2">
                <input value={hubLat} onChange={(e) => setHubLat(e.target.value)} placeholder="Latitude" className="w-1/2 rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
                <input value={hubLng} onChange={(e) => setHubLng(e.target.value)} placeholder="Longitude" className="w-1/2 rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
              </div>
              <button type="submit" disabled={creatingHub} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {creatingHub ? "Adding…" : "Add Hub"}
              </button>
            </form>
          ) : (
            <p className="border-t border-navy/10 pt-4 text-sm text-navy/40">Only Super Admin can add or remove hubs.</p>
          )}
        </div>

        {/* Pincode routes — Hub Manager scoped to their own hub, Super Admin sees/edits any */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">Pincode Routes ({routes.length})</p>
          <div className="mb-5 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {routes.map((r) => (
              <div key={r.pincode} className="flex items-center justify-between rounded-xl border border-navy/10 px-4 py-2.5">
                <p className="font-mono text-navy">
                  {r.pincode} <span className="text-navy/40">→</span> {hubNameById(r.destination_hub_id)}
                </p>
                <button onClick={() => handleDeleteRoute(r.pincode)} className="rounded-lg border border-brick px-3 py-1 text-xs font-semibold text-brick hover:bg-brick/5">
                  Remove
                </button>
              </div>
            ))}
            {routes.length === 0 ? <p className="text-navy/40">No pincode routes yet.</p> : null}
          </div>

          <form onSubmit={handleCreateRoute} className="border-t border-navy/10 pt-4">
            <p className="mb-3 text-sm font-semibold text-navy">Add Route</p>
            <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="6-digit pincode" maxLength={6} className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
            {isSuperAdmin ? (
              <select value={routeHubId} onChange={(e) => setRouteHubId(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" required>
                <option value="">Routes to…</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mb-3 text-sm text-navy/50">Automatically routed to your hub.</p>
            )}
            <button type="submit" disabled={creatingRoute} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {creatingRoute ? "Adding…" : "Add Route"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
