import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { StaffProfile } from "../api";

interface AuthState {
  accessToken: string | null;
  staff: StaffProfile | null;
  hasHydrated: boolean;
  setSession: (accessToken: string, staff: StaffProfile) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      staff: null,
      hasHydrated: false,
      setSession: (accessToken, staff) => set({ accessToken, staff }),
      logout: () => set({ accessToken: null, staff: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "locus-web-auth",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
