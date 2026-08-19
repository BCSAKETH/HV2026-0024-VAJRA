"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { KpiCards } from "@/components/dashboard/KpiCards";
import { SecurityInbox } from "@/components/dashboard/SecurityInbox";
import { type ActiveTransit, type Bottleneck, type KpiOut, type SecurityEvent, type StaffLookup, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { type RawTrackingEvent, supabaseRealtime } from "@/lib/supabaseClient";
import { useAuthStore } from "@/lib/store/auth";

const LiveMap = dynamic(() => import("@/components/dashboard/LiveMap").then((m) => m.LiveMap), { ssr: false });

const POLL_INTERVAL_MS = 20_000;

export default function OverviewPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { hubs, previewHubId } = useDashboard();
  const { t } = useTranslation();

  const [kpis, setKpis] = useState<KpiOut | null>(null);
  const [transits, setTransits] = useState<ActiveTransit[]>([]);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [staffById, setStaffById] = useState<Map<string, StaffLookup>>(new Map());

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    const [kpisRes, transitsRes, bottlenecksRes, eventsRes] = await Promise.all([
      api.getKpis(accessToken, previewHubId),
      api.getActiveTransits(accessToken, previewHubId),
      api.getBottlenecks(accessToken, previewHubId),
      api.getSecurityEvents(accessToken, previewHubId),
    ]);
    setKpis(kpisRes);
    setTransits(transitsRes);
    setBottlenecks(bottlenecksRes);
    setSecurityEvents(eventsRes);

    const penalizedIds = eventsRes
      .map((e) => (typeof e.meta.penalized_staff_id === "string" ? e.meta.penalized_staff_id : null))
      .filter((id): id is string => id !== null && !staffById.has(id));
    if (penalizedIds.length > 0) {
      const looked = await api.staffLookup(accessToken, [...new Set(penalizedIds)]);
      setStaffById((prev) => {
        const next = new Map(prev);
        looked.forEach((s) => next.set(s.id, s));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, previewHubId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Live delta stream — genuine Supabase Realtime on bag-scoped
  // tracking_events (see migration 0003). Any such event just triggers a
  // fresh pull from FastAPI rather than hand-merging partial state.
  useEffect(() => {
    const client = supabaseRealtime;
    if (!client) return;
    const channel = client
      .channel("tracking-events-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracking_events" }, (payload) => {
        const row = payload.new as RawTrackingEvent;
        if (row.bag_id) refresh();
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [refresh]);

  const compromisedBagIds = useMemo(
    () => new Set(securityEvents.filter((e) => e.event_type === "COMPROMISED" && e.bag_id).map((e) => e.bag_id as string)),
    [securityEvents]
  );

  return (
    <main className="p-8">
      <p className="mb-6 font-serif text-3xl text-navy">🗺️ {t.nav.overview}</p>
      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-[520px] overflow-hidden rounded-card border border-navy/8 bg-white shadow-card lg:col-span-2" style={{ borderTop: "3px solid #4F46E5" }}>
          {!supabaseRealtime ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-navy/40">{t.overview.mapEnvHint}</div>
          ) : (
            <LiveMap hubs={hubs} transits={transits} bottlenecks={bottlenecks} compromisedBagIds={compromisedBagIds} />
          )}
        </div>
        <SecurityInbox events={securityEvents} staffById={staffById} />
      </div>
    </main>
  );
}
