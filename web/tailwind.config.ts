import type { Config } from "tailwindcss";

// LOCUS design system — "The Exact Point of Truth"
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#F8F5EF", // background
        navy: "#172B3A", // text & primary accents
        indigo: "#4F46E5", // primary actions (cobalt-indigo)
        orange: "#E76F2F", // active scans / warehouse actions (burnt orange)
        sage: "#6B8F71", // successful confirmations (muted sage)
        brick: "#B84A3A", // errors, exceptions, quarantines
        "ivory-2": "#FBFAF7", // elevated surface
        "ivory-3": "#F1ECE2", // recessed surface (inputs, code)
      },
      fontFamily: {
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
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
