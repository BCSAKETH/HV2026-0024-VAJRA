"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { type Locale, LOCALE_LABEL } from "@/lib/store/locale";
import { useAuthStore } from "@/lib/store/auth";

const LOCALES: Locale[] = ["en", "te", "hi"];

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
  const { t, locale, setLocale } = useTranslation();

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace("/login");
  }, [hasHydrated, accessToken, router]);

  if (!hasHydrated || !accessToken || !staff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory">
        <p className="font-mono text-sm text-navy/50">{t.account.checkingSession}</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ivory px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          background:
            "radial-gradient(45% 55% at 15% 15%, #6B8F71, transparent), radial-gradient(40% 50% at 88% 12%, #4F46E5, transparent), radial-gradient(50% 45% at 50% 90%, #E76F2F, transparent)",
        }}
      />
      <div className="relative mb-4 flex gap-1.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              locale === l ? "bg-indigo text-white" : "border border-navy/15 text-navy/50 hover:bg-navy/5"
            }`}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-sm rounded-card border border-navy/8 bg-white p-6 text-center shadow-card" style={{ borderTop: "3px solid #6B8F71" }}>
        <Image src="/logo.png" alt="LOCUS" width={40} height={40} className="mx-auto mb-3 rounded-xl shadow-sm" />
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{t.account.loggedIn}</p>
        <p className="mb-1 text-xl text-navy">{staff.name ?? staff.phone}</p>
        <p className="mb-4 text-navy/60">{t.roles[staff.role]}</p>
        <p className="mb-6 text-sm text-navy/50">{t.account.webNothingToDo}</p>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="w-full rounded-xl border border-brick py-3 font-semibold text-brick hover:bg-brick/5"
        >
          {t.common.logOut}
        </button>
      </div>
    </main>
  );
}
