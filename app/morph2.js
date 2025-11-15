import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedProps,
  interpolateColor,
} from "react-native-reanimated";

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export default function AdvancedMorphingGradient() {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 10000 }), -1, true);
  }, []);

  const animatedProps = useAnimatedProps(() => {
    const colors = [
      interpolateColor(
        progress.value,
        [0, 0.2, 0.4, 0.6, 0.8, 1],
        ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4ecdc4", "#667eea"]
      ),
      interpolateColor(
        progress.value,
        [0, 0.2, 0.4, 0.6, 0.8, 1],
        ["#764ba2", "#f093fb", "#f5576c", "#4ecdc4", "#667eea", "#764ba2"]
      ),
      interpolateColor(
        progress.value,
        [0, 0.2, 0.4, 0.6, 0.8, 1],
        ["#f093fb", "#f5576c", "#4ecdc4", "#667eea", "#764ba2", "#f093fb"]
      ),
    ];

    return { colors };
  });

  return (
    <AnimatedGradient
      animatedProps={animatedProps}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>{/* Your app content */}</View>
    </AnimatedGradient>
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