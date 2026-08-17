import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

// isInternetReachable can briefly be null right after a change event settles
// — treat that as "probably online" rather than flashing the offline banner
// on every transition.
function isOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setOnline(isOnline(state)));
    NetInfo.fetch().then((state) => setOnline(isOnline(state)));
    return unsubscribe;
  }, []);

  return online;
}
