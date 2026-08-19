"use client";

import { useEffect, useState } from "react";

import { ApiError, type PincodeRoute, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useAuthStore } from "@/lib/store/auth";

export default function NetworkPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentStaff = useAuthStore((s) => s.staff);
  const isSuperAdmin = currentStaff?.role === "SUPER_ADMIN";
  const { hubs, refreshHubs, previewHubId } = useDashboard();
  const { t } = useTranslation();

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
      setError(err instanceof ApiError ? err.message : t.network.couldNotAddHub);
    } finally {
      setCreatingHub(false);
    }
  }

  async function handleDeleteHub(id: string) {
    if (!accessToken) return;
    if (!confirm(t.network.deleteHubConfirm)) return;
    try {
      await api.deleteHub(accessToken, id);
      refreshHubs();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The backend's 409 is a generic "routes still point to it" string —
        // it doesn't name which ones. Rather than changing that response
        // shape, look the blocking routes up ourselves: fetch the
        // network-wide route list (not the possibly-hub-scoped `routes`
        // state, which could be filtered under a Super Admin's active
        // preview) and filter to this hub, so the message names exactly
        // what needs removing before the delete can succeed.
        const allRoutes = await api.listPincodeRoutes(accessToken, null).catch(() => routes);
        const blocking = allRoutes.filter((r) => r.destination_hub_id === id);
        setError(
          blocking.length > 0
            ? `${t.network.deleteHubBlockedPrefix} ${blocking.map((r) => r.pincode).join(", ")}`
            : err.message
        );
      } else {
        setError(err instanceof ApiError ? err.message : t.network.couldNotDeleteHub);
      }
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
      setError(err instanceof ApiError ? err.message : t.network.couldNotAddRoute);
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
      setError(err instanceof ApiError ? err.message : t.network.couldNotRemoveRoute);
    }
  }

  return (
    <main className="p-8">
      {error ? <p className="mb-4 text-brick">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hubs — Super Admin only manages; everyone can see the list */}
        <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: "3px solid #2F9E5B" }}>
          <p className="mb-4 font-serif text-xl text-navy">
            📍 {t.network.hubs} ({hubs.length})
          </p>
          <div className="mb-5 flex flex-col gap-2">
            {hubs.map((h) => {
              const isSorting = h.type === "SORTING_CENTER";
              return (
                <div key={h.id} className="flex items-center gap-3 rounded-xl border border-navy/10 px-4 py-3 transition hover:border-navy/20">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
                      isSorting ? "bg-indigo/10 text-indigo" : "bg-orange/10 text-orange"
                    }`}
                  >
                    {isSorting ? "⬡" : "▣"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-navy">{h.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isSorting ? "bg-indigo/10 text-indigo" : "bg-orange/10 text-orange"
                        }`}
                      >
                        {isSorting ? t.network.sortingCenter : t.network.warehouse}
                      </span>
                      <span className="font-mono text-xs text-navy/40">
                        {h.gps_lat.toFixed(4)}, {h.gps_lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  {isSuperAdmin ? (
                    <button onClick={() => handleDeleteHub(h.id)} className="shrink-0 rounded-lg border border-brick px-3 py-1.5 text-xs font-semibold text-brick hover:bg-brick/5">
                      {t.common.remove}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {hubs.length === 0 ? <p className="text-navy/40">{t.network.noHubsYet}</p> : null}
          </div>

          {isSuperAdmin ? (
            <form onSubmit={handleCreateHub} className="border-t border-navy/10 pt-4">
              <p className="mb-3 text-sm font-semibold text-navy">{t.network.addHub}</p>
              <input value={hubName} onChange={(e) => setHubName(e.target.value)} placeholder={t.network.hubName} className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" required />
              <select value={hubType} onChange={(e) => setHubType(e.target.value as "SORTING_CENTER" | "WAREHOUSE")} className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
                <option value="WAREHOUSE">{t.network.warehouse}</option>
                <option value="SORTING_CENTER">{t.network.sortingCenter}</option>
              </select>
              <div className="mb-3 flex gap-2">
                <input value={hubLat} onChange={(e) => setHubLat(e.target.value)} placeholder={t.network.latitude} className="w-1/2 rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
                <input value={hubLng} onChange={(e) => setHubLng(e.target.value)} placeholder={t.network.longitude} className="w-1/2 rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
              </div>
              <button type="submit" disabled={creatingHub} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {creatingHub ? t.common.adding : t.network.addHub}
              </button>
            </form>
          ) : (
            <p className="border-t border-navy/10 pt-4 text-sm text-navy/40">{t.network.onlySuperAdminHubs}</p>
          )}
        </div>

        {/* Pincode routes — Hub Manager scoped to their own hub, Super Admin sees/edits any */}
        <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: "3px solid #3B82F6" }}>
          <p className="mb-4 font-serif text-xl text-navy">
            🗺️ {t.network.pincodeRoutes} ({routes.length})
          </p>
          <div className="mb-5 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {routes.map((r) => (
              <div key={r.pincode} className="flex items-center justify-between rounded-xl border border-navy/10 px-4 py-2.5">
                <p className="font-mono text-navy">
                  {r.pincode} <span className="text-navy/40">→</span> {hubNameById(r.destination_hub_id)}
                </p>
                <button onClick={() => handleDeleteRoute(r.pincode)} className="rounded-lg border border-brick px-3 py-1 text-xs font-semibold text-brick hover:bg-brick/5">
                  {t.common.remove}
                </button>
              </div>
            ))}
            {routes.length === 0 ? <p className="text-navy/40">{t.network.noRoutesYet}</p> : null}
          </div>

          <form onSubmit={handleCreateRoute} className="border-t border-navy/10 pt-4">
            <p className="mb-3 text-sm font-semibold text-navy">{t.network.addRoute}</p>
            <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder={t.network.pincodePlaceholder} maxLength={6} className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" required />
            {isSuperAdmin ? (
              <select value={routeHubId} onChange={(e) => setRouteHubId(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" required>
                <option value="">{t.network.routesTo}</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mb-3 text-sm text-navy/50">{t.network.autoRoutedHint}</p>
            )}
            <button type="submit" disabled={creatingRoute} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {creatingRoute ? t.common.adding : t.network.addRoute}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
