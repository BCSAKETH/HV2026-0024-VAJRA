import * as Location from "expo-location";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { PhotoCapture, type CapturedPhoto } from "../components/PhotoCapture";
import { QrScanner } from "../components/QrScanner";
import { ApiError, api } from "../lib/api";

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

export default function IntakeScreen() {
  const [step, setStep] = useState<Step>("scan");
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [conditionPhotos, setConditionPhotos] = useState<CapturedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("scan");
    setTrackingId(null);
    setForm(EMPTY_FORM);
    setConditionPhotos([]);
    setError(null);
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
        // MSME auto-link: pre-filled from the bill, not typed by the worker.
        // The backend upserts by phone on confirm — existing MSME gets
        // silently linked, a new phone silently creates one. Still editable
        // below in case OCR misread the letterhead.
        msme_business_name: extracted.sender_name ?? f.msme_business_name,
        msme_phone: extracted.sender_phone ?? f.msme_phone,
      }));
    } catch {
      // Groq OCR failing is expected sometimes — fall through to a blank
      // manual-entry form rather than blocking intake.
      setError("Couldn't read the bill automatically — fill it in below.");
    } finally {
      setStep("review");
    }
  }

  function handleConditionPhoto(photo: CapturedPhoto) {
    setConditionPhotos((prev) => [...prev, photo].slice(0, 2));
  }

  async function handleSubmit() {
    if (!trackingId) return;
    setStep("submitting");
    setError(null);

    let staffLat: number | undefined;
    let staffLng: number | undefined;
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        staffLat = pos.coords.latitude;
        staffLng = pos.coords.longitude;
      }
    } catch {
      // location is a nice-to-have on the intake event, never a blocker
    }

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

      if (conditionPhotos.length > 0) {
        await api.uploadConditionPhotos(trackingId, conditionPhotos);
      }

      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not confirm intake. Check your connection and try again.");
      setStep("condition_photos");
    }
  }

  if (step === "scan") {
    return <QrScanner onScan={handleScan} hint={error ?? "Scan a blank parcel QR to begin intake"} />;
  }

  if (step === "bill_photo") {
    return <PhotoCapture onCaptured={handleBillPhoto} hint={`${trackingId} — Photograph the bill`} />;
  }

  if (step === "ocr_loading") {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
        <Text className="mt-4 text-navy/60">Reading the bill with AI…</Text>
      </View>
    );
  }

  if (step === "review") {
    return (
      <ScrollView className="flex-1 bg-ivory" contentContainerStyle={{ padding: 20 }}>
        <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-orange">{trackingId}</Text>
        <Text className="mb-6 text-2xl text-navy" style={{ fontFamily: "serif" }}>
          Review intake details
        </Text>

        {error ? <Text className="mb-4 text-brick">{error}</Text> : null}

        <FormField label="Recipient name" value={form.recipient_name} onChangeText={(v) => setForm((f) => ({ ...f, recipient_name: v }))} />
        <FormField label="Recipient phone" value={form.recipient_phone} onChangeText={(v) => setForm((f) => ({ ...f, recipient_phone: v }))} keyboardType="phone-pad" />
        <FormField label="Delivery address" value={form.delivery_address} onChangeText={(v) => setForm((f) => ({ ...f, delivery_address: v }))} multiline />
        <FormField label="Delivery pincode" value={form.delivery_pincode} onChangeText={(v) => setForm((f) => ({ ...f, delivery_pincode: v }))} keyboardType="number-pad" />
        <FormField label="Weight (grams)" value={form.weight_grams} onChangeText={(v) => setForm((f) => ({ ...f, weight_grams: v }))} keyboardType="numeric" />
        <FormField label="Declared value (₹)" value={form.declared_value} onChangeText={(v) => setForm((f) => ({ ...f, declared_value: v }))} keyboardType="numeric" />
        <FormField label="MSME business (optional)" value={form.msme_business_name} onChangeText={(v) => setForm((f) => ({ ...f, msme_business_name: v }))} />
        <FormField label="MSME phone (optional)" value={form.msme_phone} onChangeText={(v) => setForm((f) => ({ ...f, msme_phone: v }))} keyboardType="phone-pad" />

        <Pressable onPress={() => setStep("condition_photos")} className="mt-4 items-center rounded-xl bg-indigo py-3.5">
          <Text className="font-semibold text-white">Continue to Proof of Condition</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (step === "condition_photos") {
    if (conditionPhotos.length < 2) {
      return (
        <PhotoCapture
          onCaptured={handleConditionPhoto}
          hint={`Proof of condition — photo ${conditionPhotos.length + 1} of 2`}
        />
      );
    }
    return (
      <View className="flex-1 bg-ivory p-6">
        <Text className="mb-4 text-2xl text-navy" style={{ fontFamily: "serif" }}>
          Proof of condition
        </Text>
        <View className="mb-6 flex-row gap-3">
          {conditionPhotos.map((p) => (
            <Image key={p.uri} source={{ uri: p.uri }} className="h-28 w-28 rounded-xl" />
          ))}
        </View>
        {error ? <Text className="mb-4 text-brick">{error}</Text> : null}
        <Pressable onPress={handleSubmit} className="items-center rounded-xl bg-sage py-3.5">
          <Text className="font-semibold text-white">Confirm Intake</Text>
        </Pressable>
        <Pressable onPress={() => setConditionPhotos([])} className="mt-3 items-center">
          <Text className="text-navy/50">Retake both photos</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "submitting") {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
        <Text className="mt-4 text-navy/60">Confirming intake…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-ivory px-8">
      <Text className="mb-2 text-3xl text-sage" style={{ fontFamily: "serif" }}>
        Intake confirmed
      </Text>
      <Text className="mb-8 font-mono text-navy/60">{trackingId}</Text>
      <Pressable onPress={reset} className="items-center rounded-xl bg-indigo px-8 py-3.5">
        <Text className="font-semibold text-white">Scan Next Parcel</Text>
      </Pressable>
    </View>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "numeric";
  multiline?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-navy">{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? "default"}
        multiline={props.multiline}
        className="rounded-xl border border-navy/15 bg-white px-4 py-3 text-navy"
      />
    </View>
  );
}
