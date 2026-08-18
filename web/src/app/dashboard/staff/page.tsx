"use client";

import { useEffect, useState } from "react";

import { ALL_STAFF_ROLES, ApiError, HUB_MANAGER_CREATABLE_ROLES, type Staff, type StaffManifest, type StaffRole, api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboardContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useAuthStore } from "@/lib/store/auth";

// Roles that ever get assigned_staff_id set on a bag/shipment via a real
// scan — the only ones a manifest/notification is actually meaningful for.
const LINKABLE_ROLES: StaffRole[] = ["LINE_HAUL", "LAST_MILE"];

function DriverDetailPanel({ staffMember, accessToken }: { staffMember: Staff; accessToken: string }) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<StaffManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [bagId, setBagId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [sending, setSending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getStaffManifest(accessToken, staffMember.id)
      .then(setManifest)
      .finally(() => setLoading(false));
  }, [accessToken, staffMember.id]);

  async function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setNotifyError(null);
    setSent(false);
    try {
      await api.notifyStaff(accessToken, staffMember.id, {
        message: message.trim(),
        bag_id: bagId.trim() || null,
        tracking_id: trackingId.trim() || null,
      });
      setMessage("");
      setBagId("");
      setTrackingId("");
      setSent(true);
    } catch (err) {
      setNotifyError(err instanceof ApiError ? err.message : t.staff.couldNotSend);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-navy/10 bg-ivory/60 p-4">
      {loading ? (
        <p className="text-sm text-navy/40">
          {t.staff.loadingLinkedPrefix} {staffMember.name ?? t.staff.thisStaffMember}…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">
              {t.staff.bagsCarrying} ({manifest?.bags.length ?? 0})
            </p>
            {!manifest?.bags.length ? (
              <p className="text-sm text-navy/40">{t.staff.noBagsLinked}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {manifest.bags.map((b) => (
                  <div key={b.bag_id} className="rounded-lg border border-navy/10 bg-white px-3 py-2 text-sm">
                    <span className="font-mono text-navy">{b.bag_id}</span>{" "}
                    <span className="text-navy/40">({b.shortcode})</span> — <span className="text-navy/60">{b.status}</span>{" "}
                    <span className="text-navy/40">· {b.child_count} pkg{b.child_count === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-navy/50">
              {t.staff.packagesAssigned} ({manifest?.shipments.length ?? 0})
            </p>
            {!manifest?.shipments.length ? (
              <p className="text-sm text-navy/40">{t.staff.noPackagesLinked}</p>
            ) : (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {manifest.shipments.map((s) => (
                  <div key={s.tracking_id} className="rounded-lg border border-navy/10 bg-white px-3 py-2 text-sm">
                    <span className="font-mono text-navy">{s.tracking_id}</span> — <span className="text-navy/60">{s.status}</span>
                    {s.recipient_name ? <span className="text-navy/40"> · {s.recipient_name}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {LINKABLE_ROLES.includes(staffMember.role) ? (
            <form onSubmit={handleNotify} className="rounded-lg border border-navy/10 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">{t.staff.sendNotification}</p>
              <p className="mb-3 text-xs text-navy/40">
                {t.staff.nudgeOnlyPrefix} {staffMember.name ?? t.staff.theyDefault} {t.staff.nudgeOnlySuffix}
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.staff.messagePlaceholder}
                rows={2}
                className="mb-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-sm text-navy"
              />
              <div className="mb-2 flex gap-2">
                <input
                  value={bagId}
                  onChange={(e) => setBagId(e.target.value.toUpperCase())}
                  placeholder={t.staff.bagIdOptional}
                  className="w-1/2 rounded-lg border border-navy/15 px-3 py-1.5 font-mono text-xs text-navy"
                />
                <input
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                  placeholder={t.staff.trackingIdOptional}
                  className="w-1/2 rounded-lg border border-navy/15 px-3 py-1.5 font-mono text-xs text-navy"
                />
              </div>
              {notifyError ? <p className="mb-2 text-xs text-brick">{notifyError}</p> : null}
              {sent ? <p className="mb-2 text-xs text-sage">{t.staff.notificationSent}</p> : null}
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="w-full rounded-lg bg-orange py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? t.staff.sending : t.staff.sendNotificationBtn}
              </button>
            </form>
          ) : (
            <div className="rounded-lg border border-dashed border-navy/15 p-3 text-sm text-navy/40">
              {t.roles[staffMember.role]} {t.staff.noBagsNoPackagesPrefix}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentStaff = useAuthStore((s) => s.staff);
  const { hubs, previewHubId } = useDashboard();
  const { t } = useTranslation();

  const isHubManager = currentStaff?.role === "HUB_MANAGER";
  const creatableRoles = isHubManager ? HUB_MANAGER_CREATABLE_ROLES : ALL_STAFF_ROLES;

  const [roster, setRoster] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [phone, setPhone] = useState("+91");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>(creatableRoles[0]);
  const [hubId, setHubId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!accessToken) return;
    setLoading(true);
    api
      .listStaff(accessToken, previewHubId)
      .then(setRoster)
      .finally(() => setLoading(false));
  }

  useEffect(load, [accessToken, previewHubId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createStaff(accessToken, {
        phone,
        name: name || null,
        role,
        // Hub Managers never send a hub choice — the backend forces it to
        // their own hub regardless, so the field is hidden for them entirely.
        assigned_hub_id: isHubManager ? null : role === "SUPER_ADMIN" ? null : hubId || null,
      });
      setPhone("+91");
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.staff.couldNotAdd);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    if (!confirm(t.staff.removeConfirm)) return;
    try {
      await api.deleteStaff(accessToken, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.staff.couldNotRemove);
    }
  }

  function hubName(id: string | null) {
    if (!id) return "—";
    return hubs.find((h) => h.id === id)?.name ?? id;
  }

  return (
    <main className="p-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">
            {t.staff.roster} {isHubManager ? t.staff.yourHub : ""} ({roster.length})
          </p>
          {loading ? (
            <p className="text-navy/40">…</p>
          ) : roster.length === 0 ? (
            <p className="text-navy/40">{t.staff.noStaffYet}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {roster.map((s) => (
                <div key={s.id} className="rounded-xl border border-navy/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} className="flex-1 text-left">
                      <p className="text-navy">
                        {s.name ?? "Unnamed"} <span className="font-mono text-xs text-navy/40">{s.phone}</span>
                      </p>
                      <p className="text-xs text-navy/50">
                        {t.roles[s.role]} · {hubName(s.assigned_hub_id)}
                        {s.error_points > 0 ? <span className="ml-2 text-brick">{s.error_points} error pt{s.error_points === 1 ? "" : "s"}</span> : null}
                        <span className="ml-2 text-indigo">{expandedId === s.id ? `▲ ${t.staff.hideDetails}` : `▼ ${t.staff.viewDetails}`}</span>
                      </p>
                    </button>
                    {s.id !== currentStaff?.id ? (
                      <button onClick={() => handleDelete(s.id)} className="rounded-lg border border-brick px-3 py-1.5 text-xs font-semibold text-brick hover:bg-brick/5">
                        {t.common.remove}
                      </button>
                    ) : (
                      <span className="text-xs text-navy/30">{t.common.you}</span>
                    )}
                  </div>
                  {expandedId === s.id && accessToken ? <DriverDetailPanel staffMember={s} accessToken={accessToken} /> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="rounded-card border border-navy/10 bg-white p-6 shadow-card">
          <p className="mb-4 font-serif text-xl text-navy">{t.staff.addStaff}</p>
          {isHubManager ? <p className="mb-4 text-sm text-navy/50">{t.staff.autoAssignedHint}</p> : null}

          <label className="mb-1 block text-sm font-medium text-navy">{t.staff.phone}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 font-mono text-navy" />

          <label className="mb-1 block text-sm font-medium text-navy">{t.staff.name}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy" />

          <label className="mb-1 block text-sm font-medium text-navy">{t.staff.role}</label>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
            {creatableRoles.map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>

          {!isHubManager && role !== "SUPER_ADMIN" ? (
            <>
              <label className="mb-1 block text-sm font-medium text-navy">{t.staff.hub}</label>
              <select value={hubId} onChange={(e) => setHubId(e.target.value)} className="mb-3 w-full rounded-lg border border-navy/15 px-3 py-2 text-navy">
                <option value="">{t.staff.selectHub}</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {error ? <p className="mb-3 text-sm text-brick">{error}</p> : null}

          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-indigo py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {submitting ? t.common.adding : t.staff.addStaff}
          </button>
        </form>
      </div>
    </main>
  );
}
