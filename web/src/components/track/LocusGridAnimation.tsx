"use client";

import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useEffect, useRef } from "react";

gsap.registerPlugin(MotionPathPlugin);

// "The Exact Point of Truth" as a two-second visual, on every /track load: a
// glowing dot travels a diagonal grid line inside a perspective-tilted 3D
// grid, pulsing as it goes, then the whole thing fades to reveal the real
// timeline underneath.
export function LocusGridAnimation({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    // Real customers open this from an SMS link — if GSAP ever fails to
    // fire onComplete (a webview quirk, MotionPathPlugin not registering,
    // a thrown error mid-timeline, anything), the intro's fixed inset-0
    // overlay would sit there forever and permanently hide the real
    // tracking content behind it. This hard timeout is the guarantee that
    // can never happen — worst case, the decorative animation gets cut
    // short; the timeline underneath always gets shown.
    const safetyNet = setTimeout(onComplete, 3000);

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      clearTimeout(safetyNet);
      onComplete();
      return;
    }

    if (!pathRef.current) return () => clearTimeout(safetyNet);
    const path = pathRef.current;

    let ctx: gsap.Context | undefined;
    try {
      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            clearTimeout(safetyNet);
            gsap.to(containerRef.current, { opacity: 0, duration: 0.5, onComplete });
          },
        });

        tl.set(dotRef.current, { opacity: 1 });
        tl.to(dotRef.current, {
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
          duration: 2.1,
          ease: "power2.inOut",
        });
        // pulsing glow, independent of the travel tween
        gsap.to(dotRef.current, { scale: 1.6, opacity: 0.6, duration: 0.5, repeat: 3, yoyo: true, ease: "sine.inOut" });
      }, containerRef);
    } catch {
      // Same guarantee as above, for a synchronous throw instead of a hang.
      clearTimeout(safetyNet);
      onComplete();
    }

    return () => {
      clearTimeout(safetyNet);
      ctx?.revert();
    };
  }, [onComplete]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center bg-ivory">
      <div style={{ perspective: "800px" }} className="relative h-64 w-full max-w-xl">
        <div
          style={{
            transform: "rotateX(55deg)",
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(79,70,229,0.25) 0px, rgba(79,70,229,0.25) 1px, transparent 1px, transparent 32px)," +
              "repeating-linear-gradient(90deg, rgba(79,70,229,0.25) 0px, rgba(79,70,229,0.25) 1px, transparent 1px, transparent 32px)",
          }}
          className="absolute inset-0"
        />
        <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full" style={{ transform: "rotateX(55deg)" }}>
          <path ref={pathRef} d="M 20 180 L 180 60 L 380 20" fill="none" stroke="#4F46E5" strokeWidth={2} strokeOpacity={0.5} />
        </svg>
        <div
          ref={dotRef}
          style={{
            position: "absolute",
            width: 14,
            height: 14,
            borderRadius: "9999px",
            background: "#6B8F71",
            boxShadow: "0 0 20px 6px #6B8F71aa",
            opacity: 0,
            transform: "rotateX(55deg)",
          }}
        />
        <p className="absolute -bottom-10 left-0 right-0 text-center font-mono text-xs uppercase tracking-[0.3em] text-navy/40">
          The Exact Point of Truth
        </p>
      </div>
    </div>
  );
}
