import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader, Noto_Sans_Devanagari, Noto_Sans_Telugu } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// IBM Plex Sans has no Telugu/Devanagari glyphs at all — Telugu/Hindi text
// would render as tofu boxes without these. Both get chained into the same
// font-sans stack in globals.css rather than switched per-locale: the
// browser already does per-character fallback within one stack, so Latin
// text keeps using Plex Sans and Telugu/Devanagari characters pull from
// whichever of these actually has that glyph — no locale-conditional
// font-family logic needed anywhere.
const notoTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-telugu",
  display: "swap",
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LOCUS — The Exact Point of Truth",
  description: "QR-based product tracking, inventory movement & supply chain traceability for MSMEs.",
  icons: { icon: "/logo.png" },
};

// Runs before paint so a returning dark-mode user never sees a flash of the
// light theme while the persisted Zustand store rehydrates client-side.
// Reads localStorage directly (not via the store — that isn't available
// this early) using the same key/shape zustand's persist middleware writes.
const themeInitScript = `
(function () {
  try {
    var raw = localStorage.getItem("locus-theme-storage");
    var theme = raw ? JSON.parse(raw).state.theme : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
  try {
    var rawLocale = localStorage.getItem("locus-locale-storage");
    var locale = rawLocale ? JSON.parse(rawLocale).state.locale : "en";
    document.documentElement.setAttribute("lang", locale);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} ${notoTelugu.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
