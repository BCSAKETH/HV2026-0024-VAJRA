import { Redirect, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useAuthStore } from "../lib/store/auth";

// Every floor role has a real screen — mirrors the web app's
// destinationForRole() in lib/roleRouting.ts exactly. QR_PASTER is the one
// floor role that actually lives on the web app (Digital Printer), so it
// has no mobile screen and falls through to the placeholder below.

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  HUB_MANAGER: "Hub Manager",
  QR_PASTER: "QR Paster",
  BILL_SCANNER: "Bill Scanner",
  CONSOLIDATOR: "Consolidator",
  LINE_HAUL: "Line-Haul Driver",
  LAST_MILE: "Last-Mile Agent",
};

// Placeholder landing screen for any role without a dedicated mobile
// screen (SUPER_ADMIN, HUB_MANAGER, QR_PASTER all live on the web app).
// Role-based routing below is decided purely from `staff.role`, never
// chosen manually by the person logging in.
export default function Home() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);

  if (!staff) {
    return <Redirect href="/login" />;
  }

  if (staff.role === "BILL_SCANNER") {
    return <Redirect href="/billscanner" />;
  }

  if (staff.role === "CONSOLIDATOR") {
    return <Redirect href="/consolidator" />;
  }

  if (staff.role === "LINE_HAUL") {
    return <Redirect href="/linehaul" />;
  }

  if (staff.role === "LAST_MILE") {
    return <Redirect href="/lastmile" />;
  }

  return (
    <View className="flex-1 justify-center bg-ivory px-6">
      <View className="rounded-2xl border border-navy/10 bg-white p-6" style={{ borderRadius: 16 }}>
        <Text className="text-xs uppercase tracking-widest text-orange">Logged in</Text>
        <Text className="mt-1 text-2xl text-navy">{staff.name ?? staff.phone}</Text>
        <Text className="mt-1 text-navy/60">{ROLE_LABEL[staff.role] ?? staff.role}</Text>
        <Text className="mt-4 text-sage">Role-specific screens land in Phase 5.</Text>

        <Pressable
          onPress={() => {
            logout();
            router.replace("/login");
          }}
          className="mt-6 items-center rounded-xl border border-brick py-3"
        >
          <Text className="font-semibold text-brick">Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}
