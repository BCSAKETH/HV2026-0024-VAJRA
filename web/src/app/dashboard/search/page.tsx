"use client";

import { useState } from "react";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { ApiError, api, type SearchTrackingResult } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between border-b border-navy/5 py-2 text-sm last:border-0">
      <span className="text-navy/50">{label}</span>
      <span className="text-right text-navy">{value}</span>
    </div>
  );
}

export default function SearchTrackingPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<SearchTrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!accessToken || !code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.searchTracking(accessToken, code.trim());
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.searchTracking.notFound);
    } finally {
      setLoading(false);
    }
  }

  if (!accessToken) return null;

  return (
    <main className="p-8">
      <p className="mb-1 font-serif text-2xl text-navy">{t.searchTracking.title}</p>

      <div className="mb-6 flex max-w-xl gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={t.searchTracking.placeholder}
          className="flex-1 rounded-lg border border-navy/15 bg-white px-4 py-2.5 font-mono text-navy"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !code.trim()}
          className="rounded-lg bg-indigo px-6 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t.searchTracking.searching : t.searchTracking.searchButton}
        </button>
      </div>

      {error ? (
        <div className="max-w-xl rounded-card border border-brick/30 bg-brick/5 p-6">
          <p className="text-brick">{error}</p>
        </div>
      ) : !result ? (
        <p className="text-navy/40">{t.searchTracking.prompt}</p>
      ) : result.result_type === "PARCEL" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: "3px solid #4F46E5" }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-serif text-2xl text-navy">{result.tracking_id}</p>
                <p className="font-mono text-sm text-navy/40">{result.shortcode}</p>
              </div>
              <span className="rounded-full bg-indigo/10 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide text-indigo">
                {result.status.replace(/_/g, " ")}
              </span>
            </div>

            <DetailRow label={t.searchTracking.recipient} value={result.recipient_name} />
            <DetailRow label={t.searchTracking.phone} value={result.recipient_phone} />
            <DetailRow label={t.searchTracking.address} value={result.delivery_address} />
            <DetailRow label={t.searchTracking.pincode} value={result.delivery_pincode} />
            <DetailRow label={t.searchTracking.weight} value={result.weight_grams ? `${result.weight_grams}g` : null} />
            <DetailRow label={t.searchTracking.declaredValue} value={result.declared_value ? formatMoney(result.declared_value) : null} />
            <DetailRow label={t.searchTracking.tamperSeal} value={result.tamper_seal_id} />
            <DetailRow
              label={t.searchTracking.assignedTo}
              value={result.assigned_staff_name ? `${result.assigned_staff_name} (${t.roles[result.assigned_staff_role as keyof typeof t.roles] ?? result.assigned_staff_role})` : t.searchTracking.unassigned}
            />
            <DetailRow label={t.searchTracking.currentBag} value={result.current_bag_id ?? t.searchTracking.notBagged} />
            <DetailRow label={t.searchTracking.created} value={formatStamp(result.created_at)} />
            <DetailRow label={t.searchTracking.delivered} value={result.delivered_at ? formatStamp(result.delivered_at) : null} />

            {result.condition_photo_urls.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">{t.searchTracking.conditionPhotos}</p>
                <div className="flex gap-3">
                  {result.condition_photo_urls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="Package condition at pickup" className="h-24 w-24 rounded-xl object-cover" />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <TimelineCard timeline={result.timeline} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: "3px solid #E76F2F" }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-serif text-2xl text-navy">{result.bag_id}</p>
                <p className="font-mono text-sm text-navy/40">{result.shortcode}</p>
              </div>
              <span className="rounded-full bg-orange/10 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide text-orange">
                {result.status.replace(/_/g, " ")}
              </span>
            </div>

            <DetailRow label={t.searchTracking.originHub} value={result.origin_hub_name} />
            <DetailRow label={t.searchTracking.destinationHub} value={result.destination_hub_name} />
            <DetailRow label={t.searchTracking.expectedWeight} value={`${result.expected_weight}g`} />
            <DetailRow label={t.searchTracking.actualWeight} value={result.actual_weight ? `${result.actual_weight}g` : null} />
            <DetailRow label={t.searchTracking.childCount} value={result.child_count} />
          </div>

          <TimelineCard timeline={result.timeline} />
        </div>
      )}
    </main>
  );
}

function TimelineCard({ timeline }: { timeline: SearchTrackingResult["timeline"] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-card border border-navy/8 bg-white p-6 shadow-card" style={{ borderTop: "3px solid #2F9E5B" }}>
      <p className="mb-4 font-serif text-xl text-navy">{t.searchTracking.timeline}</p>
      {timeline.length === 0 ? (
        <p className="text-navy/40">—</p>
      ) : (
        <ol className="relative border-l-2 border-navy/10 pl-6">
          {timeline.map((event, i) => (
            <li key={i} className="mb-6 last:mb-0">
              <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white bg-indigo" />
              <p className="font-semibold text-navy">{t.track.eventLabels[event.event_type as keyof typeof t.track.eventLabels] ?? event.event_type}</p>
              <p className="font-mono text-xs text-navy/50">{formatStamp(event.created_at)}</p>
              {event.staff_name ? (
                <p className="text-xs text-navy/40">
                  {event.staff_name} · {t.roles[event.staff_role as keyof typeof t.roles] ?? event.staff_role}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
