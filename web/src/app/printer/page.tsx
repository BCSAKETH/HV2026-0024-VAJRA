"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { ProfileMenu } from "@/components/ProfileMenu";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ApiError, api, type PrinterHistoryItem, type PrinterItem } from "@/lib/api";
import { destinationForRole } from "@/lib/roleRouting";
import { useAuthStore } from "@/lib/store/auth";

type PrinterType = "PARCEL" | "BAG";

const PRINTER_ROLES = ["QR_PASTER", "HUB_MANAGER", "SUPER_ADMIN"];

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PrinterPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const staff = useAuthStore((s) => s.staff);
  const { t } = useTranslation();

  const [tab, setTab] = useState<"generate" | "history">("generate");
  const [type, setType] = useState<PrinterType>("PARCEL");
  const [current, setCurrent] = useState<PrinterItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [history, setHistory] = useState<PrinterHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !staff) {
      router.replace("/login");
    } else if (!PRINTER_ROLES.includes(staff.role)) {
      router.replace(destinationForRole(staff.role));
    }
  }, [hasHydrated, accessToken, staff, router]);

  async function loadHistory() {
    if (!accessToken) return;
    setHistoryLoading(true);
    try {
      const res = await api.getPrinterHistory(accessToken, historyFrom || undefined, historyTo || undefined);
      setHistory(res);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "history" && accessToken && staff?.role === "QR_PASTER") {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, historyFrom, historyTo, accessToken]);

  async function handleGenerate(nextType: PrinterType) {
    if (!accessToken) return;
    setType(nextType);
    setError(null);
    setLoading(true);
    try {
      const res = await api.generateQr(accessToken, nextType);
      setCurrent(res.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.printer.couldNotGenerate);
    } finally {
      setLoading(false);
    }
  }

  if (!hasHydrated || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory">
        <p className="font-mono text-sm text-navy/50">{t.printer.checkingSession}</p>
      </main>
    );
  }

  const isQrPaster = staff?.role === "QR_PASTER";

  return (
    <main className="min-h-screen bg-ivory">
      <header className="no-print flex items-center justify-between border-b border-navy/10 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LOCUS" width={32} height={32} className="rounded-lg" />
          <div>
            <p className="font-serif text-2xl text-navy">{t.printer.title}</p>
            <p className="font-mono text-xs text-navy/50">
              {staff?.name ?? staff?.phone} · {staff ? t.roles[staff.role] : ""}
            </p>
          </div>
        </div>
        <ProfileMenu />
      </header>

      {isQrPaster ? (
        <div className="no-print mx-auto flex max-w-md gap-2 px-8 pt-6">
          <button
            onClick={() => setTab("generate")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              tab === "generate" ? "bg-navy text-ivory" : "bg-white text-navy/50 hover:text-navy"
            }`}
          >
            {t.printer.tabGenerate}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              tab === "history" ? "bg-navy text-ivory" : "bg-white text-navy/50 hover:text-navy"
            }`}
          >
            {t.printer.tabHistory}
          </button>
        </div>
      ) : null}

      {tab === "generate" || !isQrPaster ? (
        <section className="mx-auto max-w-md px-8 py-8">
          <div className="no-print mb-6 flex gap-3">
            <button
              onClick={() => handleGenerate("PARCEL")}
              disabled={loading}
              className="flex-1 rounded-xl bg-orange py-3.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading && type === "PARCEL" ? t.printer.generating : t.printer.generateTrackingId}
            </button>
            <button
              onClick={() => handleGenerate("BAG")}
              disabled={loading}
              className="flex-1 rounded-xl bg-indigo py-3.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading && type === "BAG" ? t.printer.generating : t.printer.generateBagId}
            </button>
          </div>

          {error ? <p className="no-print mb-4 text-brick">{error}</p> : null}

          {current ? (
            <>
              <div className="flex flex-col items-center rounded-card border border-navy/8 bg-white p-8 shadow-card" style={{ borderTop: "3px solid #4F46E5" }}>
                <QRCodeSVG value={current.id} size={220} />
                <p className="mt-4 font-mono text-sm text-navy/50">{current.id}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-navy">{current.shortcode}</p>
                <p className="mt-4 text-center text-sm text-navy/40">
                  {t.printer.generatedOn} {formatStamp(current.created_at)}
                  {current.generated_by_hub_name ? ` · ${current.generated_by_hub_name}` : ""}
                </p>
                <button
                  onClick={() => window.print()}
                  className="no-print mt-6 rounded-xl border border-navy/20 px-6 py-2.5 text-sm font-semibold text-navy transition hover:bg-navy hover:text-ivory"
                >
                  {t.printer.printButton}
                </button>
              </div>

              {/* Formal fixed-size print label — hidden on screen, shown only
                  via @media print (globals.css). Independent from the card
                  above so the printed sheet never includes interactive chrome. */}
              <div className="print-label">
                <div className="print-label-header">
                  <Image src="/logo.png" alt="LOCUS" width={28} height={28} />
                  <span>LOCUS</span>
                </div>
                <QRCodeSVG value={current.id} size={200} />
                <p className="print-label-shortcode">{current.shortcode}</p>
                <p className="print-label-type">{t.printer.labelType[type]}</p>
                <p className="print-label-meta">
                  {formatStamp(current.created_at)}
                  {current.generated_by_hub_name ? ` · ${current.generated_by_hub_name}` : ""}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-card border border-dashed border-navy/20 bg-white/50 p-10 text-center text-navy/40">{t.printer.generatePrompt}</div>
          )}
        </section>
      ) : (
        <section className="no-print mx-auto max-w-3xl px-8 py-8">
          <div className="mb-6 flex gap-3">
            <label className="flex-1 text-sm text-navy/60">
              {t.printer.historyFrom}
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-navy"
              />
            </label>
            <label className="flex-1 text-sm text-navy/60">
              {t.printer.historyTo}
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-navy"
              />
            </label>
          </div>

          {historyLoading ? (
            <p className="font-mono text-sm text-navy/50">{t.printer.checkingSession}</p>
          ) : !history || history.length === 0 ? (
            <div className="rounded-card border border-dashed border-navy/20 bg-white/50 p-10 text-center text-navy/40">{t.printer.historyEmpty}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {history.map((item) => (
                <div key={item.id} className="flex flex-col items-center rounded-card border border-navy/10 bg-white p-4 shadow-card">
                  <QRCodeSVG value={item.id} size={110} />
                  <p className="mt-2 font-mono text-sm font-semibold tracking-widest text-navy">{item.shortcode}</p>
                  <p className="mt-0.5 text-xs text-navy/50">{t.printer.labelType[item.type]}</p>
                  <p className="mt-0.5 text-xs text-navy/40">{formatDay(item.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
