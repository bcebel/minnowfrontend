import React from "react";
import { View, StyleSheet, Animated } from "react-native";

export default function SciFiCorridor() {
  const scanAnim = new Animated.Value(0);

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  return (
    <View style={styles.container}>
      {/* Side panels */}
      <View style={styles.leftPanel} />
      <View style={styles.rightPanel} />

      {/* Scanning lights */}
      <Animated.View
        style={[
          styles.scanLight,
          { transform: [{ translateY: scanTranslate }] },
        ]}
      />

      <View style={styles.content}>{/* Your app content */}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  leftPanel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "30%",
    backgroundColor: "#111",
    borderRightWidth: 2,
    borderRightColor: "#00ffaa",
  },
  rightPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "30%",
    backgroundColor: "#111",
    borderLeftWidth: 2,
    borderLeftColor: "#00ffaa",
  },
  scanLight: {
    position: "absolute",
    left: "30%",
    right: "30%",
    height: 2,
    backgroundColor: "#00ffaa",
    opacity: 0.7,
  },
  content: {
    flex: 1,
  },
});
