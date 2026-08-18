import { StatCounter } from "@/components/ui/StatCounter";
import type { KpiOut } from "@/lib/api";

function KpiCard({
  label,
  value,
  suffix,
  decimals,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  accent?: "sage" | "brick";
}) {
  const valueColor = accent === "sage" ? "[&_.stat-value]:text-sage" : accent === "brick" ? "[&_.stat-value]:text-brick" : "";
  return (
    <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <StatCounter value={value} suffix={suffix} decimals={decimals} label={label} className={valueColor} labelFirst />
    </div>
  );
}

export function KpiCards({ kpis }: { kpis: KpiOut | null }) {
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
      <KpiCard label="Total Active Orders" value={kpis.total_active_orders} />
      <KpiCard label="Average TAT" value={kpis.average_tat_hours ?? 0} suffix={kpis.average_tat_hours !== null ? "h" : ""} decimals={1} />
      <KpiCard label="Network Integrity Index" value={kpis.network_integrity_index} suffix="%" decimals={1} accent={integrityAccent} />
    </div>
  );
}
