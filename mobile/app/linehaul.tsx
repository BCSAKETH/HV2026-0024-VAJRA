import * as Location from "expo-location";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNavBar, type ActiveTab } from "../components/BottomNavBar";
import { Header } from "../components/Header";
import { HistoryScreen } from "../components/HistoryScreen";
import { ProfileModal } from "../components/ProfileModal";
import { QrScanner } from "../components/QrScanner";
import { ApiError, api, type Bag, type StaffActivity } from "../lib/api";
import { useNetworkStatus } from "../lib/net";
import { useAuthStore } from "../lib/store/auth";
import { useOfflineQueue } from "../lib/store/offlineQueue";
import { useThemeStore } from "../lib/store/theme";

type Step = "scan" | "loading" | "soft_audit" | "processing" | "result";
type Action = "DEPART" | "ARRIVE";

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

function randomClientId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function LineHaulScreen() {
  const staff = useAuthStore((s) => s.staff);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const online = useNetworkStatus();
  const enqueue = useOfflineQueue((s) => s.enqueue);
  const queueLength = useOfflineQueue((s) => s.queue.length);

  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);

  const [step, setStep] = useState<Step>("scan");
  const [bag, setBag] = useState<Bag | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [viaShortcode, setViaShortcode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditIds, setAuditIds] = useState<string[]>([]);
  const [resultKind, setResultKind] = useState<"ok" | "queued" | "error">("ok");
  const [resultMessage, setResultMessage] = useState<string>("");

  const [activityStats, setActivityStats] = useState<StaffActivity["stats"] | null>(null);

  useEffect(() => {
    api.getMyActivity().then((res) => setActivityStats(res.stats)).catch(() => null);
  }, [step]);

  if (!staff) return <Redirect href="/login" />;
  if (staff.role !== "LINE_HAUL" && staff.role !== "SUPER_ADMIN") return <Redirect href="/home" />;

  function reset() {
    setStep("scan");
    setBag(null);
    setAction(null);
    setViaShortcode(false);
    setError(null);
    setAuditIds([]);
  }

  async function handleScan(rawCode: string) {
    setError(null);
    setStep("loading");
    const wasManual = !rawCode.toUpperCase().startsWith("BAG-");
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "BAG") {
        setError("That's a parcel code — scan a Master Bag QR instead.");
        setStep("scan");
        return;
      }
      const fetchedBag = await api.getBag(resolved.id);
      setBag(fetchedBag);
      setViaShortcode(wasManual);

      if (fetchedBag.status === "SEALED") {
        setAction("DEPART");
        await runAction("DEPART", fetchedBag, wasManual, []);
      } else if (fetchedBag.status === "IN_TRANSIT") {
        setAction("ARRIVE");
        if (wasManual) {
          setStep("soft_audit");
        } else {
          await runAction("ARRIVE", fetchedBag, false, []);
        }
      } else {
        setError(`Bag ${fetchedBag.bag_id} is ${fetchedBag.status} — nothing for Line-Haul to do here.`);
        setStep("scan");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not look up that bag.");
      setStep("scan");
    }
  }

  async function handleAuditScan(rawCode: string) {
    if (!bag) return;
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "PARCEL") return;
      setAuditIds((prev) => (prev.includes(resolved.id) ? prev : [...prev, resolved.id]));
    } catch {
      // ignore unresolvable codes
    }
  }

  const auditRequired = bag ? Math.min(3, bag.child_count) : 3;

  async function submitAudit() {
    if (!bag) return;
    await runAction("ARRIVE", bag, true, auditIds);
  }

  async function runAction(act: Action, targetBag: Bag, manual: boolean, softAuditIds: string[]) {
    setStep("processing");
    const { lat, lng } = await getLocation();
    const clientTimestamp = new Date().toISOString();

    if (!online) {
      enqueue({
        clientEventId: randomClientId(),
        action: act,
        bagId: targetBag.bag_id,
        lat,
        lng,
        clientTimestamp,
        viaShortcode: manual,
        softAuditTrackingIds: softAuditIds,
      });
      setResultKind("queued");
      setResultMessage(`${act === "DEPART" ? "Departure" : "Arrival"} cached — will sync once you're back online.`);
      setStep("result");
      return;
    }

    try {
      const updated = act === "DEPART" ? await api.departBag(targetBag.bag_id, lat, lng) : await api.arriveBag(targetBag.bag_id, lat, lng, manual, softAuditIds);
      setBag(updated);
      setResultKind("ok");
      setResultMessage(act === "DEPART" ? "Bag departed — in transit." : "Bag arrived at hub.");
      setStep("result");
    } catch (e) {
      if (!(e instanceof ApiError)) {
        enqueue({
          clientEventId: randomClientId(),
          action: act,
          bagId: targetBag.bag_id,
          lat,
          lng,
          clientTimestamp,
          viaShortcode: manual,
          softAuditTrackingIds: softAuditIds,
        });
        setResultKind("queued");
        setResultMessage(`Connection dropped — ${act.toLowerCase()} cached and will sync automatically.`);
        setStep("result");
        return;
      }

      if (e.code === "SOFT_AUDIT_REQUIRED") {
        setStep("soft_audit");
        return;
      }

      setResultKind("error");
      setResultMessage(e.message);
      setStep("result");
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
              Line-Haul Driver Dashboard
            </Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
              Inter-Hub Transport & Offline Queue Overview
            </Text>

            <View className="my-6 flex-row gap-3">
              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-sage font-bold">Today's Runs</Text>
                <Text className={`mt-2 text-3xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
                  {activityStats?.today_count ?? 0}
                </Text>
              </View>

              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-orange font-bold">Offline Queue</Text>
                <Text className={`mt-2 text-3xl font-bold ${queueLength > 0 ? "text-orange" : isDark ? "text-white" : "text-navy"}`}>
                  {queueLength}
                </Text>
              </View>
            </View>

            <View className={`rounded-2xl p-5 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
              <Text className={`font-serif text-lg font-bold ${isDark ? "text-white" : "text-navy"}`}>
                Inter-Hub Trucking Workflow
              </Text>
              <Text className={`mt-1 text-xs leading-relaxed ${isDark ? "text-white/70" : "text-navy/70"}`}>
                1. Scan SEALED Master Bag at origin hub to mark DEPART{"\n"}
                2. Drive inter-hub route with offline GPS capture{"\n"}
                3. Scan IN_TRANSIT Master Bag at destination hub to mark ARRIVE{"\n"}
                4. If code is entered manually, perform 3-item Soft Audit to prove physical possession
              </Text>

              <Pressable
                onPress={() => {
                  reset();
                  setActiveTab("scanner");
                }}
                className="mt-5 items-center rounded-xl bg-indigo py-3.5"
              >
                <Text className="font-semibold text-white">Scan Master Bag (Depart / Arrive)</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : activeTab === "history" ? (
          <HistoryScreen />
        ) : (
          /* activeTab === 'scanner' */
          <View className="flex-1">
            {step === "scan" ? (
              <QrScanner onScan={handleScan} hint={error ?? "Scan a Master Bag QR"} />
            ) : step === "loading" || step === "processing" ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#4F46E5" size="large" />
              </View>
            ) : step === "soft_audit" && bag ? (
              <View className="flex-1 bg-navy">
                <View className="items-center px-8 pt-12">
                  <Text className="mb-2 text-center text-2xl font-serif text-white">Soft Audit</Text>
                  <Text className="mb-6 text-center text-xs text-white/70">
                    QR was entered manually for {bag.bag_id}. Physically scan {auditRequired} item{auditRequired === 1 ? "" : "s"} from inside the bag to prove possession.
                  </Text>
                  <Text className="mb-6 font-mono text-3xl font-bold text-orange">
                    {auditIds.length} / {auditRequired}
                  </Text>
                </View>
                <View className="h-64">
                  <QrScanner onScan={handleAuditScan} hint="Scan children from inside this bag" />
                </View>
                <View className="p-6">
                  <Pressable
                    disabled={auditIds.length < auditRequired}
                    onPress={submitAudit}
                    className={`items-center rounded-xl py-3.5 ${auditIds.length < auditRequired ? "bg-white/20" : "bg-sage"}`}
                  >
                    <Text className="font-semibold text-white">Confirm Possession & Mark Arrived</Text>
                  </Pressable>
                </View>
              </View>
            ) : step === "result" ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text
                  className={`mb-2 font-serif text-3xl ${
                    resultKind === "ok" ? "text-sage" : resultKind === "queued" ? "text-orange" : "text-brick"
                  }`}
                >
                  {resultKind === "ok" ? "Done" : resultKind === "queued" ? "Queued" : "Rejected"}
                </Text>
                {bag ? <Text className="mb-1 font-mono text-orange">{bag.bag_id}</Text> : null}
                <Text className={`mb-8 text-center text-xs ${isDark ? "text-white/70" : "text-navy/70"}`}>{resultMessage}</Text>
                <Pressable onPress={reset} className="items-center rounded-xl bg-indigo px-8 py-3.5">
                  <Text className="font-semibold text-white">Scan Next Bag</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} scannerLabel="Driver QR" />
    </SafeAreaView>
  );
}
