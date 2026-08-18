import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, TextInput, Vibration, View } from "react-native";

import { QrScanner } from "../components/QrScanner";
import { ApiError, api, type Bag } from "../lib/api";

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

  const flashOpacity = useRef(new Animated.Value(0)).current;

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

  if (step === "scan_bag") {
    return <QrScanner onScan={handleScanBag} hint={error ?? "Scan a blank Master Bag QR"} />;
  }

  if (step === "loading_bag") {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  if (step === "select_destination" && bag) {
    return <DestinationDrawer bag={bag} hubs={hubs} onSelect={handleBindDestination} onCancel={resetAll} />;
  }

  if (step === "scanning" && bag) {
    return (
      <View className="flex-1 bg-ivory">
        <View className="border-b border-navy/10 bg-white px-5 pb-4 pt-14">
          <Text className="font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-2xl text-navy" style={{ fontFamily: "serif" }}>
              Consolidating
            </Text>
            <Text className="font-mono text-xl font-semibold text-navy">{bag.child_count} scanned</Text>
          </View>
        </View>

        <View className="h-72">
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

        <ScrollView className="flex-1 px-5 py-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy/50">Activity Log</Text>
          {log.slice(0, 3).map((entry) => (
            <View key={entry.key} className="mb-2 flex-row items-center rounded-xl border border-navy/10 bg-white px-4 py-3">
              <Text className={entry.ok ? "mr-2 text-sage" : "mr-2 text-brick"}>{entry.ok ? "✓" : "✕"}</Text>
              <View className="flex-1">
                <Text className="font-mono text-sm text-navy">{entry.trackingId}</Text>
                <Text className={entry.ok ? "text-xs text-sage" : "text-xs text-brick"}>{entry.message}</Text>
              </View>
            </View>
          ))}
          {log.length === 0 ? <Text className="text-navy/40">No scans yet</Text> : null}
        </ScrollView>

        {tamperFor ? (
          <View className="absolute inset-0 items-center justify-center bg-navy/60 px-8">
            <View className="w-full rounded-card bg-white p-6">
              <Text className="mb-1 text-lg font-semibold text-navy">High-value parcel</Text>
              <Text className="mb-4 text-navy/60">{tamperFor} is over ₹5,000. Attach a tamper seal and enter its ID.</Text>
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

        <View className="border-t border-navy/10 bg-white p-4">
          <Pressable
            disabled={bag.child_count === 0}
            onPress={() => setStep("dispatch")}
            className={`items-center rounded-xl py-3.5 ${bag.child_count === 0 ? "bg-navy/20" : "bg-orange"}`}
          >
            <Text className="font-semibold text-white">Dispatch Bag</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "dispatch" && bag) {
    const expected = bag.expected_weight;
    const previewDiffPct = actualWeight && expected > 0 ? (Math.abs(Number(actualWeight) - expected) / expected) * 100 : null;
    const previewOk = previewDiffPct !== null && previewDiffPct <= 1.5;

    return (
      <View className="flex-1 bg-ivory p-6 pt-16">
        <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{bag.bag_id}</Text>
        <Text className="mb-6 text-2xl text-navy" style={{ fontFamily: "serif" }}>
          Weigh & Dispatch
        </Text>

        <View className="mb-6 rounded-card border border-navy/10 bg-white p-5">
          <Text className="text-sm text-navy/50">Expected weight (sum of {bag.child_count} parcels)</Text>
          <Text className="font-mono text-2xl text-navy">{expected.toFixed(0)} g</Text>
        </View>

        <Text className="mb-1 text-sm font-medium text-navy">Physical scale reading (grams)</Text>
        <TextInput
          value={actualWeight}
          onChangeText={setActualWeight}
          keyboardType="numeric"
          placeholder="0"
          className="mb-4 rounded-xl border border-navy/15 bg-white px-4 py-3 font-mono text-2xl text-navy"
        />

        {previewDiffPct !== null ? (
          <View className="mb-6">
            <View className="h-3 w-full overflow-hidden rounded-full bg-navy/10">
              <View
                style={{ width: `${Math.min(previewDiffPct / 1.5, 1) * 100}%` }}
                className={`h-full ${previewOk ? "bg-sage" : "bg-brick"}`}
              />
            </View>
            <Text className={`mt-1 text-xs ${previewOk ? "text-sage" : "text-brick"}`}>
              {previewDiffPct.toFixed(2)}% off expected — tolerance is ±1.5%
            </Text>
          </View>
        ) : null}

        {dispatchError ? (
          <View className="mb-4 rounded-xl border border-brick/30 bg-brick/5 p-4">
            <Text className="font-semibold text-brick">Dispatch blocked</Text>
            <Text className="text-brick">{dispatchError.message}</Text>
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
          <Text className="text-navy/50">Back to scanning</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "sealed" && bag) {
    return (
      <View className="flex-1 items-center justify-center bg-ivory px-8">
        <Text className="mb-2 text-3xl text-sage" style={{ fontFamily: "serif" }}>
          Bag sealed
        </Text>
        <Text className="mb-1 font-mono text-navy/60">{bag.bag_id}</Text>
        <Text className="mb-8 text-navy/50">{bag.child_count} parcels · {bag.actual_weight?.toFixed(0)} g</Text>
        <Pressable onPress={resetAll} className="items-center rounded-xl bg-indigo px-8 py-3.5">
          <Text className="font-semibold text-white">Consolidate Next Bag</Text>
        </Pressable>
      </View>
    );
  }

  return null;
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
        <Text className="mb-4 text-2xl text-navy" style={{ fontFamily: "serif" }}>
          Select destination hub
        </Text>
        {hubs.map((hub) => (
          <Pressable key={hub.id} onPress={() => onSelect(hub.id)} className="mb-3 rounded-xl border border-navy/10 bg-white px-5 py-4">
            <Text className="text-lg text-navy">{hub.name}</Text>
            <Text className="text-xs text-navy/50">{hub.type}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}
