import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { ProfileModal } from "../components/ProfileModal";
import { useAuthStore } from "../lib/store/auth";
import { useThemeStore } from "../lib/store/theme";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  HUB_MANAGER: "Hub Manager",
  QR_PASTER: "QR Paster (Digital Printer)",
  BILL_SCANNER: "Bill Scanner",
  CONSOLIDATOR: "Consolidator",
  LINE_HAUL: "Line-Haul Driver",
  LAST_MILE: "Last-Mile Agent",
};

export default function Home() {
  const staff = useAuthStore((s) => s.staff);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const [profileOpen, setProfileOpen] = useState(false);

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
    <SafeAreaView className={`flex-1 ${isDark ? "bg-navy" : "bg-ivory"}`}>
      <Header onOpenProfile={() => setProfileOpen(true)} />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View className="flex-1 justify-center px-6">
        <View className={`rounded-3xl p-6 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-lg"}`}>
          <View className="mb-2 self-start rounded-full bg-orange/20 px-3 py-1 border border-orange/40">
            <Text className="text-xs font-bold text-orange">Web Portal Role</Text>
          </View>

          <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
            Welcome, {staff.name ?? staff.phone}
          </Text>
          <Text className={`mt-1 text-sm font-semibold ${isDark ? "text-white/70" : "text-navy/70"}`}>
            Role: {ROLE_LABEL[staff.role] ?? staff.role}
          </Text>

          <View className="my-6 rounded-2xl bg-indigo/10 p-4 border border-indigo/20">
            <Text className="text-sm font-bold text-indigo mb-1">
              🖥️ Manage via Web Dashboard
            </Text>
            <Text className={`text-xs leading-relaxed ${isDark ? "text-white/80" : "text-navy/80"}`}>
              {staff.role === "QR_PASTER"
                ? "The QR Paster / Digital Printer interface runs directly on desktop hardware via web."
                : "Management analytics, hub monitoring, worker provisioning, and live bottleneck alerts run on the LOCUS Web Portal."}
            </Text>
            <Text className="mt-3 font-mono text-xs font-bold text-indigo">
              https://locus-ecru.vercel.app
            </Text>
          </View>

          <Pressable
            onPress={() => setProfileOpen(true)}
            className="items-center rounded-xl bg-indigo py-3.5"
          >
            <Text className="font-semibold text-white">View Staff Profile & Settings</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
