import { useRouter } from "expo-router";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";

import { useAuthStore } from "../lib/store/auth";
import { useThemeStore } from "../lib/store/theme";

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  HUB_MANAGER: "Hub Manager",
  QR_PASTER: "QR Paster (Digital Printer)",
  BILL_SCANNER: "Bill Scanner & Intake",
  CONSOLIDATOR: "Consolidator",
  LINE_HAUL: "Line-Haul Truck Driver",
  LAST_MILE: "Last-Mile Delivery Agent",
};

export function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  function handleLogout() {
    onClose();
    logout();
    router.replace("/login");
  }

  if (!staff) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View className={`rounded-t-3xl p-6 ${isDark ? "bg-navy border-t border-white/10" : "bg-ivory border-t border-navy/10"}`}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
              Staff Profile
            </Text>
            <Pressable onPress={onClose} className="rounded-full bg-navy/10 p-2">
              <Text className={`text-base font-bold ${isDark ? "text-white" : "text-navy"}`}>✕</Text>
            </Pressable>
          </View>

          <ScrollView className="max-h-96">
            <View className={`mb-4 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
              <Text className={`text-xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
                {staff.name ?? staff.phone}
              </Text>
              <Text className="mt-1 font-mono text-sm text-sage">{staff.phone}</Text>

              <View className="mt-3 flex-row flex-wrap gap-2">
                <View className="rounded-full bg-indigo px-3 py-1">
                  <Text className="text-xs font-semibold text-white">
                    {ROLE_LABEL[staff.role] ?? staff.role}
                  </Text>
                </View>
                {staff.error_points > 0 ? (
                  <View className="rounded-full bg-brick/20 px-3 py-1 border border-brick/40">
                    <Text className="text-xs font-semibold text-brick">
                      {staff.error_points} Error Points
                    </Text>
                  </View>
                ) : (
                  <View className="rounded-full bg-sage/20 px-3 py-1 border border-sage/40">
                    <Text className="text-xs font-semibold text-sage">Clean Record</Text>
                  </View>
                )}
              </View>

              {staff.assigned_hub_id ? (
                <Text className={`mt-3 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
                  Assigned Hub ID: <Text className="font-mono">{staff.assigned_hub_id}</Text>
                </Text>
              ) : null}
            </View>

            <View className={`mb-4 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
              <Text className={`mb-3 text-sm font-semibold uppercase tracking-wider ${isDark ? "text-white/70" : "text-navy/70"}`}>
                App Settings
              </Text>

              <View className="flex-row items-center justify-between py-2">
                <View>
                  <Text className={`font-semibold ${isDark ? "text-white" : "text-navy"}`}>
                    Dark Theme
                  </Text>
                  <Text className={`text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
                    Toggle light / dark appearance
                  </Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: "#d1d5db", true: "#4F46E5" }}
                  thumbColor={isDark ? "#ffffff" : "#f4f3f4"}
                />
              </View>
            </View>

            <Pressable
              onPress={handleLogout}
              className="mb-6 items-center rounded-xl bg-brick py-3.5"
            >
              <Text className="font-semibold text-white">Sign Out</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
