"use client";

import { useEffect, useState } from "react";

import { KpiCards } from "@/components/dashboard/KpiCards";
import { type AnalyticsOut, type KpiOut, api } from "@/lib/api";
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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-navy/50">{label}</p>
      <p className="mt-1 font-serif text-2xl text-navy">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-navy/40">{sub}</p> : null}
    </div>
  );
}

function formatMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function AnalyticsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { previewHubId } = useDashboard();
  const [kpis, setKpis] = useState<KpiOut | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOut | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = () => {
      api.getKpis(accessToken, previewHubId).then(setKpis);
      api.getAnalytics(accessToken, previewHubId).then(setAnalytics);
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, previewHubId]);

  const breakdown = kpis?.status_breakdown ?? {};
  const maxCount = Math.max(1, ...Object.values(breakdown));
  const totalCounted = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const maxDefenseCount = Math.max(1, ...(analytics?.defenses.map((d) => d.count) ?? [1]));

  return (
    <main className="p-8">
      {analytics?.scope_type === "HUB" ? (
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-orange">Scoped to {analytics.scope_hub_name}</p>
      ) : null}

      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>

      {/* Throughput */}
      {analytics ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Intake" value={analytics.throughput.intake_count} />
          <StatCard label="Delivered" value={analytics.throughput.delivered_count} />
          <StatCard label="RTO rate" value={`${analytics.throughput.rto_rate_pct}%`} sub={`${analytics.throughput.rto_count} returned`} />
          <StatCard label="Bags awaiting pickup" value={analytics.throughput.bags_awaiting_pickup} sub="Arrived, not yet unsealed" />
          <StatCard label="Avg dwell time" value={analytics.throughput.avg_dwell_hours !== null ? `${analytics.throughput.avg_dwell_hours}h` : "—"} sub="Intake → delivered" />
          <StatCard label="Value in transit" value={formatMoney(analytics.value_risk.value_in_transit)} sub={`of ${formatMoney(analytics.value_risk.total_declared_value)} total`} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Shipments by status */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">Shipments by Status</p>
          <p className="mb-5 text-sm text-navy/50">{totalCounted} shipment{totalCounted === 1 ? "" : "s"} in this scope</p>

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
                      <div className={`h-full rounded-full ${STATUS_COLOR[statusKey] ?? "bg-indigo"}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-sm text-navy">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 10 Defenses */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">Defense Activity</p>
          <p className="mb-5 text-sm text-navy/50">All 10 fraud/error-prevention mechanisms, this scope</p>
          {!analytics ? (
            <p className="text-navy/40">Loading…</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {analytics.defenses.map((d) => (
                <div key={d.number}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 font-mono text-xs text-navy/40">#{d.number}</span>
                    <span className="w-44 shrink-0 text-sm text-navy">{d.name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/5">
                      <div className={`h-full rounded-full ${d.count > 0 ? "bg-brick" : "bg-navy/10"}`} style={{ width: `${(d.count / maxDefenseCount) * 100}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-sm text-navy">{d.count}</span>
                  </div>
                  {d.note ? <p className="ml-9 mt-0.5 text-xs text-navy/35">{d.note}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff accountability leaderboard */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">Staff Accountability</p>
          <p className="mb-5 text-sm text-navy/50">Ranked by error points (consolidation mistakes that triggered a stowaway auto-heal)</p>
          {!analytics || analytics.staff_leaderboard.length === 0 ? (
            <p className="text-navy/40">No error points on record — clean roster.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {analytics.staff_leaderboard.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-navy/10 px-3 py-2">
                  <div>
                    <span className="mr-2 font-mono text-xs text-navy/30">#{i + 1}</span>
                    <span className="text-sm text-navy">{s.name ?? "Unnamed"}</span>
                    <span className="ml-2 text-xs text-navy/40">{s.role}</span>
                  </div>
                  <span className="font-mono text-sm text-brick">{s.error_points} pt{s.error_points === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MSME + routing gaps */}
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">MSMEs &amp; Routing Gaps</p>
          <p className="mb-5 text-sm text-navy/50">
            {analytics ? `${analytics.msme_stats.total_msmes} MSME${analytics.msme_stats.total_msmes === 1 ? "" : "s"} on file (network-wide)` : "Loading…"}
          </p>

          {analytics && analytics.msme_stats.top_by_volume.length > 0 ? (
            <div className="mb-5 flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">Top MSMEs by volume</p>
              {analytics.msme_stats.top_by_volume.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-navy">{m.business_name}</span>
                  <span className="font-mono text-navy/50">{m.shipment_count} shipment{m.shipment_count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">
            Routing gaps {analytics ? `(${analytics.routing_gaps.length})` : ""}
          </p>
          {!analytics || analytics.routing_gaps.length === 0 ? (
            <p className="text-sm text-navy/40">No undelivered pincode has a missing route — network coverage looks complete.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {analytics.routing_gaps.map((g) => (
                <div key={g.pincode} className="flex items-center justify-between rounded-lg border border-brick/20 bg-brick/5 px-3 py-1.5 text-sm">
                  <span className="font-mono text-navy">{g.pincode}</span>
                  <span className="text-brick">{g.shipment_count} shipment{g.shipment_count === 1 ? "" : "s"} with no route configured</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
