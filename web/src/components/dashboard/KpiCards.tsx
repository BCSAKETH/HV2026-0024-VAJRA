"use client";

import type { KpiOut } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";

function KpiCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent: "indigo" | "sage" | "brick" }) {
  const valueColor = accent === "sage" ? "text-sage" : accent === "brick" ? "text-brick" : "text-navy";
  const iconBg = accent === "sage" ? "bg-sage/10 text-sage" : accent === "brick" ? "bg-brick/10 text-brick" : "bg-indigo/10 text-indigo";
  return (
    <div className="flex items-center gap-4 rounded-card border border-navy/10 bg-white p-6 shadow-card">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${iconBg}`}>{icon}</span>
      <div>
        <p className="mb-1 text-sm font-medium uppercase tracking-wide text-navy/50">{label}</p>
        <p className={`font-mono text-3xl ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
}

export function KpiCards({ kpis }: { kpis: KpiOut | null }) {
  const { t } = useTranslation();

  if (!kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border border-navy/10 bg-white shadow-card" />
        ))}
      </div>
    );
  }

  const integrityAccent = kpis.network_integrity_index >= 95 ? "sage" : kpis.network_integrity_index < 80 ? "brick" : "indigo";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard label={t.kpi.totalActiveOrders} value={kpis.total_active_orders.toLocaleString()} icon="📦" accent="indigo" />
      <KpiCard label={t.kpi.averageTat} value={kpis.average_tat_hours !== null ? `${kpis.average_tat_hours}h` : "—"} icon="⏱" accent="indigo" />
      <KpiCard label={t.kpi.networkIntegrityIndex} value={`${kpis.network_integrity_index}%`} icon="🛡" accent={integrityAccent} />
    </div>
  );
}
