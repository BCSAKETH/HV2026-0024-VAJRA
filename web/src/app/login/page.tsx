"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { destinationForRole } from "@/lib/roleRouting";
import { type Locale, LOCALE_LABEL } from "@/lib/store/locale";
import { useAuthStore } from "@/lib/store/auth";

const LOCALES: Locale[] = ["en", "te", "hi"];

function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const { t, locale, setLocale } = useTranslation();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [localNumber, setLocalNumber] = useState(""); // bare 10 digits — "+91" is a fixed prefix, never typed
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoBypassAvailable, setDemoBypassAvailable] = useState(false);

  const phone = `+91${localNumber}`;

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(phone);
      setDemoBypassAvailable(res.demo_bypass_available);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.login.errorRequest);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, token);
      setSession(res.access_token, res.staff);
      // The backend-verified role decides the destination — never a query
      // param, never a button the user clicked before logging in.
      router.replace(destinationForRole(res.staff.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.login.errorVerify);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ivory px-6">
      {/* Same gradient language as the landing hero, quieter here on
          purpose — a bold backdrop is fine, a competing interactive scene
          isn't: this page has exactly one job (get the OTP entered). */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          background:
            "radial-gradient(45% 55% at 15% 15%, #4F46E5, transparent), radial-gradient(40% 50% at 88% 12%, #E76F2F, transparent), radial-gradient(50% 45% at 50% 90%, #6B8F71, transparent)",
        }}
      />

      <div className="relative mb-2 flex gap-1.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              locale === l ? "bg-indigo text-white" : "border border-navy/15 text-navy/50 hover:bg-navy/5"
            }`}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>

      <Image src="/logo.png" alt="LOCUS" width={56} height={56} className="relative mb-3 rounded-2xl shadow-lg shadow-indigo/20" />
      <h1 className="relative mb-1 font-serif text-4xl text-navy">{t.login.title}</h1>
      <p className="relative mb-10 text-navy/60">{t.login.subtitle}</p>

      <form
        onSubmit={step === "phone" ? requestOtp : verifyOtp}
        className="relative w-full max-w-sm rounded-card border border-navy/10 bg-white p-6 shadow-card"
      >
        {step === "phone" ? (
          <>
            <label className="mb-2 block text-sm font-medium text-navy">{t.login.phoneLabel}</label>
            <div className="mb-4 flex overflow-hidden rounded-xl border border-navy/15 focus-within:border-indigo">
              <span className="flex items-center bg-navy/5 px-4 font-mono text-navy/60">+91</span>
              <input
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                inputMode="numeric"
                maxLength={10}
                className="w-full px-4 py-3 font-mono text-navy outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || localNumber.length !== 10}
              className="w-full rounded-xl bg-indigo py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t.login.sending : t.login.sendOtp}
            </button>
          </>
        ) : (
          <>
            <label className="mb-2 block text-sm font-medium text-navy">
              {t.login.otpLabelPrefix} {phone}
              {demoBypassAvailable ? ` ${t.login.demoCodeHint}` : ""}
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="mb-4 w-full rounded-xl border border-navy/15 px-4 py-3 text-center font-mono text-2xl tracking-widest text-navy outline-none focus:border-indigo"
            />
            <button
              type="submit"
              disabled={loading}
              className="mb-3 w-full rounded-xl bg-indigo py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t.login.verifying : t.login.verify}
            </button>
            <button type="button" onClick={() => setStep("phone")} className="w-full text-center text-sm text-navy/50">
              {t.login.changeNumber}
            </button>
          </>
        )}

        {error ? <p className="mt-4 text-center text-sm text-brick">{error}</p> : null}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
