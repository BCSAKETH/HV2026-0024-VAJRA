"use client";

import { useEffect, useRef, useState } from "react";

export interface StatCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  label: string;
  className?: string;
  /** Puts the caption above the number (KPI-card layout) instead of below (landing stat-band layout). */
  labelFirst?: boolean;
}

/** Mono, count-up stat — reused on the landing hero and every dashboard KPI
 * card so numbers always feel instrumented rather than static labels. */
export function StatCounter({ value, suffix = "", prefix = "", decimals = 0, label, className, labelFirst = false }: StatCounterProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 900;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(value * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  const number = (
    <div className="stat-value font-mono text-4xl font-semibold tabular-nums text-navy sm:text-5xl">
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </div>
  );
  const caption = label ? (
    <div className={`font-mono text-xs uppercase tracking-[0.14em] text-navy/50 ${labelFirst ? "mb-2" : "mt-1"}`}>{label}</div>
  ) : null;

  return (
    <div ref={ref} className={className}>
      {labelFirst ? (
        <>
          {caption}
          {number}
        </>
      ) : (
        <>
          {number}
          {caption}
        </>
      )}
    </div>
  );
}
