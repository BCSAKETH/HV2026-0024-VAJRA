"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { type Hub, api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

interface DashboardContextValue {
  hubs: Hub[];
  refreshHubs: () => void;
  previewHubId: string | null;
  setPreviewHubId: (id: string | null) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

// Lives in the dashboard layout so "preview as" and the hub list stay in
// sync across tabs (Overview / Analytics / Staff / Network) instead of
// resetting on every navigation — Next.js keeps the layout mounted across
// route changes within it, so this state survives tab switches for free.
export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [previewHubId, setPreviewHubId] = useState<string | null>(null);

  const refreshHubs = useCallback(() => {
    if (accessToken) api.listHubs(accessToken).then(setHubs);
  }, [accessToken]);

  useEffect(refreshHubs, [refreshHubs]);

  return <DashboardContext.Provider value={{ hubs, refreshHubs, previewHubId, setPreviewHubId }}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
