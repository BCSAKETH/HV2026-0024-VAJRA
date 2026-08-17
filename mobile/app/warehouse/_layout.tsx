import { Redirect, Tabs } from "expo-router";

import { useAuthStore } from "../../lib/store/auth";

export default function WarehouseLayout() {
  const staff = useAuthStore((s) => s.staff);

  if (!staff) return <Redirect href="/login" />;
  if (staff.role !== "WAREHOUSE_STAFF" && staff.role !== "SUPER_ADMIN") {
    return <Redirect href="/home" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4F46E5",
        tabBarInactiveTintColor: "#172B3A80",
        tabBarStyle: { backgroundColor: "#FFFFFF" },
      }}
    >
      <Tabs.Screen name="intake" options={{ title: "Intake" }} />
      <Tabs.Screen name="consolidate" options={{ title: "Consolidate" }} />
    </Tabs>
  );
}
