"use client";

import type { SecurityEvent, StaffLookup } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SecurityInbox({ events, staffById }: { events: SecurityEvent[]; staffById: Map<string, StaffLookup> }) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
        <p className="mb-1 font-serif text-xl text-navy">{t.securityInbox.title}</p>
        <p className="text-sage">{t.securityInbox.clean}</p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
      <p className="mb-4 font-serif text-xl text-navy">{t.securityInbox.title}</p>
      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {events.map((event) => {
          const isCompromised = event.event_type === "COMPROMISED";
          const penalizedId = typeof event.meta.penalized_staff_id === "string" ? event.meta.penalized_staff_id : null;
          const penalizedStaff = penalizedId ? staffById.get(penalizedId) : null;

          return (
            <div key={event.id} className={`rounded-xl border p-4 ${isCompromised ? "border-brick/30 bg-brick/5" : "border-orange/30 bg-orange/5"}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wide ${isCompromised ? "bg-brick text-white" : "bg-orange text-white"}`}>
                  {isCompromised ? t.securityInbox.teleportationAlert : t.securityInbox.autoHealedStowaway}
                </span>
                <span className="font-mono text-xs text-navy/40">{timeAgo(event.created_at)}</span>
              </div>
              <p className="font-mono text-sm text-navy">
                {event.bag_id ?? event.tracking_id}
                {event.tracking_id && event.bag_id ? ` · ${event.tracking_id}` : ""}
              </p>
              {isCompromised && typeof event.meta.speed_kmh === "number" ? (
                <p className="text-sm text-brick">
                  {t.securityInbox.impliedSpeed} {event.meta.speed_kmh.toLocaleString()} km/h
                </p>
              ) : null}
              {!isCompromised && penalizedStaff ? (
                <p className="text-sm text-navy/70">
                  {t.securityInbox.penaltyAppliedTo} <span className="font-semibold">{penalizedStaff.name ?? penalizedStaff.phone}</span> —{" "}
                  <span className="font-mono text-brick">
                    {penalizedStaff.error_points} {penalizedStaff.error_points === 1 ? t.securityInbox.errorPoint : t.securityInbox.errorPoints}
                  </span>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
