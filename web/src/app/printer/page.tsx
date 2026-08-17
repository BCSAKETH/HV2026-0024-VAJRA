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

const PRINTER_ROLES = ["WAREHOUSE_STAFF", "HUB_MANAGER", "SUPER_ADMIN"];

export default function PrinterPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const logout = useAuthStore((s) => s.logout);

  const [type, setType] = useState<PrinterType>("PARCEL");
  const [count, setCount] = useState(6);
  const [items, setItems] = useState<PrintedItem[]>([]);
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

  async function handleGenerate() {
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.generateQr(accessToken, type, count);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a batch.");
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

      <section className="no-print mx-auto max-w-3xl px-8 py-8">
        <div className="mb-6 inline-flex rounded-xl border border-navy/10 bg-white p-1">
          {(["PARCEL", "BAG"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                type === t ? "bg-indigo text-white" : "text-navy/60 hover:text-navy"
              }`}
            >
              {t === "PARCEL" ? "Child Parcel QR" : "Master Bag QR"}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-4 rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <div>
            <label className="mb-1 block text-sm font-medium text-navy">Batch size</label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-28 rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-lg bg-orange px-6 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Generating…" : `Generate Batch QR${count > 1 ? "s" : ""}`}
          </button>
          {items.length > 0 ? (
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-navy/20 px-6 py-2.5 font-semibold text-navy hover:bg-navy/5"
            >
              Print
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-brick">{error}</p> : null}
      </section>

      {items.length > 0 ? (
        <section className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-8 pb-16 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-center rounded-card border border-navy/10 bg-white p-5 shadow-card"
            >
              <QRCodeSVG value={item.id} size={160} />
              <p className="mt-3 font-mono text-xs text-navy/50">{item.id}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-navy">{item.shortcode}</p>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
