import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from "react-native";

import { QrScanner } from "../../components/QrScanner";
import { ApiError, api, type Bag } from "../../lib/api";

type Step = "scan_bag" | "unsealing" | "scan_children";

interface LogEntry {
  key: string;
  trackingId: string;
  kind: "claimed" | "stowaway" | "error";
  message: string;
}

async function getLocation(): Promise<{ lat?: number; lng?: number }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return {};
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return {};
  }
}

export default function ClaimScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("scan_bag");
  const [bag, setBag] = useState<Bag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [claimedCount, setClaimedCount] = useState(0);
  const [flash, setFlash] = useState<"claimed" | "stowaway" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api.getClaimed().then((claimed) => setClaimedCount(claimed.length)).catch(() => {});
  }, []);

  function triggerFlash(kind: "claimed" | "stowaway" | "error") {
    setFlash(kind);
    flashOpacity.setValue(0.5);
    Animated.timing(flashOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => setFlash(null));
  }

  async function handleScanBag(rawCode: string) {
    setError(null);
    setStep("unsealing");
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "BAG") {
        setError("That's a parcel code — scan a Master Bag QR instead.");
        setStep("scan_bag");
        return;
      }
      const { lat, lng } = await getLocation();
      const unsealed = await api.unsealBag(resolved.id, lat, lng);
      setBag(unsealed);
      setStep("scan_children");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not unseal that bag.");
      setStep("scan_bag");
    }
  }

  async function handleScanChild(rawCode: string) {
    if (!bag || busy) return;
    setBusy(true);
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "PARCEL") {
        triggerFlash("error");
        setLog((l) => [{ key: `${Date.now()}`, trackingId: rawCode, kind: "error", message: "Not a parcel code" }, ...l]);
        return;
      }
      const { lat, lng } = await getLocation();
      const result = await api.claimChild(bag.bag_id, resolved.id, lat, lng);
      setClaimedCount((c) => c + 1);
      if (result.stowaway) {
        triggerFlash("stowaway");
        setLog((l) => [{ key: `${Date.now()}`, trackingId: resolved.id, kind: "stowaway", message: result.message ?? "Auto-healed" }, ...l]);
      } else {
        triggerFlash("claimed");
        setLog((l) => [{ key: `${Date.now()}`, trackingId: resolved.id, kind: "claimed", message: "Claimed" }, ...l]);
      }
    } catch (e) {
      triggerFlash("error");
      const message = e instanceof ApiError ? e.message : "Claim failed";
      setLog((l) => [{ key: `${Date.now()}`, trackingId: rawCode, kind: "error", message }, ...l]);
    } finally {
      setBusy(false);
    }
  }

  async function handleProceed() {
    setProceeding(true);
    setError(null);
    try {
      await api.proceedToDeliver();
      router.replace("/lastmile/manifest");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not lock the manifest.");
      setProceeding(false);
    }
  }

  const proceedBar = claimedCount > 0 && (
    <View className="border-t border-navy/10 bg-white p-4">
      <Pressable disabled={proceeding} onPress={handleProceed} className="items-center rounded-xl bg-indigo py-3.5 disabled:opacity-60">
        {proceeding ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Proceed to Deliver ({claimedCount})</Text>}
      </Pressable>
    </View>
  );

  if (step === "scan_bag") {
    return (
      <View className="flex-1">
        <QrScanner onScan={handleScanBag} hint={error ?? "Scan an arrived Master Bag to unseal"} />
        {proceedBar}
      </View>
    );
  }

  if (step === "unsealing") {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  if (bag) {
    return (
      <View className="flex-1 bg-ivory">
        <View className="border-b border-navy/10 bg-white px-5 pb-4 pt-14">
          <Text className="font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-2xl text-navy" style={{ fontFamily: "serif" }}>
              Claiming parcels
            </Text>
            <Text className="font-mono text-xl font-semibold text-navy">{claimedCount} claimed</Text>
          </View>
        </View>

        <View className="h-64">
          <QrScanner onScan={handleScanChild} hint="Scan children to claim" />
          <Animated.View
            pointerEvents="none"
            style={{ opacity: flashOpacity, backgroundColor: flash === "error" ? "#B84A3A" : flash === "stowaway" ? "#E76F2F" : "#6B8F71" }}
            className="absolute inset-0"
          />
        </View>

        <ScrollView className="flex-1 px-5 py-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy/50">Activity Log</Text>
          {log.slice(0, 3).map((entry) => (
            <View key={entry.key} className="mb-2 rounded-xl border border-navy/10 bg-white px-4 py-3">
              <View className="flex-row items-center">
                <Text className={entry.kind === "error" ? "mr-2 text-brick" : entry.kind === "stowaway" ? "mr-2 text-orange" : "mr-2 text-sage"}>
                  {entry.kind === "error" ? "✕" : "✓"}
                </Text>
                <Text className="font-mono text-sm text-navy">{entry.trackingId}</Text>
              </View>
              <Text className={entry.kind === "error" ? "text-xs text-brick" : entry.kind === "stowaway" ? "text-xs text-orange" : "text-xs text-sage"}>{entry.message}</Text>
            </View>
          ))}
          {log.length === 0 ? <Text className="text-navy/40">No scans yet</Text> : null}
        </ScrollView>

        <View className="border-t border-navy/10 bg-white p-4">
          <Pressable onPress={() => setStep("scan_bag")} className="mb-3 items-center rounded-xl border border-navy/20 py-3">
            <Text className="font-semibold text-navy">Scan Another Bag</Text>
          </Pressable>
          {proceedBar}
        </View>
      </View>
    );
  }

  return null;
}
