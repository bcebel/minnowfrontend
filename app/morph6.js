import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const COLOR_PAIRS = [
  ["#C9C7C3", "#375C91"],
  ["#C9C7C3", "#C9C7C3"],
  ["#C9C7C3", "#F3EFE0"],
  ["#C9C7C3", "#ECA78D"],
  ["#C9C7C3", "#ACBAB6"],
  ["#C9C7C3", "#C9C7C3"],
  ["#C9C7C3", "#DCD3CD"],
  ["#C9C7C3", "#415A4E"],
  ["#C9C7C3", "#ECA78D"],
  ["#C9C7C3", "#ECA78D"],
  ["#C9C7C3", "#D4A6A6"],
  ["#C9C7C3", "#D4A6A6"],
];

export default function MinimalMorph() {
  const [pairIndex, setPairIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPairIndex((current) => (current + 1) % COLOR_PAIRS.length);
    }, 8000); 

    return () => clearInterval(interval);
  }, []);

  return (
    <LinearGradient
      colors={COLOR_PAIRS[pairIndex]}
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