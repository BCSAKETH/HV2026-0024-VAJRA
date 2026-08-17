"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { LocusGridAnimation } from "@/components/track/LocusGridAnimation";
import { VerificationBadge } from "@/components/track/VerificationBadge";
import { ApiError, api, type TrackResult } from "@/lib/api";

const EVENT_LABELS: Record<string, string> = {
  PRE_ALLOCATED: "Label printed",
  INTAKE: "Picked up",
  CONSOLIDATED: "Consolidated into transit bag",
  SEALED: "Bag sealed for dispatch",
  DEPARTED: "Left origin hub",
  ARRIVED_AT_HUB: "Arrived at hub",
  UNSEALED: "Bag opened at delivery hub",
  CLAIMED: "Claimed by delivery agent",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Delivery attempt failed — returning",
  COMPROMISED: "Security exception flagged",
  AUTO_HEALED: "Routing corrected automatically",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TrackPage() {
  const params = useParams<{ trackingId: string }>();
  const [showAnimation, setShowAnimation] = useState(true);
  const [data, setData] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .track(params.trackingId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this shipment."));
  }, [params.trackingId]);

  return (
    <main className="min-h-screen bg-ivory">
      {showAnimation ? <LocusGridAnimation onComplete={() => setShowAnimation(false)} /> : null}

      {!showAnimation ? (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-orange">LOCUS · The Exact Point of Truth</p>

          {error ? (
            <div className="rounded-card border border-brick/30 bg-brick/5 p-6">
              <p className="text-brick">{error}</p>
            </div>
          ) : !data ? (
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-2/3 rounded bg-navy/10" />
              <div className="h-32 rounded-card bg-navy/10" />
            </div>
          ) : (
            <>
              <h1 className="mb-2 font-serif text-4xl text-navy">{data.tracking_id}</h1>
              <p className="mb-1 text-navy/70">
                {data.recipient_name ? `To ${data.recipient_name}` : "Recipient not disclosed"}
                {data.delivery_pincode ? ` · ${data.delivery_pincode}` : ""}
              </p>
              <p className="mb-6 font-mono text-sm uppercase tracking-wide text-indigo">{data.status.replace(/_/g, " ")}</p>

              <div className="mb-8">
                <VerificationBadge badge={data.badge} />
              </div>

              <div className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
                <p className="mb-4 font-serif text-xl text-navy">Journey Timeline</p>
                <ol className="relative border-l-2 border-navy/10 pl-6">
                  {data.timeline.map((event, i) => (
                    <li key={i} className="mb-6 last:mb-0">
                      <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white bg-indigo" />
                      <p className="font-semibold text-navy">{EVENT_LABELS[event.event_type] ?? event.event_type}</p>
                      <p className="font-mono text-xs text-navy/50">{formatTimestamp(event.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {data.condition_photo_urls.length > 0 ? (
                <div className="mt-6 rounded-card border border-navy/10 bg-white p-6 shadow-card">
                  <p className="mb-4 font-serif text-xl text-navy">Proof of Condition at Pickup</p>
                  <div className="flex gap-3">
                    {data.condition_photo_urls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="Package condition at pickup" className="h-28 w-28 rounded-xl object-cover" />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}
