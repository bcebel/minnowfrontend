import React from "react";
import { View, StyleSheet, Animated } from "react-native";

export default function CloudSky() {
  const cloudAnim = new Animated.Value(0);

  React.useEffect(() => {
    const animateClouds = () => {
      Animated.loop(
        Animated.timing(cloudAnim, {
          toValue: 1,
          duration: 40000,
          useNativeDriver: true,
        })
      ).start();
    };
    animateClouds();
  }, []);

  const cloud1Translate = cloudAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 500],
  });

  const cloud2Translate = cloudAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-150, 500],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.cloud, { transform: [{ translateX: cloud1Translate }] }]}
      />
      <Animated.View
        style={[
          styles.cloud2,
          { transform: [{ translateX: cloud2Translate }] },
        ]}
      />

      <View style={styles.content}>{/* Your app content */}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#87CEEB",
  },
  cloud: {
    position: "absolute",
    top: 100,
    width: 100,
    height: 40,
    backgroundColor: "white",
    borderRadius: 50,
  },
  cloud2: {
    position: "absolute",
    top: 200,
    width: 150,
    height: 60,
    backgroundColor: "white",
    borderRadius: 50,
  },
  content: {
    flex: 1,
  },
});
