"use client";

import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

type PrinterType = "PARCEL" | "BAG";

interface PrintedItem {
  id: string;
  shortcode: string;
}

const PRINTER_ROLES = ["QR_PASTER", "HUB_MANAGER", "SUPER_ADMIN"];

export default function PrinterPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);

  const [type, setType] = useState<PrinterType>("PARCEL");
  const [current, setCurrent] = useState<PrintedItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !staff) {
      router.replace("/login");
    } else if (!PRINTER_ROLES.includes(staff.role)) {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  async function handleGenerate(nextType: PrinterType) {
    if (!accessToken) return;
    setType(nextType);
    setError(null);
    setLoading(true);
    try {
      const res = await api.generateQr(accessToken, nextType);
      setCurrent(res.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a QR code.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasHydrated || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory">
        <p className="font-mono text-sm text-navy/50">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ivory">
      <header className="no-print flex items-center justify-between border-b border-navy/10 bg-white px-8 py-4">
        <div>
          <p className="font-serif text-2xl text-navy">Digital Printer</p>
          <p className="font-mono text-xs text-navy/50">
            {staff?.name ?? staff?.phone} · {staff?.role}
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="rounded-lg border border-brick px-4 py-2 text-sm font-medium text-brick hover:bg-brick/5"
        >
          Log out
        </button>
      </header>

      <section className="no-print mx-auto max-w-md px-8 py-8">
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => handleGenerate("PARCEL")}
            disabled={loading}
            className="flex-1 rounded-xl bg-orange py-3.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading && type === "PARCEL" ? "Generating…" : "Generate Tracking ID"}
          </button>
          <button
            onClick={() => handleGenerate("BAG")}
            disabled={loading}
            className="flex-1 rounded-xl bg-indigo py-3.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading && type === "BAG" ? "Generating…" : "Generate Bag ID"}
          </button>
        </div>

        {error ? <p className="mb-4 text-brick">{error}</p> : null}

        {current ? (
          <div className="flex flex-col items-center rounded-card border border-navy/10 bg-white p-8 shadow-card">
            <QRCodeSVG value={current.id} size={220} />
            <p className="mt-4 font-mono text-sm text-navy/50">{current.id}</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-navy">{current.shortcode}</p>
            <p className="mt-4 text-center text-sm text-navy/40">
              Paste this on the {type === "PARCEL" ? "parcel" : "bag"} now. No thermal printer? Screenshot this
              screen instead — the QR and shortcode both work from a photo.
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-navy/20 bg-white/50 p-10 text-center text-navy/40">
            Generate a code above — one at a time, right before you paste it.
          </div>
        )}
      </section>
    </main>
  );
}
