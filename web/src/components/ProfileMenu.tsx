"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

import type { StaffRole } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { type Locale, LOCALE_LABEL } from "@/lib/store/locale";
import { useThemeStore } from "@/lib/store/theme";
import { useAuthStore } from "@/lib/store/auth";

const LOCALES: Locale[] = ["en", "te", "hi"];

// Shared Profile & Settings panel — used in the dashboard header, and
// standalone on account/printer pages that don't have the dashboard's
// tab chrome. Mirrors mobile's ProfileModal.tsx: same fields (name, role,
// hub, error points), same two settings (theme, and here also language).
export function ProfileMenu({ hubName }: { hubName?: string | null }) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme } = useThemeStore();
  const { t, locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const isDark = theme === "dark";

  if (!staff) return null;

  function handleLogout() {
    setOpen(false);
    logout();
    router.replace("/login");
  }

  const roleLabel = t.roles[staff.role as StaffRole] ?? staff.role;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-navy/15 bg-white py-1 pl-1 pr-3 text-sm font-semibold text-navy hover:bg-navy/5"
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-indigo">
          <Image src="/logo.png" alt="" width={28} height={28} />
        </span>
        {staff.name?.split(" ")[0] ?? staff.phone}
      </button>

      {open ? (
        <>
          {/* A fully transparent click-catcher used to sit here — nothing
              visually separated the open dropdown from the busy dashboard
              content behind it (RoleSwitcher pills, KPI/index cards), so
              open state read as page content "bleeding through" the menu
              instead of a menu sitting cleanly on top of it. A dimmed,
              blurred backdrop is the standard fix: it still closes on
              click, but now the page behind visibly recedes while the
              menu is open. */}
          <button
            aria-label="close"
            className="fixed inset-0 z-40 cursor-default bg-navy/15 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-card border border-navy/10 bg-white p-5 shadow-2xl">
            <p className="mb-3 font-serif text-lg text-navy">{t.profile.title}</p>

            <div className="mb-4 rounded-xl border border-navy/10 bg-ivory p-3">
              <p className="font-semibold text-navy">{staff.name ?? staff.phone}</p>
              <p className="font-mono text-xs text-sage">{staff.phone}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo px-3 py-0.5 text-xs font-semibold text-white">{roleLabel}</span>
                {staff.error_points > 0 ? (
                  <span className="rounded-full border border-brick/40 bg-brick/10 px-3 py-0.5 text-xs font-semibold text-brick">
                    {staff.error_points} {t.profile.errorPoints}
                  </span>
                ) : null}
              </div>
              {hubName ? <p className="mt-2 text-xs text-navy/50">{t.profile.hub}: {hubName}</p> : null}
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl border border-navy/10 px-3 py-2.5">
              <span className="text-sm font-medium text-navy">{t.profile.theme}</span>
              <div className="flex overflow-hidden rounded-full border border-navy/15">
                <button
                  onClick={() => !isDark || toggleTheme()}
                  className={`px-3 py-1 text-xs font-semibold ${!isDark ? "bg-indigo text-white" : "text-navy/60"}`}
                >
                  {t.profile.light}
                </button>
                <button
                  onClick={() => isDark || toggleTheme()}
                  className={`px-3 py-1 text-xs font-semibold ${isDark ? "bg-indigo text-white" : "text-navy/60"}`}
                >
                  {t.profile.dark}
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-navy/10 px-3 py-2.5">
              <p className="mb-2 text-sm font-medium text-navy">{t.profile.language}</p>
              <div className="flex gap-1.5">
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLocale(l)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                      locale === l ? "bg-indigo text-white" : "border border-navy/15 text-navy/60 hover:bg-navy/5"
                    }`}
                  >
                    {LOCALE_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleLogout} className="w-full rounded-xl bg-brick py-2.5 text-sm font-semibold text-white hover:opacity-90">
              {t.profile.logOut}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
