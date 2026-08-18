import "../global.css";

import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NotificationBanner } from "../components/NotificationBanner";
import { OfflineBanner } from "../components/OfflineBanner";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OfflineBanner />
      <NotificationBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8F5EF" } }} />
    </SafeAreaProvider>
  );
}
