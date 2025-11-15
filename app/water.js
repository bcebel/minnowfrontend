import React from "react";
import { View, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function WaterScene() {
  const waveAnim = new Animated.Value(0);

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const waveTranslate = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -200],
  });

  return (
    <LinearGradient colors={["#1a2980", "#26d0ce"]} style={styles.container}>
      <Animated.View
        style={[styles.wave, { transform: [{ translateX: waveTranslate }] }]}
      />

      <View style={styles.content}>{/* Your app content */}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wave: {
    position: "absolute",
    bottom: 0,
    width: "200%",
    height: 100,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 50,
  },
  content: {
    flex: 1,
  },
});

