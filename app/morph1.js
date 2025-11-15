import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Color palettes to cycle through
const COLOR_SCHEMES = [
  ["#ff6b6b", "#ffa726", "#ffee58", "#4ecdc4", "#45b7d1"],
  ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#b9a0ff"],
  ["#a8edea", "#fed6e3", "#a1c4fd", "#c2e9fb", "#d4fc79"],
  ["#ffecd2", "#fcb69f", "#a1c4fd", "#c2e9fb", "#ff9a9e"],
  ["#d299c2", "#fef9d7", "#89f7fe", "#66a6ff", "#c2e9fb"],
];

export default function MorphingGradient() {
  const colorIndex = useRef(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 8000 }), -1, true);
  }, []);

  const currentColors = COLOR_SCHEMES[colorIndex.current];
  const nextColors =
    COLOR_SCHEMES[(colorIndex.current + 1) % COLOR_SCHEMES.length];

  return (
    <LinearGradient
      colors={currentColors}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>{/* Your app content */}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
