import { Pressable, Text, View } from "react-native";
import { useThemeStore } from "../lib/store/theme";

export type ActiveTab = "dashboard" | "scanner" | "history";

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  scannerLabel?: string;
}

export function BottomNavBar({ activeTab, onSelectTab, scannerLabel = "Scan QR" }: BottomNavBarProps) {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <View
      className={`flex-row items-center justify-around px-4 py-2 border-t ${
        isDark ? "bg-navy border-white/10" : "bg-white border-navy/10 shadow-lg"
      }`}
    >
      <Pressable
        onPress={() => onSelectTab("dashboard")}
        className={`flex-1 items-center py-2 ${activeTab === "dashboard" ? "opacity-100" : "opacity-50"}`}
      >
        <Text className={`text-xl ${activeTab === "dashboard" ? (isDark ? "text-orange" : "text-indigo") : isDark ? "text-white" : "text-navy"}`}>
          📊
        </Text>
        <Text className={`mt-1 text-xs font-semibold ${activeTab === "dashboard" ? (isDark ? "text-orange" : "text-indigo") : isDark ? "text-white" : "text-navy"}`}>
          Dashboard
        </Text>
      </Pressable>

      {/* Floating Center Action Button */}
      <View className="-mt-6 items-center justify-center">
        <Pressable
          onPress={() => onSelectTab("scanner")}
          className={`h-16 w-16 items-center justify-center rounded-full border-4 shadow-xl ${
            activeTab === "scanner"
              ? "border-orange bg-indigo"
              : isDark
              ? "border-navy bg-orange"
              : "border-white bg-indigo"
          }`}
        >
          <Text className="text-2xl">📷</Text>
        </Pressable>
        <Text className={`mt-1 text-xs font-bold ${activeTab === "scanner" ? "text-orange" : isDark ? "text-white" : "text-navy"}`}>
          {scannerLabel}
        </Text>
      </View>

      <Pressable
        onPress={() => onSelectTab("history")}
        className={`flex-1 items-center py-2 ${activeTab === "history" ? "opacity-100" : "opacity-50"}`}
      >
        <Text className={`text-xl ${activeTab === "history" ? (isDark ? "text-orange" : "text-indigo") : isDark ? "text-white" : "text-navy"}`}>
          📜
        </Text>
        <Text className={`mt-1 text-xs font-semibold ${activeTab === "history" ? (isDark ? "text-orange" : "text-indigo") : isDark ? "text-white" : "text-navy"}`}>
          History
        </Text>
      </Pressable>
    </View>
  );
}
