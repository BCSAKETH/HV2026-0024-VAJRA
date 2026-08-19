"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { destinationForRole } from "@/lib/roleRouting";
import { type Locale, LOCALE_LABEL } from "@/lib/store/locale";
import { useAuthStore } from "@/lib/store/auth";

const LOCALES: Locale[] = ["en", "te", "hi"];

const STEPS = ["step1", "step2", "step3"] as const;
const STEP_ACCENTS = ["#4F46E5", "#E76F2F", "#6B8F71"];
const STAT_ICONS: Record<(typeof STATS)[number], string> = {
  statDefenses: "🛡️",
  statHubs: "📍",
  statDelivery: "🔒",
  statLedger: "📜",
};
const STATS = ["statDefenses", "statHubs", "statDelivery", "statLedger"] as const;
const STAT_ACCENTS: Record<(typeof STATS)[number], string> = {
  statDefenses: "#4F46E5",
  statHubs: "#E76F2F",
  statDelivery: "#6B8F71",
  statLedger: "#B84A3A",
};

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
        className="w-full rounded-xl border-2 border-navy/10 bg-white px-4 py-3 font-mono text-sm text-navy shadow-sm outline-none transition focus:border-indigo"
      />
      <button
        type="submit"
        disabled={!code.trim()}
        className="shrink-0 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
      >
        {t.landing.trackButton}
      </button>
    </form>
  );
}

// Direct DOM style writes on refs, not React state — a per-pixel mousemove
// driving a state update would re-render the whole tree every frame; this
// costs nothing per move and stays smooth. No new dependency, no WebGL, no
// asset to source — just three layers moving at three different speeds,
// which is the entire trick behind a convincing depth/parallax illusion.
function useParallaxHero() {
  const heroRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = heroRef.current;
    if (!hero) return;

    function handleMove(e: MouseEvent) {
      const rect = hero!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      if (backdropRef.current) backdropRef.current.style.transform = `translate(${x * -34}px, ${y * -34}px)`;
      if (boxRef.current) boxRef.current.style.transform = `translate(${x * 46}px, ${y * 46}px) rotate(${x * 14}deg)`;
      if (headlineRef.current) headlineRef.current.style.transform = `translate(${x * 9}px, ${y * 9}px)`;
    }
    function handleLeave() {
      if (backdropRef.current) backdropRef.current.style.transform = "";
      if (boxRef.current) boxRef.current.style.transform = "";
      if (headlineRef.current) headlineRef.current.style.transform = "";
    }
    hero.addEventListener("mousemove", handleMove);
    hero.addEventListener("mouseleave", handleLeave);
    return () => {
      hero.removeEventListener("mousemove", handleMove);
      hero.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return { heroRef, backdropRef, boxRef, headlineRef };
}

export default function Home() {
  const { t, locale, setLocale } = useTranslation();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const { heroRef, backdropRef, boxRef, headlineRef } = useParallaxHero();

  // `/` never auto-redirects away, in either direction — a stale session
  // sitting in a normal browser (from earlier testing, or just not having
  // logged out) must never silently hide the landing page again, which is
  // exactly what happened before this fix. Instead the primary CTA just
  // adapts: "Go to Dashboard" for a real session, "Staff Sign In" for none.
  // `hasHydrated` gates only which of those two labels/targets we commit to
  // — never whether the page itself renders.
  const isAuthed = hasHydrated && Boolean(accessToken && staff);
  const primaryHref = isAuthed && staff ? destinationForRole(staff.role) : "/login";
  const primaryLabel = hasHydrated && isAuthed ? t.landing.goToDashboard : t.landing.staffSignIn;

  return (
    <main className="min-h-screen bg-ivory">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LOCUS" width={38} height={38} className="rounded-xl shadow-sm" />
          <span className="font-serif text-2xl text-navy">{t.login.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden gap-1.5 sm:flex">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  locale === l ? "bg-indigo text-white shadow-sm" : "border border-navy/15 text-navy/50 hover:bg-navy/5"
                }`}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
          <Link
            href={primaryHref}
            className="rounded-xl bg-indigo px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo/30 transition hover:opacity-90"
          >
            {primaryLabel}
          </Link>
        </div>
      </header>

      {/* Hero — layered gradient backdrop instead of flat ivory, three accent
          colors meeting in one soft glow behind the headline. Mouse motion
          drives three layers (backdrop, floating box, headline) at three
          different speeds/directions for a real parallax-depth feel. */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div
          ref={backdropRef}
          className="pointer-events-none absolute inset-0 opacity-[0.16] transition-transform duration-300 ease-out"
          style={{
            background:
              "radial-gradient(50% 60% at 18% 12%, #4F46E5, transparent), radial-gradient(45% 55% at 85% 8%, #E76F2F, transparent), radial-gradient(55% 50% at 60% 55%, #6B8F71, transparent)",
          }}
        />
        <div
          ref={boxRef}
          aria-hidden="true"
          className="pointer-events-none absolute right-[8%] top-16 hidden text-6xl drop-shadow-xl transition-transform duration-300 ease-out sm:block sm:right-[12%] sm:top-20"
        >
          📦
        </div>
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-10 text-center sm:pt-16">
          <p className="mb-4 rounded-full border border-orange/25 bg-orange/10 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.3em] text-orange">
            {t.landing.tagline}
          </p>
          <h1
            ref={headlineRef}
            className="mb-6 text-balance font-serif text-5xl leading-tight text-navy transition-transform duration-300 ease-out sm:text-6xl"
          >
            {t.login.title}
          </h1>
          <p className="mb-10 max-w-xl text-balance text-lg leading-relaxed text-navy/65">{t.landing.pitch}</p>

          <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="w-full rounded-xl bg-gradient-to-br from-indigo to-[#3730A3] px-8 py-3.5 text-center font-semibold text-white shadow-lg shadow-indigo/30 transition hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
            >
              {primaryLabel}
            </Link>
            <TrackForm />
          </div>
        </div>
      </section>

      {/* Stats strip — colored icon chips instead of plain centered text */}
      <section className="border-y border-navy/10 bg-white">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 px-6 py-10 sm:grid-cols-4">
          {STATS.map((key) => (
            <div key={key} className="flex flex-col items-center gap-2 text-center">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-sm"
                style={{ backgroundColor: `${STAT_ACCENTS[key]}18` }}
              >
                {STAT_ICONS[key]}
              </span>
              <p className="font-serif text-sm text-navy sm:text-base">{t.landing[key]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — each card gets its own accent color and a bolder,
          filled number badge instead of a uniform indigo-tinted circle. */}
      <section className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
        <h2 className="mb-10 text-center font-serif text-3xl text-navy sm:text-4xl">{t.landing.howItWorksTitle}</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className="rounded-card border border-navy/10 bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-lg"
              style={{ borderTop: `3px solid ${STEP_ACCENTS[i]}` }}
            >
              <span
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-full font-mono text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: STEP_ACCENTS[i] }}
              >
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
