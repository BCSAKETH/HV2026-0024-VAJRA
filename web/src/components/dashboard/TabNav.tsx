"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@/lib/i18n/useTranslation";

export function TabNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const TABS = [
    { href: "/dashboard", label: t.nav.overview },
    { href: "/dashboard/analytics", label: t.nav.analytics },
    { href: "/dashboard/staff", label: t.nav.staff },
    { href: "/dashboard/network", label: t.nav.network },
    { href: "/dashboard/msmes", label: t.nav.msmes },
    { href: "/dashboard/search", label: t.nav.search },
  ];

  return (
    <nav className="flex gap-1 border-b border-navy/10 bg-white px-8">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              active ? "border-indigo text-indigo" : "border-transparent text-navy/50 hover:text-navy"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
