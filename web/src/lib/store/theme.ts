"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

interface ThemeState {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

// Mirrors mobile's lib/store/theme.ts exactly (same shape, same default) so
// the two apps behave identically — only the storage backend differs
// (localStorage here vs AsyncStorage there).
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      toggleTheme: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        applyThemeToDocument(next);
      },
      setTheme: (theme) => {
        set({ theme });
        applyThemeToDocument(theme);
      },
    }),
    {
      name: "locus-theme-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDocument(state.theme);
      },
    }
  )
);

function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
