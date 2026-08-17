import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import { useNetworkStatus } from "../lib/net";
import { useOfflineQueue } from "../lib/store/offlineQueue";

export function OfflineBanner() {
  const online = useNetworkStatus();
  const queueLength = useOfflineQueue((s) => s.queue.length);
  const flush = useOfflineQueue((s) => s.flush);
  const wasOnline = useRef(online);

  useEffect(() => {
    // Fires on reconnect (offline -> online transition) AND once on mount if
    // the app was relaunched while already online with a leftover queue.
    if (online && (!wasOnline.current || queueLength > 0)) {
      flush();
    }
    wasOnline.current = online;
  }, [online, queueLength, flush]);

  if (online && queueLength === 0) return null;

  return (
    <View className={`items-center py-2 ${online ? "bg-orange" : "bg-brick"}`}>
      <Text className="text-xs font-semibold uppercase tracking-widest text-white">
        {online ? `Syncing ${queueLength} cached scan${queueLength === 1 ? "" : "s"}…` : `Offline Mode — ${queueLength} scan${queueLength === 1 ? "" : "s"} queued`}
      </Text>
    </View>
  );
}
