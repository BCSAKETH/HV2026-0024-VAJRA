"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Locale = "en" | "te" | "hi";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिन्दी",
};

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => {
        set({ locale });
        if (typeof document !== "undefined") document.documentElement.setAttribute("lang", locale);
      },
    }),
    {
      name: "locus-locale-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") document.documentElement.setAttribute("lang", state.locale);
      },
    }
  )
);
