import "../global.css";

import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NotificationBanner } from "../components/NotificationBanner";
import { OfflineBanner } from "../components/OfflineBanner";

import { useThemeStore } from "../lib/store/theme";

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <OfflineBanner />
      <NotificationBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: isDark ? "#0A1128" : "#F8F5EF" } }} />
    </SafeAreaProvider>
  );
}
