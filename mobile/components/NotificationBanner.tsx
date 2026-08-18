import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api, type StaffNotification } from "../lib/api";
import { useAuthStore } from "../lib/store/auth";

const POLL_MS = 30_000;

// Plan item 5c — a Hub Manager "assigning" a driver is only ever a
// notification, never a real link (only a physical scan sets
// assigned_staff_id). This is where that notification actually surfaces:
// a global banner, same slot/pattern as OfflineBanner, so it shows up no
// matter which screen the driver is on.
export function NotificationBanner() {
  const staff = useAuthStore((s) => s.staff);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [unread, setUnread] = useState<StaffNotification[]>([]);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    if (!staff || !accessToken) return;

    let cancelled = false;
    async function poll() {
      try {
        const all = await api.getMyNotifications();
        if (!cancelled) setUnread(all.filter((n) => !n.read_at));
      } catch {
        // best-effort — a failed poll just tries again next interval
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [staff, accessToken]);

  if (unread.length === 0) return null;
  const current = unread[0];

  async function handleAck() {
    setAcking(true);
    try {
      await api.ackNotification(current.id);
      setUnread((prev) => prev.filter((n) => n.id !== current.id));
    } catch {
      // leave it showing — they can try again
    } finally {
      setAcking(false);
    }
  }

  return (
    <View className="bg-indigo px-4 py-2.5">
      <Text className="text-xs font-semibold uppercase tracking-widest text-white/70">
        Hub Manager · {unread.length > 1 ? `${unread.length} notifications` : "Notification"}
      </Text>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-sm text-white">{current.message}</Text>
        <Pressable onPress={handleAck} disabled={acking} className="rounded-lg bg-white/15 px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">{acking ? "…" : "Got it"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
