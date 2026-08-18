"use client";

import { useEffect, useState } from "react";

import { type MsmeDetail, type MsmeSummary, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useAuthStore } from "@/lib/store/auth";

// Warm/logistics palette banner colors, picked deterministically per MSME
// so the same business always gets the same color — no images needed,
// matching the course-card reference (colored banner + monogram, not a photo).
const BANNER_COLORS = ["#4F46E5", "#C2410C", "#166534", "#9F1239", "#0F766E", "#7C2D12", "#1E3A8A", "#854D0E"];

function bannerColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_COLORS[hash % BANNER_COLORS.length];
}

function monogramFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "text-sage",
  RTO: "text-brick",
  COMPROMISED: "text-brick",
};

function MsmeCard({ msme, onOpen }: { msme: MsmeSummary; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onOpen} className="group flex flex-col overflow-hidden rounded-card border border-navy/10 bg-white text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex h-24 items-center justify-center" style={{ backgroundColor: bannerColorFor(msme.id) }}>
        <span className="font-serif text-3xl font-semibold text-white/90">{monogramFor(msme.business_name)}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-serif text-lg leading-tight text-navy">{msme.business_name}</p>
        <p className="mt-1 text-sm text-navy/50">
          {msme.owner_name ?? t.msmes.ownerUnknown} {msme.pincode ? `· ${msme.pincode}` : ""}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-full bg-indigo/10 px-2.5 py-1 text-xs font-semibold text-indigo">
            {msme.shipment_count} {t.msmes.shipmentWord}
          </span>
        </div>
        <p className="mt-3 text-xs text-navy/40">
          {msme.first_shipped_at ? `${t.msmes.firstShipped} ${formatDate(msme.first_shipped_at)}` : t.msmes.noShipmentsYet}
        </p>
        <span className="mt-3 text-sm font-semibold text-indigo group-hover:underline">{t.msmes.viewDetails} →</span>
      </div>
    </button>
  );
}

function MsmeDetailView({ msmeId, accessToken, previewHubId, onBack }: { msmeId: string; accessToken: string; previewHubId: string | null; onBack: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<MsmeDetail | null>(null);

  useEffect(() => {
    api.getMsmeDetail(accessToken, msmeId, previewHubId).then(setDetail);
  }, [accessToken, msmeId, previewHubId]);

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm font-semibold text-indigo hover:underline">
        ← {t.msmes.backToAll}
      </button>

      {!detail ? (
        <p className="text-navy/40">{t.msmes.loading}</p>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-4 rounded-card border border-navy/10 bg-white p-6 shadow-card">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: bannerColorFor(detail.id) }}>
              <span className="font-serif text-xl font-semibold text-white/90">{monogramFor(detail.business_name)}</span>
            </div>
            <div>
              <p className="font-serif text-2xl text-navy">{detail.business_name}</p>
              <p className="text-sm text-navy/50">
                {detail.owner_name ?? t.msmes.ownerUnknown} · <span className="font-mono">{detail.phone}</span> {detail.pincode ? `· ${detail.pincode}` : ""}
              </p>
              <p className="mt-1 text-xs text-navy/40">
                {t.msmes.onFileSince} {formatDate(detail.created_at)}
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-navy/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-navy/50">{t.msmes.totalShipments}</p>
              <p className="mt-1 font-serif text-2xl text-navy">{detail.total_shipments}</p>
            </div>
            <div className="rounded-xl border border-navy/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-navy/50">{t.msmes.totalValue}</p>
              <p className="mt-1 font-serif text-2xl text-navy">{formatMoney(detail.total_value)}</p>
            </div>
            <div className="rounded-xl border border-navy/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-navy/50">{t.msmes.delivered}</p>
              <p className="mt-1 font-serif text-2xl text-sage">{detail.delivered_count}</p>
            </div>
            <div className="rounded-xl border border-navy/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-navy/50">{t.msmes.rto}</p>
              <p className="mt-1 font-serif text-2xl text-brick">{detail.rto_count}</p>
            </div>
          </div>

          <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
            <p className="mb-4 font-serif text-xl text-navy">{t.msmes.shipmentHistory}</p>
            {detail.shipments.length === 0 ? (
              <p className="text-navy/40">{t.msmes.noShipmentsYet}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.shipments.map((s) => (
                  <div key={s.tracking_id} className="flex items-center justify-between rounded-lg border border-navy/10 px-3 py-2 text-sm">
                    <div>
                      <span className="font-mono text-navy">{s.tracking_id}</span>
                      {s.recipient_name ? <span className="ml-2 text-navy/50">{s.recipient_name}</span> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      {s.declared_value ? <span className="font-mono text-navy/40">{formatMoney(s.declared_value)}</span> : null}
                      <span className={`font-semibold ${STATUS_COLOR[s.status] ?? "text-navy/60"}`}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function MsmesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { previewHubId } = useDashboard();
  const { t } = useTranslation();
  const [msmes, setMsmes] = useState<MsmeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    api
      .listMsmes(accessToken, previewHubId)
      .then(setMsmes)
      .finally(() => setLoading(false));
  }, [accessToken, previewHubId]);

  if (!accessToken) return null;

  return (
    <main className="p-8">
      {selectedId ? (
        <MsmeDetailView msmeId={selectedId} accessToken={accessToken} previewHubId={previewHubId} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          <p className="mb-1 font-serif text-2xl text-navy">{t.msmes.title}</p>
          <p className="mb-6 text-sm text-navy/50">{loading ? t.msmes.loading : `${msmes.length} ${t.msmes.businessesOnFile}`}</p>

          {!loading && msmes.length === 0 ? (
            <p className="text-navy/40">{t.msmes.noMsmes}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {msmes.map((m) => (
                <MsmeCard key={m.id} msme={m} onOpen={() => setSelectedId(m.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
