import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const GRADIENTS = [
  ["#FF9A8B", "#FF6B88", "#FF99AC", "#FFB3C1", "#FFCCD5"],
  ["#85FFBD", "#85FFBD", "#FFFB7D", "#F5F2FA", "#85FFBD"],
  ["#8EC5FC", "#E0C3FC", "#FBAB7E", "#F7CE68", "#8EC5FC"],
  ["#FA8BFF", "#2BD2FF", "#2BFF88", "#FFE380", "#FA8BFF"],
  ["#FFE53B", "#FF2525", "#00D2FF", "#3A7BD5", "#FFE53B"],
  ["#4158D0", "#C850C0", "#FFCC70", "#4158D0", "#C850C0"],
  ["#0093E9", "#80D0C7", "#94FFD8", "#0093E9", "#80D0C7"],
  ["#FBDA61", "#FF5ACD", "#90EE90", "#FBDA61", "#FF5ACD"],
];

export default function SimpleGradientCycle() {
  const [gradientIndex, setGradientIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setGradientIndex((current) => (current + 1) % GRADIENTS.length);
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <LinearGradient
      colors={GRADIENTS[gradientIndex]}
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
