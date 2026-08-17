import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuthStore } from "../lib/store/auth";

export default function Index() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!hasHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" />
      </View>
    );
  }

  return <Redirect href={accessToken ? "/home" : "/login"} />;
}
