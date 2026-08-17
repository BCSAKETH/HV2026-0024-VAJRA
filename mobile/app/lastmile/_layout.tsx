import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../lib/store/auth";

export default function LastMileLayout() {
  const staff = useAuthStore((s) => s.staff);

  if (!staff) return <Redirect href="/login" />;
  if (staff.role !== "LAST_MILE" && staff.role !== "SUPER_ADMIN") return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8F5EF" } }} />;
}
