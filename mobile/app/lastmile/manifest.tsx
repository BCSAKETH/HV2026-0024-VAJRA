import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { api, type Manifest } from "../../lib/api";

// Defense 8 (Apartment Trap / Routing): stops arrive already TSP-sorted and
// multi-drop-grouped from the backend. This screen only renders them and
// hands off to the phone's own navigation app — no custom map is built here,
// by design.
export default function ManifestScreen() {
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        // route without a start point — backend just returns stops unsorted
      }
      const m = await api.getManifest(lat, lng);
      setManifest(m);
      setLoading(false);
    })();
  }, []);

  if (loading || !manifest) {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  if (manifest.stops.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-ivory px-8">
        <Text className="mb-2 text-2xl text-sage" style={{ fontFamily: "serif" }}>
          Manifest complete
        </Text>
        <Text className="mb-8 text-center text-navy/60">Every package on your run has been delivered or returned.</Text>
        <Pressable onPress={() => router.replace("/lastmile/claim")} className="items-center rounded-xl bg-indigo px-8 py-3.5">
          <Text className="font-semibold text-white">Claim More Parcels</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-ivory">
      <View className="border-b border-navy/10 bg-white px-5 pb-4 pt-14">
        <Text className="font-mono text-xs uppercase tracking-widest text-orange">Active manifest</Text>
        <Text className="text-2xl text-navy" style={{ fontFamily: "serif" }}>
          {manifest.total_packages} package{manifest.total_packages === 1 ? "" : "s"} · {manifest.stops.length} stop{manifest.stops.length === 1 ? "" : "s"}
        </Text>
      </View>

      <View className="p-5">
        {manifest.stops.map((stop) => (
          <View key={stop.sequence} className="mb-4 rounded-card border border-navy/10 bg-white p-5 shadow-card">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-mono text-sm text-navy/50">Stop {stop.sequence}</Text>
              {stop.shipments.length > 1 ? (
                <View className="rounded-full bg-indigo/10 px-3 py-1">
                  <Text className="text-xs font-semibold text-indigo">Multi-Drop · {stop.shipments.length}</Text>
                </View>
              ) : null}
            </View>

            {stop.needs_manual_location ? (
              <Text className="mb-3 text-brick">No GPS on file — call to confirm the address before heading out.</Text>
            ) : (
              <Text className="mb-3 text-navy/70">{stop.shipments[0].delivery_address ?? stop.shipments[0].delivery_pincode}</Text>
            )}

            {stop.shipments.map((s) => (
              <Pressable
                key={s.tracking_id}
                onPress={() => router.push(`/lastmile/deliver/${s.tracking_id}`)}
                className="mb-2 flex-row items-center justify-between rounded-xl border border-navy/10 bg-ivory px-4 py-3"
              >
                <View>
                  <Text className="text-navy">{s.recipient_name ?? "Unnamed recipient"}</Text>
                  <Text className="font-mono text-xs text-navy/50">{s.tracking_id}</Text>
                </View>
                <Text className="text-indigo">Deliver ›</Text>
              </Pressable>
            ))}

            <View className="mt-2 flex-row gap-3">
              {!stop.needs_manual_location ? (
                <Pressable
                  onPress={() => Linking.openURL(`google.navigation:q=${stop.lat},${stop.lng}`)}
                  className="flex-1 items-center rounded-xl bg-orange py-3"
                >
                  <Text className="font-semibold text-white">Navigate</Text>
                </Pressable>
              ) : null}
              {stop.shipments[0].recipient_phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${stop.shipments[0].recipient_phone}`)}
                  className="flex-1 items-center rounded-xl border border-navy/20 py-3"
                >
                  <Text className="font-semibold text-navy">Call Recipient</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
