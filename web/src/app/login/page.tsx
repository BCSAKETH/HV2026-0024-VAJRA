"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PackageBoxScene } from "@/components/3d/PackageBoxScene";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiError, api } from "@/lib/api";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("+91");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoBypassAvailable, setDemoBypassAvailable] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(phone);
      setDemoBypassAvailable(res.demo_bypass_available);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the LOCUS API. Is the backend running?");
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
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ivory px-6">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <PackageBoxScene variant="idle" accentColor="#4F46E5" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ivory/30 via-transparent to-ivory/60" />

      <a href="/" className="relative z-10 mb-1 font-serif text-4xl text-navy">
        LOCUS
      </a>
      <p className="relative z-10 mb-10 text-navy/60">Staff sign in</p>

      <form onSubmit={step === "phone" ? requestOtp : verifyOtp} className="relative z-10 w-full max-w-sm">
      <GlassCard className="p-6">
        {step === "phone" ? (
          <>
            <label className="mb-2 block text-sm font-medium text-navy">Staff phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className="mb-4 w-full rounded-xl border border-navy/15 px-4 py-3 font-mono text-navy outline-none focus:border-indigo"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <label className="mb-2 block text-sm font-medium text-navy">
              Enter the code sent to {phone}
              {demoBypassAvailable ? " (or the demo code)" : ""}
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
              {loading ? "Verifying…" : "Verify & Log In"}
            </button>
            <button type="button" onClick={() => setStep("phone")} className="w-full text-center text-sm text-navy/50">
              Change number
            </button>
          </>
        )}

        {error ? <p className="mt-4 text-center text-sm text-brick">{error}</p> : null}
      </GlassCard>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
