"use client";

import { useEffect, useState } from "react";

import { KpiCards } from "@/components/dashboard/KpiCards";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { type AnalyticsOut, type KpiOut, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

const POLL_INTERVAL_MS = 20_000;

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "bg-sage",
  RTO: "bg-brick",
  COMPROMISED: "bg-brick",
  IN_TRANSIT: "bg-orange",
  OUT_FOR_DELIVERY: "bg-orange",
};

const STAT_ACCENT: Record<string, string> = {
  indigo: "border-l-indigo",
  sage: "border-l-sage",
  brick: "border-l-brick",
  orange: "border-l-orange",
};

function StatCard({ label, value, sub, accent = "indigo" }: { label: string; value: string | number; sub?: string; accent?: keyof typeof STAT_ACCENT }) {
  return (
    <div className={`rounded-xl border border-navy/10 border-l-4 bg-white p-4 ${STAT_ACCENT[accent]}`}>
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
  const { t } = useTranslation();
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

  const defenseNotes: Record<number, string | undefined> = {
    4: t.analytics.defenseNoteTransitLeakage,
    8: t.analytics.defenseNoteRouteEfficiency,
    10: t.analytics.defenseNoteHandover,
  };

  return (
    <main className="p-8">
      {analytics?.scope_type === "HUB" ? (
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-orange">
          {t.analytics.scopedTo} {analytics.scope_hub_name}
        </p>
      ) : null}

      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>

      {analytics ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t.analytics.intake} value={analytics.throughput.intake_count} accent="indigo" />
          <StatCard label={t.analytics.delivered} value={analytics.throughput.delivered_count} accent="sage" />
          <StatCard label={t.analytics.rtoRate} value={`${analytics.throughput.rto_rate_pct}%`} sub={`${analytics.throughput.rto_count} ${t.analytics.returned}`} accent="brick" />
          <StatCard label={t.analytics.bagsAwaitingPickup} value={analytics.throughput.bags_awaiting_pickup} sub={t.analytics.bagsAwaitingPickupSub} accent="orange" />
          <StatCard
            label={t.analytics.avgDwellTime}
            value={analytics.throughput.avg_dwell_hours !== null ? `${analytics.throughput.avg_dwell_hours}h` : "—"}
            sub={t.analytics.avgDwellTimeSub}
            accent="orange"
          />
          <StatCard
            label={t.analytics.valueInTransit}
            value={formatMoney(analytics.value_risk.value_in_transit)}
            sub={`${t.analytics.ofTotal} ${formatMoney(analytics.value_risk.total_declared_value)} ${t.analytics.total}`}
            accent="indigo"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">{t.analytics.shipmentsByStatus}</p>
          <p className="mb-5 text-sm text-navy/50">
            {totalCounted} {t.analytics.shipmentInScope}
          </p>

          {Object.keys(breakdown).length === 0 ? (
            <p className="text-navy/40">{t.analytics.noShipmentActivity}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {Object.entries(breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([statusKey, count]) => (
                  <div key={statusKey} className="flex items-center gap-4">
                    <span className="w-40 shrink-0 text-sm text-navy">{t.analytics.statusLabels[statusKey as keyof typeof t.analytics.statusLabels] ?? statusKey}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy/5">
                      <div className={`h-full rounded-full ${STATUS_COLOR[statusKey] ?? "bg-indigo"}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-sm text-navy">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">{t.analytics.defenseActivity}</p>
          <p className="mb-5 text-sm text-navy/50">{t.analytics.defenseActivitySub}</p>
          {!analytics ? (
            <p className="text-navy/40">…</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {analytics.defenses.map((d) => (
                <div key={d.number}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 font-mono text-xs text-navy/40">#{d.number}</span>
                    <span className="w-44 shrink-0 text-sm text-navy">{t.analytics.defenseNames[d.number - 1]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/5">
                      <div className={`h-full rounded-full ${d.count > 0 ? "bg-brick" : "bg-navy/10"}`} style={{ width: `${(d.count / maxDefenseCount) * 100}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-sm text-navy">{d.count}</span>
                  </div>
                  {defenseNotes[d.number] ? <p className="ml-9 mt-0.5 text-xs text-navy/35">{defenseNotes[d.number]}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">{t.analytics.staffAccountability}</p>
          <p className="mb-5 text-sm text-navy/50">{t.analytics.staffAccountabilitySub}</p>
          {!analytics || analytics.staff_leaderboard.length === 0 ? (
            <p className="text-navy/40">{t.analytics.noErrorPoints}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {analytics.staff_leaderboard.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-navy/10 px-3 py-2">
                  <div>
                    <span className="mr-2 font-mono text-xs text-navy/30">#{i + 1}</span>
                    <span className="text-sm text-navy">{s.name ?? "Unnamed"}</span>
                    <span className="ml-2 text-xs text-navy/40">{t.roles[s.role as keyof typeof t.roles] ?? s.role}</span>
                  </div>
                  <span className="font-mono text-sm text-brick">{s.error_points} {s.error_points === 1 ? t.securityInbox.errorPoint : t.securityInbox.errorPoints}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-1 font-serif text-xl text-navy">{t.analytics.msmesAndRoutingGaps}</p>
          <p className="mb-5 text-sm text-navy/50">
            {analytics ? `${analytics.msme_stats.total_msmes} ${t.analytics.msmeOnFile}` : "…"}
          </p>

          {analytics && analytics.msme_stats.top_by_volume.length > 0 ? (
            <div className="mb-5 flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">{t.analytics.topMsmesByVolume}</p>
              {analytics.msme_stats.top_by_volume.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-navy">{m.business_name}</span>
                  <span className="font-mono text-navy/50">
                    {m.shipment_count} {t.analytics.shipmentWord}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">
            {t.analytics.routingGaps} {analytics ? `(${analytics.routing_gaps.length})` : ""}
          </p>
          {!analytics || analytics.routing_gaps.length === 0 ? (
            <p className="text-sm text-navy/40">{t.analytics.noRoutingGaps}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {analytics.routing_gaps.map((g) => (
                <div key={g.pincode} className="flex items-center justify-between rounded-lg border border-brick/20 bg-brick/5 px-3 py-1.5 text-sm">
                  <span className="font-mono text-navy">{g.pincode}</span>
                  <span className="text-brick">
                    {g.shipment_count} {t.analytics.shipmentsNoRouteConfigured}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
