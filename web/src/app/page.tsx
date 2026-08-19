"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// R3F/Canvas touches WebGL/window at render time, not just in effects — a
// plain import would try to render it during Next's server pass on this
// "use client" page (client components still get an initial SSR/static
// pass) and crash the build. ssr:false is what keeps it real-browser-only.
const PackageBoxScene = dynamic(() => import("@/components/3d/PackageBoxScene").then((m) => m.PackageBoxScene), { ssr: false });

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

// Click-to-open uses PackageBoxScene's own existing, already-shipped
// `openProgress` prop (drives the lid + glow dot smoothly by value — no
// new logic inside the Three.js scene itself). Hover-tilt and drag-rotate
// are a separate CSS-level layer on the *container* div wrapping the
// canvas — the same technique already proven on the parallax hero and in
// the earlier CSS box preview, just scoped to this one element instead of
// the whole hero. Tilting the container doesn't reorient the actual 3D
// geometry, but it reads as a real "the box responds to your cursor"
// interaction without writing a single line of new, unverified
// raycasting/orbit code inside the WebGL scene.
function useInteractiveBox() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [openProgress, setOpenProgress] = useState(0);
  const [boxOpen, setBoxOpen] = useState(false);
  const animRef = useRef<number | null>(null);
  const draggingFrom = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const dragBase = useRef({ x: 0, y: 0 });
  const tilt = useRef({ x: 0, y: 0 });

  function applyTilt() {
    if (wrapRef.current) wrapRef.current.style.transform = `perspective(900px) rotateX(${tilt.current.x}deg) rotateY(${tilt.current.y}deg)`;
  }

  function animateOpenTo(target: number) {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    const step = () => {
      setOpenProgress((prev) => {
        const next = prev + (target - prev) * 0.15;
        if (Math.abs(target - next) < 0.01) {
          animRef.current = null;
          return target;
        }
        animRef.current = requestAnimationFrame(step);
        return next;
      });
    };
    animRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function handleMove(e: PointerEvent) {
      if (draggingFrom.current) {
        const dx = e.clientX - draggingFrom.current.x;
        const dy = e.clientY - draggingFrom.current.y;
        if (!dragged.current && Math.abs(dx) + Math.abs(dy) > 4) dragged.current = true;
        if (dragged.current) {
          tilt.current = { x: Math.max(-25, Math.min(25, dragBase.current.x - dy * 0.3)), y: dragBase.current.y + dx * 0.3 };
          applyTilt();
        }
        return;
      }
      const rect = el!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      tilt.current = { x: -y * 14, y: x * 16 };
      applyTilt();
    }
    function handleLeave() {
      if (draggingFrom.current) return;
      tilt.current = { x: 0, y: 0 };
      applyTilt();
    }
    function handleDown(e: PointerEvent) {
      draggingFrom.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
      dragBase.current = { ...tilt.current };
      el!.setPointerCapture(e.pointerId);
    }
    function handleUp() {
      const wasDrag = dragged.current;
      draggingFrom.current = null;
      // Toggling here is a pure state flip — the animation itself is
      // driven by the effect below, watching `boxOpen`. Calling
      // animateOpenTo() directly from inside this setState updater used
      // to work in practice, but it's a real anti-pattern (a side effect
      // inside a state-updater function) that React 18 strict mode
      // deliberately double-invokes in dev specifically to catch.
      if (!wasDrag) setBoxOpen((prev) => !prev);
    }
    el.addEventListener("pointermove", handleMove);
    el.addEventListener("pointerleave", handleLeave);
    el.addEventListener("pointerdown", handleDown);
    el.addEventListener("pointerup", handleUp);
    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerleave", handleLeave);
      el.removeEventListener("pointerdown", handleDown);
      el.removeEventListener("pointerup", handleUp);
    };
  }, []);

  useEffect(() => {
    animateOpenTo(boxOpen ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxOpen]);

  const variant: "idle" | "scroll" = boxOpen || openProgress > 0.01 ? "scroll" : "idle";
  return { wrapRef, openProgress, variant };
}

export default function Home() {
  const { t, locale, setLocale } = useTranslation();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const { heroRef, backdropRef, boxRef, headlineRef } = useParallaxHero();
  const { wrapRef: boxWrapRef, openProgress, variant: boxVariant } = useInteractiveBox();

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
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-16">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
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

          {/* The signature scene: a real, procedural (zero external assets)
              Three.js box. Two independent transform layers, composed by
              nesting: the outer div (boxRef) drifts with the wide hero
              parallax; the inner div (boxWrapRef) tilts/drags on its own
              hover/pointer input and click-toggles open via openProgress. */}
          <div ref={boxRef} className="mx-auto h-[280px] w-full max-w-md transition-transform duration-300 ease-out sm:h-[360px]">
            <div
              ref={boxWrapRef}
              className="h-full w-full cursor-grab touch-none select-none transition-transform duration-150 ease-out active:cursor-grabbing"
            >
              <PackageBoxScene variant={boxVariant} openProgress={openProgress} accentColor="#4F46E5" height="100%" />
            </div>
            <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-widest text-navy/30">{t.landing.boxHint}</p>
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
