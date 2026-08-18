import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, TextInput, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNavBar, type ActiveTab } from "../components/BottomNavBar";
import { Header } from "../components/Header";
import { HistoryScreen } from "../components/HistoryScreen";
import { ProfileModal } from "../components/ProfileModal";
import { QrScanner } from "../components/QrScanner";
import { ApiError, api, type Bag, type StaffActivity } from "../lib/api";
import { useThemeStore } from "../lib/store/theme";

type Step = "scan_bag" | "loading_bag" | "select_destination" | "scanning" | "dispatch" | "sealed";

interface LogEntry {
  key: string;
  trackingId: string;
  ok: boolean;
  message: string;
}

interface Hub {
  id: string;
  name: string;
  type: string;
}

export default function ConsolidateScreen() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);

  const [step, setStep] = useState<Step>("scan_bag");
  const [bag, setBag] = useState<Bag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<"ok" | "error" | null>(null);
  const [tamperFor, setTamperFor] = useState<string | null>(null);
  const [tamperValue, setTamperValue] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [actualWeight, setActualWeight] = useState("");
  const [dispatchError, setDispatchError] = useState<{ message: string; expected?: number; actual?: number; diffPct?: number } | null>(null);
  const [dispatching, setDispatching] = useState(false);

  const [activityStats, setActivityStats] = useState<StaffActivity["stats"] | null>(null);

  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api.getMyActivity().then((res) => setActivityStats(res.stats)).catch(() => null);
  }, [step]);

  function triggerFlash(kind: "ok" | "error") {
    setFlash(kind);
    flashOpacity.setValue(0.55);
    Animated.timing(flashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setFlash(null));
    if (kind === "error") Vibration.vibrate(300);
  }

  function resetAll() {
    setStep("scan_bag");
    setBag(null);
    setError(null);
    setLog([]);
    setActualWeight("");
    setDispatchError(null);
  }

  async function handleScanBag(rawCode: string) {
    setError(null);
    setStep("loading_bag");
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "BAG") {
        setError("That's a parcel code — scan a Master Bag QR instead.");
        setStep("scan_bag");
        return;
      }
      const fetchedBag = await api.getBag(resolved.id);
      setBag(fetchedBag);

      if (fetchedBag.status === "PRE_ALLOCATED") {
        const hubList = await api.listHubs();
        setHubs(hubList);
        setStep("select_destination");
      } else if (fetchedBag.status === "OPEN") {
        setStep("scanning");
      } else {
        setError(`Bag ${fetchedBag.bag_id} is already ${fetchedBag.status} — it can't be consolidated.`);
        setStep("scan_bag");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not look up that bag.");
      setStep("scan_bag");
    }
  }

  async function handleBindDestination(hubId: string) {
    if (!bag) return;
    try {
      const bound = await api.bindBag(bag.bag_id, hubId);
      setBag(bound);
      setStep("scanning");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not bind this bag.");
      setStep("scan_bag");
    }
  }

  async function handleScanChild(rawCode: string) {
    if (!bag || scanBusy) return;
    setScanBusy(true);
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "PARCEL") {
        triggerFlash("error");
        setLog((l) => [{ key: `${Date.now()}`, trackingId: rawCode, ok: false, message: "Not a parcel code" }, ...l]);
        return;
      }
      const result = await api.scanChild(bag.bag_id, resolved.id);
      setBag((b) => (b ? { ...b, child_count: result.bag_child_count } : b));
      triggerFlash("ok");
      setLog((l) => [{ key: `${Date.now()}`, trackingId: resolved.id, ok: true, message: "Consolidated" }, ...l]);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TAMPER_SEAL_REQUIRED") {
        const resolved = await api.resolve(rawCode).catch(() => null);
        setTamperFor(resolved?.id ?? rawCode);
        return;
      }
      triggerFlash("error");
      const message = e instanceof ApiError ? e.message : "Scan failed";
      setLog((l) => [{ key: `${Date.now()}`, trackingId: rawCode, ok: false, message }, ...l]);
    } finally {
      setScanBusy(false);
    }
  }

  async function submitTamperSeal() {
    if (!bag || !tamperFor || !tamperValue) return;
    try {
      const result = await api.scanChild(bag.bag_id, tamperFor, tamperValue);
      setBag((b) => (b ? { ...b, child_count: result.bag_child_count } : b));
      triggerFlash("ok");
      setLog((l) => [{ key: `${Date.now()}`, trackingId: tamperFor, ok: true, message: "Sealed & consolidated" }, ...l]);
      setTamperFor(null);
      setTamperValue("");
    } catch (e) {
      triggerFlash("error");
      setLog((l) => [{ key: `${Date.now()}`, trackingId: tamperFor, ok: false, message: e instanceof ApiError ? e.message : "Failed" }, ...l]);
      setTamperFor(null);
      setTamperValue("");
    }
  }

  async function handleDispatch() {
    if (!bag || !actualWeight) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const result = await api.dispatchBag(bag.bag_id, Number(actualWeight));
      setBag(result.bag);
      setStep("sealed");
    } catch (e) {
      if (e instanceof ApiError && e.code === "WEIGHT_TOLERANCE_EXCEEDED") {
        setDispatchError({
          message: e.message,
          expected: e.details?.expected_weight as number | undefined,
          actual: e.details?.actual_weight as number | undefined,
          diffPct: e.details?.diff_pct as number | undefined,
        });
      } else {
        setDispatchError({ message: e instanceof ApiError ? e.message : "Dispatch failed" });
      }
    } finally {
      setDispatching(false);
    }
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? "bg-navy" : "bg-ivory"}`}>
      <Header onOpenProfile={() => setProfileOpen(true)} />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View className="flex-1">
        {activeTab === "dashboard" ? (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
              Consolidator Dashboard
            </Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
              Master Bag Packing & Weight Verification
            </Text>

            <View className="my-6 flex-row gap-3">
              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-sage font-bold">Today's Bags</Text>
                <Text className={`mt-2 text-3xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
                  {activityStats?.today_count ?? 0}
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
                Master Bag Consolidation
              </Text>
              <Text className={`mt-1 text-xs leading-relaxed ${isDark ? "text-white/70" : "text-navy/70"}`}>
                1. Scan blank BAG- Master Bag QR code{"\n"}
                2. Bind destination hub & scan child parcels into bag{"\n"}
                3. High-value parcels (&gt;₹5,000) prompt mandatory tamper seal ID{"\n"}
                4. Weigh physical bag before sealing (strict ±1.5% tolerance check)
              </Text>

              <Pressable
                onPress={() => {
                  resetAll();
                  setActiveTab("scanner");
                }}
                className="mt-5 items-center rounded-xl bg-indigo py-3.5"
              >
                <Text className="font-semibold text-white">Consolidate New Master Bag</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : activeTab === "history" ? (
          <HistoryScreen />
        ) : (
          /* activeTab === 'scanner' */
          <View className="flex-1">
            {step === "scan_bag" ? (
              <QrScanner onScan={handleScanBag} hint={error ?? "Scan a blank Master Bag QR"} />
            ) : step === "loading_bag" ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#4F46E5" size="large" />
              </View>
            ) : step === "select_destination" && bag ? (
              <DestinationDrawer bag={bag} hubs={hubs} onSelect={handleBindDestination} onCancel={resetAll} />
            ) : step === "scanning" && bag ? (
              <View className="flex-1">
                <View className={`border-b px-5 py-3 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                  <Text className="font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
                  <View className="flex-row items-baseline justify-between">
                    <Text className={`text-xl font-serif ${isDark ? "text-white" : "text-navy"}`}>Consolidating</Text>
                    <Text className="font-mono text-lg font-semibold text-indigo">{bag.child_count} scanned</Text>
                  </View>
                </View>

                <View className="h-64">
                  <QrScanner onScan={handleScanChild} active={!tamperFor} hint="Scan child parcel QRs" />
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      opacity: flashOpacity,
                      backgroundColor: flash === "ok" ? "#6B8F71" : "#B84A3A",
                    }}
                    className="absolute inset-0"
                  />
                </View>

                <ScrollView className="flex-1 px-5 py-3">
                  <Text className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-white/50" : "text-navy/50"}`}>
                    Activity Log
                  </Text>
                  {log.slice(0, 3).map((entry) => (
                    <View key={entry.key} className={`mb-2 flex-row items-center rounded-xl p-3 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                      <Text className={entry.ok ? "mr-2 text-sage" : "mr-2 text-brick"}>{entry.ok ? "✓" : "✕"}</Text>
                      <View className="flex-1">
                        <Text className={`font-mono text-xs ${isDark ? "text-white" : "text-navy"}`}>{entry.trackingId}</Text>
                        <Text className={entry.ok ? "text-[10px] text-sage" : "text-[10px] text-brick"}>{entry.message}</Text>
                      </View>
                    </View>
                  ))}
                  {log.length === 0 ? <Text className={`text-xs ${isDark ? "text-white/40" : "text-navy/40"}`}>No scans yet</Text> : null}
                </ScrollView>

                {tamperFor ? (
                  <View className="absolute inset-0 items-center justify-center bg-navy/60 px-8">
                    <View className="w-full rounded-2xl bg-white p-6">
                      <Text className="mb-1 text-lg font-semibold text-navy">High-value parcel</Text>
                      <Text className="mb-4 text-xs text-navy/60">{tamperFor} is over ₹5,000. Attach a tamper seal and enter its ID.</Text>
                      <TextInput
                        value={tamperValue}
                        onChangeText={setTamperValue}
                        placeholder="Seal ID"
                        autoCapitalize="characters"
                        className="mb-4 rounded-xl border border-navy/15 px-4 py-3 font-mono text-navy"
                      />
                      <Pressable onPress={submitTamperSeal} className="items-center rounded-xl bg-indigo py-3">
                        <Text className="font-semibold text-white">Confirm Seal</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setTamperFor(null);
                          setTamperValue("");
                        }}
                        className="mt-3 items-center"
                      >
                        <Text className="text-navy/50">Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <View className={`border-t p-4 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
                  <Pressable
                    disabled={bag.child_count === 0}
                    onPress={() => setStep("dispatch")}
                    className={`items-center rounded-xl py-3.5 ${bag.child_count === 0 ? "bg-navy/20" : "bg-orange"}`}
                  >
                    <Text className="font-semibold text-white">Dispatch Bag</Text>
                  </Pressable>
                </View>
              </View>
            ) : step === "dispatch" && bag ? (
              <View className="flex-1 p-6">
                <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
                <Text className={`mb-6 text-2xl font-serif ${isDark ? "text-white" : "text-navy"}`}>Weigh & Dispatch</Text>

                <View className={`mb-6 rounded-2xl p-5 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                  <Text className={`text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>Expected weight (sum of {bag.child_count} parcels)</Text>
                  <Text className={`font-mono text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>{bag.expected_weight.toFixed(0)} g</Text>
                </View>

                <Text className={`mb-1 text-sm font-medium ${isDark ? "text-white/80" : "text-navy"}`}>Physical scale reading (grams)</Text>
                <TextInput
                  value={actualWeight}
                  onChangeText={setActualWeight}
                  keyboardType="numeric"
                  placeholder="0"
                  className={`mb-4 rounded-xl border px-4 py-3 font-mono text-2xl ${
                    isDark ? "border-white/20 bg-white/10 text-white" : "border-navy/15 bg-white text-navy"
                  }`}
                />

                {dispatchError ? (
                  <View className="mb-4 rounded-xl border border-brick/30 bg-brick/5 p-4">
                    <Text className="font-semibold text-brick">Dispatch blocked</Text>
                    <Text className="text-brick text-xs">{dispatchError.message}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleDispatch}
                  disabled={!actualWeight || dispatching}
                  className="items-center rounded-xl bg-orange py-3.5 disabled:opacity-50"
                >
                  {dispatching ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Confirm & Seal Bag</Text>}
                </Pressable>
                <Pressable onPress={() => setStep("scanning")} className="mt-3 items-center">
                  <Text className={isDark ? "text-white/50" : "text-navy/50"}>Back to scanning</Text>
                </Pressable>
              </View>
            ) : step === "sealed" && bag ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="mb-2 text-3xl font-serif text-sage">Bag Sealed</Text>
                <Text className="mb-1 font-mono text-lg text-orange">{bag.bag_id}</Text>
                <Text className={`mb-8 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
                  {bag.child_count} parcels · {bag.actual_weight?.toFixed(0)} g
                </Text>
                <Pressable onPress={resetAll} className="items-center rounded-xl bg-indigo px-8 py-3.5">
                  <Text className="font-semibold text-white">Consolidate Next Bag</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} scannerLabel="Bag QR" />
    </SafeAreaView>
  );
}

function DestinationDrawer({ bag, hubs, onSelect, onCancel }: { bag: Bag; hubs: Hub[]; onSelect: (hubId: string) => void; onCancel: () => void }) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 9 }).start();
  }, [slideAnim]);

  return (
    <View className="flex-1 justify-end bg-navy/60">
      <Pressable className="absolute inset-0" onPress={onCancel} />
      <Animated.View style={{ transform: [{ translateY: slideAnim }] }} className="rounded-t-3xl bg-ivory p-6 pb-10">
        <View className="mb-4 self-center h-1.5 w-12 rounded-full bg-navy/20" />
        <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
        <Text className="mb-4 text-2xl text-navy font-serif">Select destination hub</Text>
        {hubs.map((hub) => (
          <Pressable key={hub.id} onPress={() => onSelect(hub.id)} className="mb-3 rounded-xl border border-navy/10 bg-white px-5 py-4">
            <Text className="text-base font-bold text-navy">{hub.name}</Text>
            <Text className="text-xs text-navy/50">{hub.type}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}
