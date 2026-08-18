"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

// Mirrors mobile's app/index.tsx exactly: no menu of destinations, no
// choice to make. Not logged in -> /login. Logged in -> wherever the
// backend-verified role sends you. One entry point, same as the phone app.
export default function Home() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const { t } = useTranslation();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !staff) {
      router.replace("/login");
    } else {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ivory">
      <p className="font-serif text-3xl text-navy">{t.login.title}</p>
      <p className="font-mono text-xs text-navy/40">{t.track.tagline.split("· ")[1]}</p>
    </main>
  );
}
