import AsyncStorage from "@react-native-async-storage/async-storage";
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

// Session lives here, not on any single screen's local state — Defense 10
// (dead-battery handover) depends on the backend being the source of truth
// for "what am I holding", but the app still needs to remember *who* is
// logged in across restarts, which is what this persisted store is for.
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
      name: "locus-auth",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
