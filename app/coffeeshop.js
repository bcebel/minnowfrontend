import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function CoffeeShop() {
  return (
    <LinearGradient
      colors={["#8B4513", "#D2691E", "#BC8F8F"]}
      style={styles.container}
    >
      {/* Wood texture overlay */}
      <View style={styles.woodTexture} />

      {/* Counter */}
      <View style={styles.counter} />

      {/* Coffee cups */}
      <View style={styles.coffeeCup} />
      <View style={styles.coffeeCup2} />

      <View style={styles.content}>{/* Your app content */}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  woodTexture: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  counter: {
    position: "absolute",
    bottom: "20%",
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "#5D4037",
  },
  coffeeCup: {
    position: "absolute",
    bottom: "25%",
    left: 100,
    width: 40,
    height: 30,
    backgroundColor: "#8B4513",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  coffeeCup2: {
    position: "absolute",
    bottom: "25%",
    right: 100,
    width: 40,
    height: 30,
    backgroundColor: "#8B4513",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    flex: 1,
  },
});
