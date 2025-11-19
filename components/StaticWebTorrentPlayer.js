// components/StaticWebTorrentPlayer.js
import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";

export default function StaticWebTorrentPlayer({ video }) {
  const staticHTML = `
    <!-- Your WebTorrent HTML from earlier -->
    <!-- This will be ready for when you can export -->
  `;

  if (Platform.OS === "web") {
    return (
      <iframe
        srcDoc={staticHTML}
        style={{ width: "100%", height: 500, border: "none", borderRadius: 12 }}
        title={`P2P Player - ${video.fileName}`}
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  return (
    <View style={styles.nativeContainer}>
      <Text style={styles.nativeText}>P2P Video: {video.fileName}</Text>
      <Text style={styles.nativeSubtext}>(P2P streaming available on web)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeContainer: {
    padding: 20,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    marginVertical: 8,
  },
  nativeText: { color: "white", fontSize: 16 },
  nativeSubtext: { color: "#888", fontSize: 12 },
});
