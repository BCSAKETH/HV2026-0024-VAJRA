import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-orange">All 5 phases live</p>
      <h1 className="font-serif text-5xl text-navy">LOCUS</h1>
      <p className="text-navy/70">The Exact Point of Truth.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 rounded-card border border-navy/10 bg-white p-6 shadow-card">
        <Link href="/dashboard" className="rounded-lg bg-indigo px-5 py-2.5 font-semibold text-white hover:opacity-90">
          Command Center
        </Link>
        <Link href="/printer" className="rounded-lg border border-navy/20 px-5 py-2.5 font-semibold text-navy hover:bg-navy/5">
          Digital Printer
        </Link>
        <Link href="/login" className="rounded-lg border border-navy/20 px-5 py-2.5 font-semibold text-navy hover:bg-navy/5">
          Staff Login
        </Link>
      </div>
      <p className="font-mono text-xs text-navy/40">Public tracking lives at /track/[tracking_id] — try any TRK- id.</p>
    </main>
  );
}
