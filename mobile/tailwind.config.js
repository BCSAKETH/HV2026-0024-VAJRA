/** @type {import('tailwindcss').Config} */
// LOCUS design system — mirrors web/tailwind.config.ts
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ivory: "#F8F5EF",
        navy: "#172B3A",
        indigo: "#4F46E5",
        orange: "#E76F2F",
        sage: "#6B8F71",
        brick: "#B84A3A",
      },
    },
  },
  plugins: [],
};
