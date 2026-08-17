import type { Hub } from "@/lib/api";

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
  return (
    <div className="mb-6 flex items-center gap-3 rounded-card border border-navy/10 bg-white p-4 shadow-card">
      <span className="text-sm font-medium text-navy/60">Preview as:</span>
      <button
        onClick={() => onChange(null)}
        className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
          previewHubId === null ? "bg-indigo text-white" : "text-navy/60 hover:bg-navy/5"
        }`}
      >
        Super Admin (Network-wide)
      </button>
      {hubs.map((hub) => (
        <button
          key={hub.id}
          onClick={() => onChange(hub.id)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            previewHubId === hub.id ? "bg-indigo text-white" : "text-navy/60 hover:bg-navy/5"
          }`}
        >
          Hub Manager — {hub.name}
        </button>
      ))}
    </div>
  );
}
