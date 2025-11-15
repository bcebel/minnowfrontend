import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function CityScene() {
  return (
    <LinearGradient colors={["#1a2980", "#26d0ce"]} style={styles.container}>
      {/* Buildings */}
      <View style={styles.building1} />
      <View style={styles.building2} />
      <View style={styles.building3} />

      {/* Windows */}
      <View style={styles.window1} />
      <View style={styles.window2} />
      <View style={styles.window3} />

      <View style={styles.content}>{/* Your app content */}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  building1: {
    position: "absolute",
    bottom: 0,
    left: 50,
    width: 80,
    height: 200,
    backgroundColor: "#2c3e50",
    transform: [{ skewX: "-20deg" }, { perspective: 1000 }],
  },
  building2: {
    position: "absolute",
    bottom: 0,
    left: 150,
    width: 100,
    height: 300,
    backgroundColor: "#34495e",
    transform: [{ skewX: "-20deg" }, { perspective: 1000 }],
  },
  window1: {
    position: "absolute",
    bottom: 50,
    left: 70,
    width: 15,
    height: 20,
    backgroundColor: "#f1c40f",
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
});
