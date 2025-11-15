import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

function interpolateColor(progress, color1, color2) {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * progress);
  const g = Math.round(g1 + (g2 - g1) * progress);
  const b = Math.round(b1 + (b2 - b1) * progress);

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export default function UltraSmoothGradient() {
  const [progress, setProgress] = useState(0);
  const [fromColors, setFromColors] = useState(["#667eea", "#764ba2"]);
  const [toColors, setToColors] = useState(["#f093fb", "#f5576c"]);

  useEffect(() => {
    let animationFrame;
    let startTime;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const newProgress = (elapsed % 4000) / 4000; // 4 second cycle

      setProgress(newProgress);

      if (newProgress > 0.99) {
        // Cycle to next color set
        setFromColors(toColors);
        setToColors([
          `#${Math.floor(Math.random() * 16777215).toString(16)}`,
          `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        ]);
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [toColors]);

  const currentColors = [
    interpolateColor(progress, fromColors[0], toColors[0]),
    interpolateColor(progress, fromColors[1], toColors[1]),
  ];

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