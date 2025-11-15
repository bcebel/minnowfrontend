import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const DIRECTIONS = [
  { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
  { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
  { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
];

const COLORS = ["#667eea", "#764ba2", "#f093fb", "#f5576c"];

export default function DirectionMorphingGradient() {
  const [directionIndex, setDirectionIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDirectionIndex((current) => (current + 1) % DIRECTIONS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const currentDirection = DIRECTIONS[directionIndex];

  return (
    <LinearGradient
      colors={COLORS}
      style={styles.container}
      start={currentDirection.start}
      end={currentDirection.end}
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