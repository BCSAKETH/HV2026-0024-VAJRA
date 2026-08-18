import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { api, type StaffActivity } from "../lib/api";
import { useThemeStore } from "../lib/store/theme";

export function HistoryScreen() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const [data, setData] = useState<StaffActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchActivity() {
    setError(null);
    try {
      const res = await api.getMyActivity();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity log.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchActivity();
  }, []);

  function onRefresh() {
    setRefreshing(true);
    fetchActivity();
  }

  if (loading) {
    return (
      <View className={`flex-1 items-center justify-center ${isDark ? "bg-navy" : "bg-ivory"}`}>
        <ActivityIndicator color="#4F46E5" size="large" />
        <Text className={`mt-3 text-xs ${isDark ? "text-white/60" : "text-navy/60"}`}>
          Fetching server activity log…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className={`flex-1 ${isDark ? "bg-navy" : "bg-ivory"}`}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <Text className={`font-serif text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
          Activity Log
        </Text>
        <Pressable onPress={fetchActivity} className="rounded-lg bg-indigo/10 px-3 py-1.5">
          <Text className="text-xs font-semibold text-indigo">Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text className="mb-4 text-brick">{error}</Text> : null}

      {/* Summary Stat Cards */}
      <View className="mb-6 flex-row gap-3">
        <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
          <Text className="text-xs uppercase tracking-wider text-sage">Today's Scans</Text>
          <Text className={`mt-1 text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
            {data?.stats.today_count ?? 0}
          </Text>
        </View>

        <View className={`flex-1 rounded-2xl p-4 border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"}`}>
          <Text className="text-xs uppercase tracking-wider text-orange">Total History</Text>
          <Text className={`mt-1 text-2xl font-bold ${isDark ? "text-white" : "text-navy"}`}>
            {data?.stats.total_count ?? 0}
          </Text>
        </View>
      </View>

      {/* Timeline List */}
      <Text className={`mb-3 text-sm font-semibold uppercase tracking-wider ${isDark ? "text-white/60" : "text-navy/60"}`}>
        Recent Events
      </Text>

      {data?.events.length === 0 ? (
        <View className={`rounded-2xl p-6 items-center border ${isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10"}`}>
          <Text className={`text-center ${isDark ? "text-white/60" : "text-navy/60"}`}>
            No tracking events recorded for your account yet. Use the camera to scan parcels or bags.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {data?.events.map((ev) => {
            const dateStr = new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <View
                key={ev.id}
                className={`flex-row items-center justify-between rounded-xl p-4 border ${
                  isDark ? "bg-white/5 border-white/10" : "bg-white border-navy/10 shadow-sm"
                }`}
              >
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-md bg-indigo/10 px-2 py-0.5">
                      <Text className="text-xs font-bold text-indigo">{ev.event_type}</Text>
                    </View>
                    <Text className={`font-mono text-xs font-semibold ${isDark ? "text-white" : "text-navy"}`}>
                      {ev.tracking_id}
                    </Text>
                  </View>
                  <Text className={`mt-1 text-xs ${isDark ? "text-white/50" : "text-navy/50"}`}>
                    Recorded in Postgres • Event ID {ev.id.slice(0, 8)}…
                  </Text>
                </View>
                <Text className={`font-mono text-xs font-semibold ${isDark ? "text-sage" : "text-navy/60"}`}>
                  {dateStr}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
