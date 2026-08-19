"use client";

import type { KpiOut } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";

function KpiCard({ label, value, icon, hex }: { label: string; value: string; icon: string; hex: string }) {
  return (
    <div
      className="flex items-center gap-4 rounded-card border border-navy/8 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
      style={{ borderTop: `3px solid ${hex}` }}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm" style={{ backgroundColor: `${hex}18` }}>
        {icon}
      </span>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy/50">{label}</p>
        <p className="font-mono text-3xl" style={{ color: hex }}>
          {value}
        </p>
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

  const integrityHex = kpis.network_integrity_index >= 95 ? "#2F9E5B" : kpis.network_integrity_index < 80 ? "#D6336C" : "#F59E0B";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard label={t.kpi.totalActiveOrders} value={kpis.total_active_orders.toLocaleString()} icon="📦" hex="#4F46E5" />
      <KpiCard label={t.kpi.averageTat} value={kpis.average_tat_hours !== null ? `${kpis.average_tat_hours}h` : "—"} icon="⏱" hex="#0EA5A5" />
      <KpiCard label={t.kpi.networkIntegrityIndex} value={`${kpis.network_integrity_index}%`} icon="🛡" hex={integrityHex} />
    </div>
  );
}
