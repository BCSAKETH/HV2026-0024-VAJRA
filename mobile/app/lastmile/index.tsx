import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { api } from "../../lib/api";

// Defense 10 (Dead-Battery Handover) lands here: whoever's logged in gets
// their own active manifest back automatically, purely from a DB query
// keyed on staff.id — if Driver B swaps in for Driver A, Driver B sees
// Driver A's in-progress run the moment they log in, no manual handover step.
export default function LastMileEntry() {
  const router = useRouter();

  useEffect(() => {
    api
      .getManifest()
      .then((manifest) => {
        router.replace(manifest.stops.length > 0 ? "/lastmile/manifest" : "/lastmile/claim");
      })
      .catch(() => router.replace("/lastmile/claim"));
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-ivory">
      <ActivityIndicator color="#4F46E5" size="large" />
      <Text className="mt-4 text-navy/50">Checking for an active manifest…</Text>
    </View>
  );
}
