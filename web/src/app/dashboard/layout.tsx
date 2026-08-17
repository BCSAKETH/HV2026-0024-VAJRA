"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { DashboardProvider } from "@/lib/dashboardContext";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (hasHydrated && !accessToken) {
      router.replace("/login");
    } else if (hasHydrated && staff && staff.role !== "SUPER_ADMIN" && staff.role !== "HUB_MANAGER") {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  if (!hasHydrated || !accessToken || !staff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory">
        <p className="font-mono text-sm text-navy/50">Checking session…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-ivory">
      <header className="flex items-center justify-between border-b border-navy/10 bg-white px-8 py-4">
        <div>
          <p className="font-serif text-2xl text-navy">Command Center</p>
          <p className="font-mono text-xs text-navy/50">
            {staff.name ?? staff.phone} · {staff.role}
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="rounded-lg border border-brick px-4 py-2 text-sm font-medium text-brick hover:bg-brick/5"
        >
          Log out
        </button>
      </header>
      <DashboardProvider>
        <DashboardChrome />
        {children}
      </DashboardProvider>
    </div>
  );
}
