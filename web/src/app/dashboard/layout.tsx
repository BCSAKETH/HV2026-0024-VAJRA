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
    <div className="relative min-h-screen overflow-x-hidden bg-ivory">
      {/* Ambient fill for the wide gutters either side of every dashboard
          page's centered content column, and the tail of short pages below
          their last section — a fixed, full-viewport wash so it never
          leaves a stark, empty ivory rectangle no matter how short a given
          page's content is. Same three-color radial-gradient language as
          the landing hero backdrop, far lower opacity since it sits behind
          real working screens, not a hero moment. */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60% 50% at 8% 0%, #4F46E5, transparent), radial-gradient(50% 45% at 100% 20%, #E76F2F, transparent), radial-gradient(55% 60% at 50% 100%, #6B8F71, transparent)",
        }}
      />
      {/* z-20, deliberately higher than the z-10 content wrapper below.
          The header and that content div are SIBLINGS, each its own
          stacking context (both `position: relative`) — a z-index set
          *inside* one context (ProfileMenu's dropdown at z-50) only ever
          competes with other things inside that same context, never with
          a whole separate sibling context. With both previously at z-10,
          the content div (later in DOM order, same z-index) painted on
          top of the entire header — including its open dropdown — which
          is exactly the "can't click Log out, RoleSwitcher is on top of
          the menu" bug confirmed from a real screenshot. Giving the
          header's own context a higher z-index than its sibling's fixes
          it at the root instead of chasing it inside ProfileMenu. */}
      <header className="relative z-20 flex items-center justify-between border-b border-navy/10 bg-white px-8 py-4">
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
        <div className="relative z-10">
          <DashboardChrome />
          {children}
        </div>
      </DashboardProvider>
    </div>
  );
}
