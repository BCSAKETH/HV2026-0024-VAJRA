"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/network", label: "Network" },
  { href: "/dashboard/msmes", label: "MSMEs" },
];

export function TabNav() {
  const pathname = usePathname();

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
