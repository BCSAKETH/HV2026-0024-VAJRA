import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNavBar, type ActiveTab } from "../../components/BottomNavBar";
import { Header } from "../../components/Header";
import { HistoryScreen } from "../../components/HistoryScreen";
import { ProfileModal } from "../../components/ProfileModal";
import { QrScanner } from "../../components/QrScanner";
import { ApiError, api, type Bag, type StaffActivity } from "../../lib/api";
import { useThemeStore } from "../../lib/store/theme";

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
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);

  const [step, setStep] = useState<Step>("scan_bag");
  const [bag, setBag] = useState<Bag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [claimedCount, setClaimedCount] = useState(0);
  const [flash, setFlash] = useState<"claimed" | "stowaway" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  const [activityStats, setActivityStats] = useState<StaffActivity["stats"] | null>(null);

  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api.getClaimed().then((claimed) => setClaimedCount(claimed.length)).catch(() => {});
    api.getMyActivity().then((res) => setActivityStats(res.stats)).catch(() => {});
  }, [step]);

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
    <View className={`border-t p-4 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
      <Pressable disabled={proceeding} onPress={handleProceed} className="items-center rounded-xl bg-indigo py-3.5 disabled:opacity-60">
        {proceeding ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Proceed to Deliver ({claimedCount})</Text>}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className={`flex-1 ${isDark ? "bg-navy" : "bg-ivory"}`}>
      <Header onOpenProfile={() => setProfileOpen(true)} />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View className="flex-1">
        {activeTab === "dashboard" ? (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
              Delivery Agent Dashboard
            </Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
              Doorstep Deliveries & Route Manifest Overview
            </Text>

            <View className="my-6 flex-row gap-3">
              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-sage font-bold">Claimed Parcels</Text>
                <Text className={`mt-2 text-3xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
                  {claimedCount}
                </Text>
              </View>

              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-orange font-bold">Total History</Text>
                <Text className={`mt-2 text-3xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
                  {activityStats?.total_count ?? 0}
                </Text>
              </View>
            </View>

            <View className={`rounded-2xl p-5 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
              <Text className={`font-serif text-lg font-bold ${isDark ? "text-white" : "text-navy"}`}>
                Last-Mile Delivery Workflow
              </Text>
              <Text className={`mt-1 text-xs leading-relaxed ${isDark ? "text-white/70" : "text-navy/70"}`}>
                1. Unseal arrived Master Bag at hub & claim parcels to your manifest{"\n"}
                2. Tap 'Proceed to Deliver' to lock TSP-optimized delivery route{"\n"}
                3. Deliver to doorstep with OTP verification & geofence lock
              </Text>

              <Pressable
                onPress={() => setActiveTab("scanner")}
                className="mt-5 items-center rounded-xl bg-indigo py-3.5"
              >
                <Text className="font-semibold text-white">Unseal Master Bag & Claim Parcels</Text>
              </Pressable>

              {claimedCount > 0 ? (
                <Pressable
                  onPress={handleProceed}
                  disabled={proceeding}
                  className="mt-3 items-center rounded-xl bg-orange py-3.5"
                >
                  <Text className="font-semibold text-white">View Active Manifest ({claimedCount})</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        ) : activeTab === "history" ? (
          <HistoryScreen />
        ) : (
          /* activeTab === 'scanner' */
          <View className="flex-1">
            {step === "scan_bag" ? (
              <View className="flex-1">
                <QrScanner onScan={handleScanBag} hint={error ?? "Scan an arrived Master Bag to unseal"} />
                {proceedBar}
              </View>
            ) : step === "unsealing" ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#4F46E5" size="large" />
              </View>
            ) : bag ? (
              <View className="flex-1">
                <View className={`border-b px-5 py-3 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                  <Text className="font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
                  <View className="flex-row items-baseline justify-between">
                    <Text className={`text-xl font-serif ${isDark ? "text-white" : "text-navy"}`}>Claiming parcels</Text>
                    <Text className="font-mono text-lg font-semibold text-indigo">{claimedCount} claimed</Text>
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

                <ScrollView className="flex-1 px-5 py-3">
                  <Text className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-white/50" : "text-navy/50"}`}>Activity Log</Text>
                  {log.slice(0, 3).map((entry) => (
                    <View key={entry.key} className={`mb-2 rounded-xl p-3 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                      <View className="flex-row items-center">
                        <Text className={entry.kind === "error" ? "mr-2 text-brick" : entry.kind === "stowaway" ? "mr-2 text-orange" : "mr-2 text-sage"}>
                          {entry.kind === "error" ? "✕" : "✓"}
                        </Text>
                        <Text className={`font-mono text-xs ${isDark ? "text-white" : "text-navy"}`}>{entry.trackingId}</Text>
                      </View>
                      <Text className={entry.kind === "error" ? "text-[10px] text-brick" : entry.kind === "stowaway" ? "text-[10px] text-orange" : "text-[10px] text-sage"}>{entry.message}</Text>
                    </View>
                  ))}
                  {log.length === 0 ? <Text className={`text-xs ${isDark ? "text-white/40" : "text-navy/40"}`}>No scans yet</Text> : null}
                </ScrollView>

                <View className={`border-t p-4 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                  <Pressable onPress={() => setStep("scan_bag")} className="mb-3 items-center rounded-xl border border-navy/20 py-3">
                    <Text className={`font-semibold ${isDark ? "text-white" : "text-navy"}`}>Scan Another Bag</Text>
                  </Pressable>
                  {proceedBar}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} scannerLabel="Claim QR" />
    </SafeAreaView>
  );
}
