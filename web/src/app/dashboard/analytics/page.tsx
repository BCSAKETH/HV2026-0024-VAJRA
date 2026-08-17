"use client";

import { useEffect, useState } from "react";

import { KpiCards } from "@/components/dashboard/KpiCards";
import { type KpiOut, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

const POLL_INTERVAL_MS = 20_000;

const STATUS_LABELS: Record<string, string> = {
  PRE_ALLOCATED: "Label printed",
  CREATED: "Intake confirmed",
  IN_BAG: "Consolidated",
  IN_TRANSIT: "In transit",
  ASSUMED_AT_HUB: "Assumed at hub",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Returned (RTO)",
  COMPROMISED: "Compromised",
};

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "bg-sage",
  RTO: "bg-brick",
  COMPROMISED: "bg-brick",
  IN_TRANSIT: "bg-orange",
  OUT_FOR_DELIVERY: "bg-orange",
};

export default function AnalyticsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { previewHubId } = useDashboard();
  const [kpis, setKpis] = useState<KpiOut | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = () => api.getKpis(accessToken, previewHubId).then(setKpis);
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, previewHubId]);

  const breakdown = kpis?.status_breakdown ?? {};
  const maxCount = Math.max(1, ...Object.values(breakdown));
  const totalCounted = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <main className="p-8">
      {kpis?.scope.type === "HUB" ? <p className="mb-4 font-mono text-xs uppercase tracking-widest text-orange">Scoped to {kpis.scope.hub_name}</p> : null}

      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>

      <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
        <p className="mb-1 font-serif text-xl text-navy">Shipments by Status</p>
        <p className="mb-5 text-sm text-navy/50">{totalCounted} shipment{totalCounted === 1 ? "" : "s"} in this scope (excluding pre-allocated labels)</p>

        {Object.keys(breakdown).length === 0 ? (
          <p className="text-navy/40">No shipment activity yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.entries(breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([statusKey, count]) => (
                <div key={statusKey} className="flex items-center gap-4">
                  <span className="w-40 shrink-0 text-sm text-navy">{STATUS_LABELS[statusKey] ?? statusKey}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy/5">
                    <div
                      className={`h-full rounded-full ${STATUS_COLOR[statusKey] ?? "bg-indigo"}`}
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-sm text-navy">{count}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
