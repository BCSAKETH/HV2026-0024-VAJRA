import type { HTMLAttributes } from "react";

/** Tier-2 floating surface — glass-white over a 3D scene or ambient
 * background. Tier-1 (flat white card) stays as the plain `shadow-card`
 * class already used throughout the app; this is only for content that
 * sits on top of a canvas or image. */
export function GlassCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-white/40 bg-white/60 shadow-lg backdrop-blur-xl ${className}`}
      {...props}
    />
  );
}
