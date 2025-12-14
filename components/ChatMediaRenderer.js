import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";

const ChatMediaRenderer = ({ message, onPlayStream }) => {
  // Add error checking
  if (!message) return null;

  if (message.fileType === "live_stream") {
    // ✅ THIS LINE FIXES THE "magnetLink is not defined" ERROR
    const magnetLink = message.magnetLink;

    const handleCopy = () => {
      if (Platform.OS === "web") {
        navigator.clipboard.writeText(magnetLink);
        alert("Magnet link copied!");
      }
    };

    const handlePlay = () => {
      if (magnetLink && onPlayStream) {
        onPlayStream(magnetLink);
      } else {
        Alert.alert("Error", "No magnet link available");
      }
    };

    return (
      <View style={styles.liveStreamCard}>
        <Text style={styles.liveTitle}>🔴 LIVE STREAM</Text>
        <Text style={styles.fileName}>{message.fileName || "Live Stream"}</Text>

        {magnetLink ? (
          <>
            <TouchableOpacity onPress={handleCopy}>
              <Text style={styles.magnetLink} numberOfLines={2}>
                📎 Tap to copy magnet link
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={handlePlay}>
              <Text style={styles.playButtonText}>▶️ Watch Replay</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.noLink}>No magnet link available</Text>
        )}
      </View>
    );
  }

  // ... handle other message types (images, videos, etc.)

  return null;
};

const styles = StyleSheet.create({
  liveStreamCard: {
    backgroundColor: "#ffeded",
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff4444",
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ff4444",
    marginBottom: 4,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  magnetLink: {
    fontSize: 13,
    color: "#0066cc",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: "#0066cc",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  playButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  noLink: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
});

export default ChatMediaRenderer;
