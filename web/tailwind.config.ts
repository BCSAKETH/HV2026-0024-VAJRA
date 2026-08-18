import type { Config } from "tailwindcss";

// LOCUS design system — "The Exact Point of Truth"
//
// Colors are CSS-variable-backed (rgb(var(--x) / <alpha-value>)) rather than
// flat hex — that's what lets dark mode (see globals.css's
// [data-theme="dark"] block) flip every existing bg-ivory/text-navy/bg-white
// usage across the whole app at once, without hand-editing dark: variants
// into every className in every file. "navy" becomes light text and "white"
// becomes a dark card surface under [data-theme="dark"] — the Tailwind
// class names keep their light-mode English meaning, only the resolved
// color swaps.
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ivory: "rgb(var(--color-ivory) / <alpha-value>)", // background
        navy: "rgb(var(--color-navy) / <alpha-value>)", // text & primary accents
        white: "rgb(var(--color-surface) / <alpha-value>)", // card/surface backgrounds
        indigo: "#4F46E5", // primary actions (cobalt-indigo)
        orange: "#E76F2F", // active scans / warehouse actions (burnt orange)
        sage: "#6B8F71", // successful confirmations (muted sage)
        brick: "#B84A3A", // errors, exceptions, quarantines
      },
      fontFamily: {
        // Newsreader/Plex have no Telugu or Devanagari glyphs — chaining the
        // Noto fonts in as fallbacks means font-serif/font-sans render
        // Telugu/Hindi text correctly with zero locale-conditional logic:
        // the browser pulls each character's glyph from the first font in
        // the stack that actually has it.
        serif: ["var(--font-newsreader)", "var(--font-noto-devanagari)", "var(--font-noto-telugu)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "var(--font-noto-devanagari)", "var(--font-noto-telugu)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "var(--font-noto-devanagari)", "var(--font-noto-telugu)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(23 43 58 / 0.06), 0 1px 3px 0 rgb(23 43 58 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
