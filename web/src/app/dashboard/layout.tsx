"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { ProfileMenu } from "@/components/ProfileMenu";
import { DashboardProvider } from "@/lib/dashboardContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const { t } = useTranslation();

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
        <p className="font-mono text-sm text-navy/50">{t.account.checkingSession}</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-ivory">
      <header className="flex items-center justify-between border-b border-navy/10 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LOCUS" width={36} height={36} className="rounded-xl" />
          <div>
            <p className="font-serif text-2xl text-navy">{t.dashboardHeader.title}</p>
            <p className="font-mono text-xs text-navy/50">
              {staff.name ?? staff.phone} · {t.roles[staff.role]}
            </p>
          </div>
        </div>
        <ProfileMenu />
      </header>
      <DashboardProvider>
        <DashboardChrome />
        {children}
      </DashboardProvider>
    </div>
  );
}
