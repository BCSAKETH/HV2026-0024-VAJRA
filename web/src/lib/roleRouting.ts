import type { StaffRole } from "./api";

// Single source of truth for "where does this role land on web" — mirrors
// the mobile app's role-routing in app/home.tsx exactly. Nobody picks a
// destination; the backend-verified role decides it, every time, on both
// apps. QR_PASTER is the one floor role that's actually web-based (they
// run the Digital Printer); BILL_SCANNER/CONSOLIDATOR/LINE_HAUL/LAST_MILE
// have no web surface at all — mobile-only, matching what the backend's
// own route guards actually allow.
export function destinationForRole(role: StaffRole): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "HUB_MANAGER":
      return "/dashboard";
    case "QR_PASTER":
      return "/printer";
    case "BILL_SCANNER":
    case "CONSOLIDATOR":
    case "LINE_HAUL":
    case "LAST_MILE":
      return "/account";
  }
}
