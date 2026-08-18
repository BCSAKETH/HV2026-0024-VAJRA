"use client";

import type { KpiOut } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: "sage" | "brick" }) {
  const valueColor = accent === "sage" ? "text-sage" : accent === "brick" ? "text-brick" : "text-navy";
  return (
    <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-navy/50">{label}</p>
      <p className={`font-mono text-4xl ${valueColor}`}>{value}</p>
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

  const integrityAccent = kpis.network_integrity_index >= 95 ? "sage" : kpis.network_integrity_index < 80 ? "brick" : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard label={t.kpi.totalActiveOrders} value={kpis.total_active_orders.toLocaleString()} />
      <KpiCard label={t.kpi.averageTat} value={kpis.average_tat_hours !== null ? `${kpis.average_tat_hours}h` : "—"} />
      <KpiCard label={t.kpi.networkIntegrityIndex} value={`${kpis.network_integrity_index}%`} accent={integrityAccent} />
    </div>
  );
}
