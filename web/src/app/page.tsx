"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { PackageBoxScene } from "@/components/3d/PackageBoxScene";
import { StatCounter } from "@/components/ui/StatCounter";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

const DEFENSES = [
  { name: "Pincode Collision", desc: "A parcel destined for the wrong hub is caught at consolidation, before it ever leaves the building." },
  { name: "Tamper Seal", desc: "Parcels over ₹5,000 get a mandatory seal step — skip it and the bag won't dispatch." },
  { name: "Weight Tolerance", desc: "±1.5% weigh-and-dispatch check. The bag only seals if the physical weight matches the manifest." },
  { name: "Transit Leakage", desc: "Every child in a bag gets its own hub-arrival ledger entry — not just the bag." },
  { name: "Mutilated QR Audit", desc: "Typed shortcodes trigger a soft physical audit before a bag is allowed to arrive." },
  { name: "Haversine Anti-Clone", desc: "A scan implying >1000 km/h since the last event is rejected and flagged COMPROMISED." },
];

// Unauthenticated visitors get a marketing hero; logged-in staff still get
// the instant, no-menu redirect this page has always done. Nobody sees
// both — the redirect fires before paint if a session already exists.
export default function Home() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (accessToken && staff) {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  if (!hasHydrated || (accessToken && staff)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ivory">
        <p className="font-serif text-3xl text-navy">LOCUS</p>
        <p className="font-mono text-xs text-navy/40">The Exact Point of Truth</p>
      </main>
    );
  }

  return (
    <main className="bg-ivory">
      {/* Hero */}
      <section ref={heroRef} className="relative flex min-h-[92vh] flex-col overflow-hidden border-b border-navy/10">
        <nav className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
          <span className="font-serif text-xl text-navy">LOCUS</span>
          <a
            href="/login"
            className="rounded-full border border-navy/15 bg-white/70 px-5 py-2 font-mono text-xs uppercase tracking-[0.1em] text-navy backdrop-blur-md transition hover:border-indigo/40 hover:text-indigo"
          >
            Staff Sign In
          </a>
        </nav>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-10 px-6 pb-16 pt-6 text-center sm:px-10">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-indigo">State-Aware 3PL Logistics OS</p>
          <h1 className="max-w-3xl text-balance font-serif text-5xl leading-[1.08] text-navy sm:text-6xl md:text-7xl">
            The exact point of truth for your supply chain
          </h1>
          <p className="max-w-xl text-balance text-lg leading-relaxed text-navy/60">
            QR-based product tracking, inventory movement between hubs, and full-chain traceability — built for MSMEs
            who need to know exactly where a parcel is, and prove it.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="/login"
              className="rounded-xl bg-indigo px-7 py-3.5 font-semibold text-white shadow-card transition hover:opacity-90"
            >
              Staff Sign In
            </a>
            <a
              href="#defenses"
              className="rounded-xl border border-navy/15 px-7 py-3.5 font-semibold text-navy transition hover:border-navy/30"
            >
              See how it's secured
            </a>
          </div>
        </div>

        {/* 3D box sits behind the copy, low-opacity, ambient */}
        <div className="pointer-events-none absolute inset-0 z-0 opacity-70">
          <PackageBoxScene variant="idle" accentColor="#4F46E5" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-ivory via-transparent to-ivory/40" />
      </section>

      {/* Stat band */}
      <section className="border-b border-navy/10 bg-ivory-2 px-6 py-16 sm:px-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-10 sm:grid-cols-4">
          <StatCounter value={6} label="Defenses live" className="text-center" />
          <StatCounter value={99.5} decimals={1} suffix="%" label="Tamper-evident ledger" className="text-center" />
          <StatCounter value={30} suffix="s" label="Bottleneck rescan cycle" className="text-center" />
          <StatCounter value={100} suffix="m" label="Delivery geofence radius" className="text-center" />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
        <h2 className="mb-12 text-center font-serif text-3xl text-navy sm:text-4xl">Four hops, one ledger</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
          {[
            { step: "01", label: "Intake", desc: "Scan a blank parcel, photograph the bill, OCR fills the rest." },
            { step: "02", label: "Consolidation", desc: "Bag scan with live defenses — collision, tamper, weight checks." },
            { step: "03", label: "Line-Haul", desc: "Depart and arrive, verified by Haversine anti-clone speed checks." },
            { step: "04", label: "Last-Mile", desc: "Geofenced delivery — OTP unlocks only within 100m of the address." },
          ].map((s) => (
            <div key={s.step} className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
              <span className="font-mono text-xs text-indigo">{s.step}</span>
              <h3 className="mt-2 font-serif text-xl text-navy">{s.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy/60">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Defenses */}
      <section id="defenses" className="border-t border-navy/10 bg-navy px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center font-serif text-3xl text-ivory sm:text-4xl">Built to catch what breaks trust</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DEFENSES.map((d) => (
              <div key={d.name} className="rounded-card border border-ivory/10 bg-ivory/5 p-5">
                <h3 className="font-semibold text-ivory">{d.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory/60">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:px-10">
        <p className="font-serif text-2xl text-navy">LOCUS</p>
        <a href="/login" className="rounded-xl bg-indigo px-6 py-3 font-semibold text-white shadow-card transition hover:opacity-90">
          Staff Sign In
        </a>
        <p className="font-mono text-xs text-navy/40">The Exact Point of Truth</p>
      </footer>
    </main>
  );
}
