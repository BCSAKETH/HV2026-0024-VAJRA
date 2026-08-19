"use client";

import { useEffect, useState } from "react";

import { KpiCards } from "@/components/dashboard/KpiCards";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { type AnalyticsOut, type KpiOut, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

const POLL_INTERVAL_MS = 20_000;

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "bg-gradient-to-r from-sage to-[#4E7355]",
  RTO: "bg-gradient-to-r from-brick to-[#8A2F22]",
  COMPROMISED: "bg-gradient-to-r from-brick to-[#8A2F22]",
  IN_TRANSIT: "bg-gradient-to-r from-orange to-[#C2540F]",
  OUT_FOR_DELIVERY: "bg-gradient-to-r from-orange to-[#C2540F]",
};

// Every metric gets its own hex, not a small enum of Tailwind classes — this
// is the "limitless colors" pass: icon chip, number, and accent border all
// key off one value per stat instead of four reused theme colors.
const STAT_STYLE: Record<string, { hex: string; icon: string }> = {
  intake: { hex: "#4F46E5", icon: "📥" },
  delivered: { hex: "#2F9E5B", icon: "✅" },
  rtoRate: { hex: "#D6336C", icon: "↩️" },
  bagsAwaitingPickup: { hex: "#E76F2F", icon: "🧳" },
  avgDwellTime: { hex: "#0EA5A5", icon: "⏱️" },
  valueInTransit: { hex: "#7C3AED", icon: "💰" },
  todayQrTracking: { hex: "#F59E0B", icon: "🏷️" },
  todayQrBag: { hex: "#3B82F6", icon: "🎒" },
};

function StatCard({ statKey, label, value, sub }: { statKey: keyof typeof STAT_STYLE; label: string; value: string | number; sub?: string }) {
  const { hex, icon } = STAT_STYLE[statKey];
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-navy/8 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderTop: `3px solid ${hex}` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy/45">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-base" style={{ backgroundColor: `${hex}1A` }}>
          {icon}
        </span>
      </div>
      <p className="font-serif text-3xl text-navy" style={{ color: hex }}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-navy/40">{sub}</p> : null}
    </div>
  );
}

function SectionCard({ title, sub, accent, children }: { title: string; sub: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="mb-1 font-serif text-xl text-navy">{title}</p>
      <p className="mb-5 text-sm text-navy/50">{sub}</p>
      {children}
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
  const maxTrendCount = Math.max(1, ...(analytics?.qr_generation.trend_7d.map((d) => d.tracking_count + d.bag_count) ?? [1]));

  const defenseNotes: Record<number, string | undefined> = {
    4: t.analytics.defenseNoteTransitLeakage,
    8: t.analytics.defenseNoteRouteEfficiency,
    10: t.analytics.defenseNoteHandover,
  };

  return (
    <main className="p-8">
      <div className="mb-6">
        <p className="font-serif text-3xl text-navy">📊 {t.nav.analytics}</p>
        {analytics?.scope_type === "HUB" ? (
          <p className="mt-1 inline-block rounded-full border border-orange/25 bg-orange/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-orange">
            {t.analytics.scopedTo} {analytics.scope_hub_name}
          </p>
        ) : null}
      </div>

      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>

      {analytics ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard statKey="intake" label={t.analytics.intake} value={analytics.throughput.intake_count} />
          <StatCard statKey="delivered" label={t.analytics.delivered} value={analytics.throughput.delivered_count} />
          <StatCard
            statKey="rtoRate"
            label={t.analytics.rtoRate}
            value={`${analytics.throughput.rto_rate_pct}%`}
            sub={`${analytics.throughput.rto_count} ${t.analytics.returned}`}
          />
          <StatCard
            statKey="bagsAwaitingPickup"
            label={t.analytics.bagsAwaitingPickup}
            value={analytics.throughput.bags_awaiting_pickup}
            sub={t.analytics.bagsAwaitingPickupSub}
          />
          <StatCard
            statKey="avgDwellTime"
            label={t.analytics.avgDwellTime}
            value={analytics.throughput.avg_dwell_hours !== null ? `${analytics.throughput.avg_dwell_hours}h` : "—"}
            sub={t.analytics.avgDwellTimeSub}
          />
          <StatCard
            statKey="valueInTransit"
            label={t.analytics.valueInTransit}
            value={formatMoney(analytics.value_risk.value_in_transit)}
            sub={`${t.analytics.ofTotal} ${formatMoney(analytics.value_risk.total_declared_value)} ${t.analytics.total}`}
          />
          <StatCard statKey="todayQrTracking" label={t.analytics.todayQrTracking} value={analytics.qr_generation.today_tracking} />
          <StatCard statKey="todayQrBag" label={t.analytics.todayQrBag} value={analytics.qr_generation.today_bag} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t.analytics.shipmentsByStatus} sub={`${totalCounted} ${t.analytics.shipmentInScope}`} accent="#4F46E5">
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
                      <div className={`h-full rounded-full ${STATUS_COLOR[statusKey] ?? "bg-gradient-to-r from-indigo to-[#3730A3]"}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-sm text-navy">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t.analytics.defenseActivity} sub={t.analytics.defenseActivitySub} accent="#D6336C">
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
                      <div
                        className={`h-full rounded-full ${d.count > 0 ? "bg-gradient-to-r from-brick to-[#8A2F22]" : "bg-navy/10"}`}
                        style={{ width: `${(d.count / maxDefenseCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-sm text-navy">{d.count}</span>
                  </div>
                  {defenseNotes[d.number] ? <p className="ml-9 mt-0.5 text-xs text-navy/35">{defenseNotes[d.number]}</p> : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t.analytics.staffAccountability} sub={t.analytics.staffAccountabilitySub} accent="#F59E0B">
          {!analytics || analytics.staff_leaderboard.length === 0 ? (
            <p className="text-navy/40">{t.analytics.noErrorPoints}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {analytics.staff_leaderboard.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-navy/8 bg-navy/[0.02] px-3 py-2">
                  <div>
                    <span className="mr-2 font-mono text-xs text-navy/30">#{i + 1}</span>
                    <span className="text-sm text-navy">{s.name ?? "Unnamed"}</span>
                    <span className="ml-2 text-xs text-navy/40">{t.roles[s.role as keyof typeof t.roles] ?? s.role}</span>
                  </div>
                  <span className="rounded-full bg-brick/10 px-2.5 py-1 font-mono text-xs font-semibold text-brick">
                    {s.error_points} {s.error_points === 1 ? t.securityInbox.errorPoint : t.securityInbox.errorPoints}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={t.analytics.msmesAndRoutingGaps}
          sub={analytics ? `${analytics.msme_stats.total_msmes} ${t.analytics.msmeOnFile}` : "…"}
          accent="#2F9E5B"
        >
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
        </SectionCard>

        <SectionCard title={t.analytics.qrGenerationTitle} sub={t.analytics.qrGenerationSub} accent="#3B82F6">
          {!analytics ? (
            <p className="text-navy/40">…</p>
          ) : (
            <>
              <div className="mb-4 flex gap-3 text-sm">
                <span className="rounded-xl px-3 py-2" style={{ backgroundColor: "#F59E0B1A" }}>
                  <span className="font-mono font-semibold text-navy">{analytics.qr_generation.total_tracking}</span>{" "}
                  <span className="text-navy/60">
                    {t.analytics.trackingIds} · {t.analytics.allTime}
                  </span>
                </span>
                <span className="rounded-xl px-3 py-2" style={{ backgroundColor: "#3B82F61A" }}>
                  <span className="font-mono font-semibold text-navy">{analytics.qr_generation.total_bag}</span>{" "}
                  <span className="text-navy/60">
                    {t.analytics.bagIds} · {t.analytics.allTime}
                  </span>
                </span>
              </div>

              {analytics.qr_generation.by_hub.length > 0 ? (
                <div className="mb-4 flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">{t.analytics.byHub}</p>
                  {analytics.qr_generation.by_hub.map((h) => (
                    <div key={h.hub_name} className="flex items-center justify-between text-sm">
                      <span className="text-navy">{h.hub_name}</span>
                      <span className="font-mono text-navy/50">
                        {h.tracking_count} {t.analytics.trackingIds} · {h.bag_count} {t.analytics.bagIds}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-navy/50">{t.analytics.trend7d}</p>
              {analytics.qr_generation.trend_7d.every((d) => d.tracking_count + d.bag_count === 0) ? (
                <p className="text-sm text-navy/40">{t.analytics.noQrGenerationYet}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {analytics.qr_generation.trend_7d.map((d) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 font-mono text-xs text-navy/40">
                        {new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-navy/5">
                        <div className="h-full bg-gradient-to-r from-[#F59E0B] to-orange" style={{ width: `${(d.tracking_count / maxTrendCount) * 100}%` }} />
                        <div className="h-full bg-gradient-to-r from-indigo to-[#3B82F6]" style={{ width: `${(d.bag_count / maxTrendCount) * 100}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-navy">{d.tracking_count + d.bag_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
