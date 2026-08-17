"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/lib/store/auth";

const ROLE_LABEL: Record<string, string> = {
  LINE_HAUL: "Line-Haul Driver",
  LAST_MILE: "Last-Mile Agent",
};

// Where LINE_HAUL / LAST_MILE staff land if they log into the web app —
// their actual work happens entirely in the LOCUS mobile app, which is a
// real, deliberate boundary (backend route guards enforce it too), not a
// missing feature. This page just says so plainly instead of bouncing them
// into a page that would reject them with a raw 403.
export default function AccountPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace("/login");
  }, [hasHydrated, accessToken, router]);

  if (!hasHydrated || !accessToken || !staff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory">
        <p className="font-mono text-sm text-navy/50">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ivory px-6">
      <div className="w-full max-w-sm rounded-card border border-navy/10 bg-white p-6 text-center shadow-card">
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">Logged in</p>
        <p className="mb-1 text-xl text-navy">{staff.name ?? staff.phone}</p>
        <p className="mb-4 text-navy/60">{ROLE_LABEL[staff.role] ?? staff.role}</p>
        <p className="mb-6 text-sm text-navy/50">
          This role's tools — scanning, manifests, deliveries — live in the LOCUS mobile app, not here. There&apos;s nothing to do on
          the web for this account.
        </p>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="w-full rounded-xl border border-brick py-3 font-semibold text-brick hover:bg-brick/5"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
