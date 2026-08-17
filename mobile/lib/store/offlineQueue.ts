import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type BagEvent, type SyncResult, api } from "../api";

interface OfflineQueueState {
  queue: BagEvent[];
  lastSyncResults: SyncResult[];
  syncing: boolean;
  enqueue: (event: BagEvent) => void;
  flush: () => Promise<SyncResult[]>;
}

// The Split-Brain Fix: DEPART/ARRIVE actions get pushed here the instant
// they happen on-device (queue-first, not "try live then fall back") so the
// worker's flow never stalls waiting on a network round-trip. flush() is
// called whenever connectivity returns.
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      lastSyncResults: [],
      syncing: false,

      enqueue: (event) => set((s) => ({ queue: [...s.queue, event] })),

      flush: async () => {
        const { queue, syncing } = get();
        if (syncing || queue.length === 0) return [];

        set({ syncing: true });
        try {
          const results = await api.syncBagEvents(queue);
          const resolvedIds = new Set(results.map((r) => r.client_event_id));
          set((s) => ({
            queue: s.queue.filter((e) => !resolvedIds.has(e.clientEventId)),
            lastSyncResults: results,
          }));
          return results;
        } catch {
          // Backend still unreachable — leave the queue exactly as it was
          // and try again on the next reconnect.
          return [];
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: "locus-offline-bag-events",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
