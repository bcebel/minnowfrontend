import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function GradientSky() {
  return (
    <LinearGradient
      colors={["#ff9a9e", "#fad0c4", "#a1c4fd", "#c2e9fb", "#d4fc79"]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Your app content */}
      <View style={styles.content}>{/* Your components here */}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    // Your content styles
  },
});
