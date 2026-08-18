import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNavBar, type ActiveTab } from "../components/BottomNavBar";
import { Header } from "../components/Header";
import { HistoryScreen } from "../components/HistoryScreen";
import { PhotoCapture, type CapturedPhoto } from "../components/PhotoCapture";
import { ProfileModal } from "../components/ProfileModal";
import { QrScanner } from "../components/QrScanner";
import { ApiError, api, type StaffActivity } from "../lib/api";
import { getCurrentLocationSafe } from "../lib/geo";
import { useThemeStore } from "../lib/store/theme";

type Step = "scan" | "bill_photo" | "ocr_loading" | "review" | "condition_photos" | "submitting" | "done";

interface FormState {
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  delivery_pincode: string;
  weight_grams: string;
  declared_value: string;
  msme_business_name: string;
  msme_phone: string;
}

const EMPTY_FORM: FormState = {
  recipient_name: "",
  recipient_phone: "",
  delivery_address: "",
  delivery_pincode: "",
  weight_grams: "",
  declared_value: "",
  msme_business_name: "",
  msme_phone: "",
};

const SIDE_NAMES = ["Top Side", "Left Side", "Right Side", "Bottom Side"];

export default function IntakeScreen() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);

  const [step, setStep] = useState<Step>("scan");
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [conditionPhotos, setConditionPhotos] = useState<CapturedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the intake call has already succeeded for this
  // trackingId — confirmIntake and the (much larger, much slower) photo
  // upload were sharing one try/catch, so a slow/failed photo upload after
  // a successful intake showed "Could not confirm intake" and a retry
  // re-ran BOTH calls, including the one that had already gone through.
  // Confirmed live: this produced 4 duplicate INTAKE events and 4
  // duplicate SMS to the same customer from one flaky submission.
  const [intakeConfirmed, setIntakeConfirmed] = useState(false);

  const [activityStats, setActivityStats] = useState<StaffActivity["stats"] | null>(null);

  useEffect(() => {
    api.getMyActivity().then((res) => setActivityStats(res.stats)).catch(() => null);
  }, [step]);

  function reset() {
    setStep("scan");
    setTrackingId(null);
    setForm(EMPTY_FORM);
    setConditionPhotos([]);
    setError(null);
    setIntakeConfirmed(false);
  }

  async function handleScan(rawCode: string) {
    setError(null);
    try {
      const resolved = await api.resolve(rawCode);
      if (resolved.type !== "PARCEL") {
        setError("That's a Master Bag code — scan a parcel (TRK-) sticker instead.");
        return;
      }
      setTrackingId(resolved.id);
      setStep("bill_photo");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not resolve that code.");
    }
  }

  async function handleBillPhoto(photo: CapturedPhoto) {
    setStep("ocr_loading");
    try {
      const extracted = await api.ocrBill(photo);
      setForm((f) => ({
        ...f,
        recipient_name: extracted.recipient_name ?? "",
        recipient_phone: extracted.recipient_phone ?? "",
        delivery_address: extracted.delivery_address ?? "",
        delivery_pincode: extracted.delivery_pincode ?? "",
        weight_grams: extracted.weight_grams ? String(extracted.weight_grams) : "",
        declared_value: extracted.declared_value ? String(extracted.declared_value) : "",
        msme_business_name: extracted.sender_name ?? f.msme_business_name,
        msme_phone: extracted.sender_phone ?? f.msme_phone,
      }));
    } catch {
      setError("Couldn't read the bill automatically — fill it in below.");
    } finally {
      setStep("review");
    }
  }

  function handleConditionPhoto(photo: CapturedPhoto) {
    setConditionPhotos((prev) => [...prev, photo].slice(0, 4));
  }

  async function handleSubmit() {
    if (!trackingId) return;
    setStep("submitting");
    setError(null);

    // getCurrentLocationSafe has its own 5s timeout, so a weak GPS fix
    // (indoors, poor sky view) can never block the actual intake network
    // call from firing -- confirmed live this was mistaken for a network
    // problem (0 KB/s, zero server trace) when the real cause was never
    // getting past this step to attempt the network call at all.
    const { lat: staffLat, lng: staffLng } = await getCurrentLocationSafe();

    // Only call confirmIntake if it hasn't already succeeded for this
    // trackingId — a retry after a later step (photo upload) fails must not
    // re-submit an already-confirmed intake. The backend now also refuses
    // to re-notify/re-log on a duplicate call either way, but the client
    // shouldn't be relying on that as its only safety net.
    if (!intakeConfirmed) {
      try {
        await api.confirmIntake(trackingId, {
          recipient_name: form.recipient_name || null,
          recipient_phone: form.recipient_phone || null,
          delivery_address: form.delivery_address || null,
          delivery_pincode: form.delivery_pincode || null,
          weight_grams: form.weight_grams ? Number(form.weight_grams) : null,
          declared_value: form.declared_value ? Number(form.declared_value) : null,
          msme_phone: form.msme_phone || null,
          msme_business_name: form.msme_business_name || null,
          staff_lat: staffLat,
          staff_lng: staffLng,
        });
        setIntakeConfirmed(true);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not confirm intake. Check your connection and try again.");
        setStep("condition_photos");
        return;
      }
    }

    if (conditionPhotos.length > 0) {
      try {
        await api.uploadConditionPhotos(trackingId, conditionPhotos);
      } catch (e) {
        // Intake is already confirmed and the customer's SMS has already
        // gone out at this point — say so plainly, so "try again" here
        // only ever retries the photo upload, not the whole flow.
        setError(
          e instanceof ApiError
            ? `Intake was confirmed, but the photos failed to upload: ${e.message}. Tap Confirm again to retry just the photos.`
            : "Intake was confirmed, but the photos failed to upload — check your connection and tap Confirm again to retry just the photos."
        );
        setStep("condition_photos");
        return;
      }
    }

    setStep("done");
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? "bg-navy" : "bg-ivory"}`}>
      <Header onOpenProfile={() => setProfileOpen(true)} />
      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <View className="flex-1">
        {activeTab === "dashboard" ? (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
              Bill Scanner Dashboard
            </Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
              Intake & Bill Digitization Overview
            </Text>

            <View className="my-6 flex-row gap-3">
              <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
                <Text className="text-xs uppercase tracking-wider text-sage font-bold">Today's Intakes</Text>
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
                Ready to Intake Parcels
              </Text>
              <Text className={`mt-1 text-xs leading-relaxed ${isDark ? "text-white/70" : "text-navy/70"}`}>
                1. Scan blank TRK- parcel QR sticker{"\n"}
                2. Take photo of physical bill for AI OCR extraction{"\n"}
                3. Capture mandatory 4-side package photos (Top, Left, Right, Bottom) stored live in DB
              </Text>

              <Pressable
                onPress={() => {
                  reset();
                  setActiveTab("scanner");
                }}
                className="mt-5 items-center rounded-xl bg-indigo py-3.5"
              >
                <Text className="font-semibold text-white">Start New Parcel Intake</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : activeTab === "history" ? (
          <HistoryScreen />
        ) : (
          /* activeTab === 'scanner' -> Live Scanner & Workflow */
          <View className="flex-1">
            {step === "scan" ? (
              <QrScanner onScan={handleScan} hint={error ?? "Scan a blank parcel QR to begin intake"} />
            ) : step === "bill_photo" ? (
              <PhotoCapture onCaptured={handleBillPhoto} hint={`${trackingId} — Photograph the bill`} />
            ) : step === "ocr_loading" ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#4F46E5" size="large" />
                <Text className={`mt-4 ${isDark ? "text-white/70" : "text-navy/70"}`}>Reading the bill with AI…</Text>
              </View>
            ) : step === "review" ? (
              <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
                <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{trackingId}</Text>
                <Text className={`mb-6 text-2xl font-serif ${isDark ? "text-white" : "text-navy"}`}>
                  Review intake details
                </Text>

                {error ? <Text className="mb-4 text-brick">{error}</Text> : null}

                <FormField isDark={isDark} label="Recipient name" value={form.recipient_name} onChangeText={(v) => setForm((f) => ({ ...f, recipient_name: v }))} />
                <FormField isDark={isDark} label="Recipient phone" value={form.recipient_phone} onChangeText={(v) => setForm((f) => ({ ...f, recipient_phone: v }))} keyboardType="phone-pad" />
                <FormField isDark={isDark} label="Delivery address" value={form.delivery_address} onChangeText={(v) => setForm((f) => ({ ...f, delivery_address: v }))} multiline />
                <FormField isDark={isDark} label="Delivery pincode" value={form.delivery_pincode} onChangeText={(v) => setForm((f) => ({ ...f, delivery_pincode: v }))} keyboardType="number-pad" />
                <FormField isDark={isDark} label="Weight (grams)" value={form.weight_grams} onChangeText={(v) => setForm((f) => ({ ...f, weight_grams: v }))} keyboardType="numeric" />
                <FormField isDark={isDark} label="Declared value (₹)" value={form.declared_value} onChangeText={(v) => setForm((f) => ({ ...f, declared_value: v }))} keyboardType="numeric" />
                <FormField isDark={isDark} label="MSME business (optional)" value={form.msme_business_name} onChangeText={(v) => setForm((f) => ({ ...f, msme_business_name: v }))} />
                <FormField isDark={isDark} label="MSME phone (optional)" value={form.msme_phone} onChangeText={(v) => setForm((f) => ({ ...f, msme_phone: v }))} keyboardType="phone-pad" />

                <Pressable onPress={() => setStep("condition_photos")} className="mt-4 items-center rounded-xl bg-indigo py-3.5">
                  <Text className="font-semibold text-white">Continue to 4-Side Package Inspection</Text>
                </Pressable>
              </ScrollView>
            ) : step === "condition_photos" ? (
              conditionPhotos.length < 4 ? (
                <PhotoCapture
                  onCaptured={handleConditionPhoto}
                  hint={`Damage Inspection — Photo ${conditionPhotos.length + 1}/4 (${SIDE_NAMES[conditionPhotos.length]})`}
                />
              ) : (
                <View className="flex-1 p-6">
                  <Text className={`mb-2 text-2xl font-serif ${isDark ? "text-white" : "text-navy"}`}>
                    4-Side Package Inspection Complete
                  </Text>
                  <Text className={`mb-4 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
                    Top, Left, Right & Bottom photos recorded live in database.
                  </Text>

                  <View className="mb-6 flex-row flex-wrap gap-3">
                    {conditionPhotos.map((p, idx) => (
                      <View key={p.uri} className="relative">
                        <Image source={{ uri: p.uri }} className="h-24 w-24 rounded-xl border border-navy/20" />
                        <View className="absolute bottom-1 left-1 right-1 rounded-md bg-navy/80 py-0.5 px-1">
                          <Text className="text-center text-[10px] font-bold text-white">
                            {SIDE_NAMES[idx]}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {error ? <Text className="mb-4 text-brick">{error}</Text> : null}

                  <Pressable onPress={handleSubmit} className="items-center rounded-xl bg-sage py-3.5">
                    <Text className="font-semibold text-white">Confirm Intake & Save DB</Text>
                  </Pressable>
                  <Pressable onPress={() => setConditionPhotos([])} className="mt-3 items-center">
                    <Text className={isDark ? "text-white/50" : "text-navy/50"}>Retake all 4 photos</Text>
                  </Pressable>
                </View>
              )
            ) : step === "submitting" ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#4F46E5" size="large" />
                <Text className={`mt-4 ${isDark ? "text-white/70" : "text-navy/70"}`}>Confirming intake & storing live DB records…</Text>
              </View>
            ) : (
              /* step === "done" */
              <View className="flex-1 items-center justify-center px-8">
                <Text className="mb-2 text-3xl font-serif text-sage">Intake Confirmed</Text>
                <Text className="mb-2 font-mono text-lg text-orange">{trackingId}</Text>
                <Text className={`mb-8 text-center text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
                  4-Side damage photos linked to QR code in live Postgres DB.
                </Text>
                <Pressable onPress={reset} className="items-center rounded-xl bg-indigo px-8 py-3.5">
                  <Text className="font-semibold text-white">Scan Next Parcel</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} scannerLabel="Intake QR" />
    </SafeAreaView>
  );
}

function FormField(props: {
  isDark: boolean;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "numeric";
  multiline?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className={`mb-1 text-sm font-medium ${props.isDark ? "text-white/80" : "text-navy"}`}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? "default"}
        multiline={props.multiline}
        className={`rounded-xl border px-4 py-3 ${
          props.isDark ? "border-white/20 bg-white/10 text-white" : "border-navy/15 bg-white text-navy"
        }`}
      />
    </View>
  );
}
