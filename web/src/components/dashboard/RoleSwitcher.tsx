"use client";

import type { Hub } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface Props {
  hubs: Hub[];
  previewHubId: string | null;
  onChange: (hubId: string | null) => void;
}

// Super-Admin-only "view as" control — lets a real Super Admin preview
// exactly what a given Hub Manager's scoped dashboard looks like, backed by
// the same `preview_hub_id` scoping the backend enforces (a real Hub
// Manager can't reach this component or escalate scope, see dashboard/page.tsx).
export function RoleSwitcher({ hubs, previewHubId, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-navy/10 bg-white p-4 shadow-card">
      <span className="text-sm font-medium text-navy/60">{t.roleSwitcher.previewAs}</span>
      <button
        onClick={() => onChange(null)}
        className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
          previewHubId === null ? "bg-indigo text-white" : "text-navy/60 hover:bg-navy/5"
        }`}
      >
        {t.roleSwitcher.superAdminNetworkWide}
      </button>
      {hubs.map((hub) => (
        <button
          key={hub.id}
          onClick={() => onChange(hub.id)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            previewHubId === hub.id ? "bg-indigo text-white" : "text-navy/60 hover:bg-navy/5"
          }`}
        >
          {t.roleSwitcher.hubManagerPrefix} {hub.name}
        </button>
      ))}
    </div>
  );
}
