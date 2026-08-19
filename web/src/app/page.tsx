"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { destinationForRole } from "@/lib/roleRouting";
import { type Locale, LOCALE_LABEL } from "@/lib/store/locale";
import { useAuthStore } from "@/lib/store/auth";

const LOCALES: Locale[] = ["en", "te", "hi"];

const STEPS = ["step1", "step2", "step3"] as const;
const STATS = ["statDefenses", "statHubs", "statDelivery", "statLedger"] as const;

function TrackForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/track/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t.landing.trackPlaceholder}
        className="w-full rounded-xl border border-navy/15 bg-surface px-4 py-3 font-mono text-sm text-navy outline-none focus:border-indigo"
      />
      <button
        type="submit"
        disabled={!code.trim()}
        className="shrink-0 rounded-xl border border-navy/15 bg-surface px-5 py-3 text-sm font-semibold text-navy transition hover:border-navy/30 disabled:opacity-40"
      >
        {t.landing.trackButton}
      </button>
    </form>
  );
}

function LandingPage() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <main className="min-h-screen bg-ivory">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LOCUS" width={38} height={38} className="rounded-xl" />
          <span className="font-serif text-2xl text-navy">{t.login.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden gap-1.5 sm:flex">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  locale === l ? "bg-indigo text-white" : "border border-navy/15 text-navy/50 hover:bg-navy/5"
                }`}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
          <Link
            href="/login"
            className="rounded-xl bg-indigo px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t.landing.staffSignIn}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-10 text-center sm:pt-16">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-orange">{t.landing.tagline}</p>
        <h1 className="mb-6 text-balance font-serif text-4xl leading-tight text-navy sm:text-5xl">{t.login.title}</h1>
        <p className="mb-10 max-w-xl text-balance text-lg leading-relaxed text-navy/65">{t.landing.pitch}</p>

        <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="w-full rounded-xl bg-indigo px-8 py-3.5 text-center font-semibold text-white transition hover:opacity-90 sm:w-auto"
          >
            {t.landing.staffSignIn}
          </Link>
          <TrackForm />
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-navy/10 bg-surface">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {STATS.map((key) => (
            <div key={key} className="text-center">
              <p className="font-serif text-sm text-navy sm:text-base">{t.landing[key]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
        <h2 className="mb-10 text-center font-serif text-2xl text-navy sm:text-3xl">{t.landing.howItWorksTitle}</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step} className="rounded-card border border-navy/10 bg-surface p-6 shadow-card">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-indigo/10 font-mono text-sm font-semibold text-indigo">
                {i + 1}
              </span>
              <p className="mb-2 font-serif text-xl text-navy">{t.landing[`${step}Title` as "step1Title"]}</p>
              <p className="text-sm leading-relaxed text-navy/60">{t.landing[`${step}Body` as "step1Body"]}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-navy/10 px-6 py-8 text-center sm:px-10">
        <p className="text-sm text-navy/40">{t.landing.footerTagline}</p>
      </footer>
    </main>
  );
}

// Mirrors mobile's app/index.tsx: an authenticated staff member never sees
// this page, they're routed straight to wherever their backend-verified
// role sends them — same as before. The only real change is that an
// unauthenticated visitor now sees an actual landing page instead of being
// bounced straight to /login with a blank flash.
export default function Home() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);

  useEffect(() => {
    if (!hasHydrated) return;
    if (accessToken && staff) {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  if (!hasHydrated || (accessToken && staff)) {
    return <main className="min-h-screen bg-ivory" />;
  }

  return <LandingPage />;
}
