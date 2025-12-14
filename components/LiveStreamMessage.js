import React from "react";
import { View, Text, TouchableOpacity, Alert, Platform } from "react-native";

const LiveStreamMessage = ({ message }) => {
  const handlePlayStream = (magnetLink) => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "Stream playback requires a web browser");
      return;
    }

    // Load WebTorrent and play the stream (similar to your existing code)
    // ... (you can reuse the playWithWebTorrent function from earlier)
  };

  return (
    <View style={styles.liveStreamCard}>
      <Text style={styles.liveTitle}>🔴 LIVE STREAM</Text>
      {message.content && <Text style={styles.content}>{message.content}</Text>}
      <Text style={styles.fileName}>{message.fileName}</Text>

      {message.magnetLink && (
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => handlePlayStream(message.magnetLink)}
        >
          <Text style={styles.playButtonText}>▶️ Play Stream</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = {
  liveStreamCard: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    borderLeftWidth: 4,
    borderLeftColor: "#ff4444",
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ff4444",
    marginBottom: 5,
  },
  content: {
    fontSize: 14,
    marginBottom: 5,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  playButton: {
    backgroundColor: "#0066cc",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  playButtonText: {
    color: "white",
    fontWeight: "bold",
  },
};

export default LiveStreamMessage;
