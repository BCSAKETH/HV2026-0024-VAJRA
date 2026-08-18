import { useEffect } from "react";
import { Image, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { useAuthStore } from "../lib/store/auth";
import { useThemeStore } from "../lib/store/theme";

interface HeaderProps {
  onOpenProfile: () => void;
}

export function Header({ onOpenProfile }: HeaderProps) {
  const staff = useAuthStore((s) => s.staff);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.08, { duration: 1500 }), withTiming(1, { duration: 1500 })), -1, true);
    glowOpacity.value = withRepeat(withSequence(withTiming(0.9, { duration: 1500 }), withTiming(0.4, { duration: 1500 })), -1, true);
  }, [scale, glowOpacity]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View className={`flex-row items-center justify-between px-5 py-3 border-b ${isDark ? "bg-navy border-white/10" : "bg-ivory border-navy/10"}`}>
      <View className="flex-row items-center gap-3">
        <View className="relative items-center justify-center">
          <Animated.View
            style={[
              glowStyle,
              {
                position: "absolute",
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: "#E76F2F",
              },
            ]}
          />
          <Animated.View style={logoAnimatedStyle}>
            <Image
              source={require("../assets/icon.png")}
              style={{ width: 34, height: 34, borderRadius: 8 }}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <View>
          <Text className={`font-serif text-lg font-bold ${isDark ? "text-white" : "text-navy"}`}>
            LOCUS
          </Text>
          <Text className={`text-xs font-medium tracking-wider ${isDark ? "text-orange" : "text-indigo"}`}>
            LOGISTICS
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onOpenProfile}
        className={`flex-row items-center gap-2 rounded-full px-3 py-1.5 border ${
          isDark ? "bg-white/10 border-white/20" : "bg-white border-navy/15 shadow-sm"
        }`}
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-indigo">
          <Text className="text-xs font-bold text-white">
            {staff?.name ? staff.name.charAt(0).toUpperCase() : "U"}
          </Text>
        </View>
        <Text className={`text-xs font-semibold ${isDark ? "text-white" : "text-navy"}`} numberOfLines={1}>
          Profile
        </Text>
      </Pressable>
    </View>
  );
}
