"use client";

import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";
import { TabNav } from "@/components/dashboard/TabNav";
import { useDashboard } from "@/lib/dashboardContext";
import { useAuthStore } from "@/lib/store/auth";

// Sits inside DashboardProvider (needs useDashboard()) but renders the
// pieces every dashboard tab shares: the tab bar, and the Super-Admin-only
// "preview as" switcher.
export function DashboardChrome() {
  const staff = useAuthStore((s) => s.staff);
  const { hubs, previewHubId, setPreviewHubId } = useDashboard();

  return (
    <>
      <TabNav />
      <div className="px-8 pt-6">
        {staff?.role === "SUPER_ADMIN" ? <RoleSwitcher hubs={hubs} previewHubId={previewHubId} onChange={setPreviewHubId} /> : null}
      </div>
    </>
  );
}
