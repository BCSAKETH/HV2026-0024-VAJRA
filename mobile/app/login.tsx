import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { ApiError, api } from "../lib/api";
import { useAuthStore } from "../lib/store/auth";

export default function Login() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [localNumber, setLocalNumber] = useState(""); // bare 10 digits — "+91" is a fixed prefix, never typed
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoBypassAvailable, setDemoBypassAvailable] = useState(false);

  const phone = `+91${localNumber}`;

  async function handleRequestOtp() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(phone);
      setDemoBypassAvailable(res.demo_bypass_available);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, token);
      setSession(res.access_token, res.staff);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify that code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 justify-center bg-ivory px-6">
      <Text className="mb-1 text-center text-4xl text-navy" style={{ fontFamily: "serif" }}>
        LOCUS
      </Text>
      <Text className="mb-10 text-center text-navy/60">The Exact Point of Truth</Text>

      <View className="rounded-2xl border border-navy/10 bg-white p-6" style={{ borderRadius: 16 }}>
        {step === "phone" ? (
          <>
            <Text className="mb-2 text-sm font-medium text-navy">Staff phone number</Text>
            <View className="mb-4 flex-row overflow-hidden rounded-xl border border-navy/15">
              <View className="items-center justify-center bg-navy/5 px-4">
                <Text className="text-navy/60" style={{ fontFamily: "monospace" }}>
                  +91
                </Text>
              </View>
              <TextInput
                value={localNumber}
                onChangeText={(t) => setLocalNumber(t.replace(/\D/g, "").slice(0, 10))}
                keyboardType="number-pad"
                placeholder="9876543210"
                maxLength={10}
                className="flex-1 px-4 py-3 text-navy"
                style={{ fontFamily: "monospace" }}
              />
            </View>
            <Pressable
              onPress={handleRequestOtp}
              disabled={loading || localNumber.length !== 10}
              className="items-center rounded-xl bg-indigo py-3 disabled:opacity-50"
            >
              {loading ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Send OTP</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mb-2 text-sm font-medium text-navy">
              Enter the code sent to {phone}
              {demoBypassAvailable ? " (or the demo code)" : ""}
            </Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              keyboardType="number-pad"
              placeholder="000000"
              maxLength={6}
              className="mb-4 rounded-xl border border-navy/15 px-4 py-3 text-center text-2xl tracking-widest text-navy"
              style={{ fontFamily: "monospace" }}
            />
            <Pressable
              onPress={handleVerifyOtp}
              disabled={loading}
              className="mb-3 items-center rounded-xl bg-indigo py-3"
            >
              {loading ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Verify & Log In</Text>}
            </Pressable>
            <Pressable onPress={() => setStep("phone")}>
              <Text className="text-center text-navy/50">Change number</Text>
            </Pressable>
          </>
        )}

        {error ? <Text className="mt-4 text-center text-brick">{error}</Text> : null}
      </View>
    </View>
  );
}
