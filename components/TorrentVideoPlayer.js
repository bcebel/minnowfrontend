import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import SimpleVideoPlayer from "./SimpleVideoPlayer";

const TorrentVideoPlayer = ({
  magnetLink,
  fileName,
  thumbnailUrl,
  isMultistream,
}) => {
  const [streamUrl, setStreamUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      // Cleanup blob URLs
      if (streamUrl && streamUrl.startsWith("blob:")) {
        URL.revokeObjectURL(streamUrl);
      }
    };
  }, [streamUrl]);

  const loadTorrent = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "P2P playback requires web browser");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Ensure WebTorrent is loaded
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      // Use global client if available, otherwise create one
      const client = window.globalWebTorrentClient || new window.WebTorrent();

      client.add(magnetLink, (torrent) => {
        console.log("✅ Torrent loaded:", torrent.name);
        console.log(
          "📁 Files:",
          torrent.files.map((f) => f.name)
        );

        // Find video file
        const videoFile = torrent.files.find(
          (f) =>
            f.name.endsWith(".mp4") ||
            f.name.endsWith(".webm") ||
            f.name.endsWith(".mov") ||
            f.type?.includes("video")
        );

        if (!videoFile && torrent.files.length > 0) {
          // Try first file if no video extension found
          const firstFile = torrent.files[0];
          if (firstFile.length > 0) {
            videoFile = firstFile;
          }
        }

        if (videoFile) {
          videoFile.getBlobURL((err, url) => {
            if (err) {
              console.error("❌ Blob URL error:", err);
              setError("Could not load video");
              setIsLoading(false);
              return;
            }

            console.log("🎬 Stream URL created");
            setStreamUrl(url);
            setIsLoading(false);
          });
        } else {
          setError("No playable video found in torrent");
          setIsLoading(false);
        }
      });

      // Handle errors
      client.on("error", (err) => {
        console.error("❌ WebTorrent error:", err);
        setError("Failed to load torrent: " + err.message);
        setIsLoading(false);
      });
    } catch (error) {
      console.error("❌ Torrent load error:", error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  // If we have a stream URL, show the player
  if (streamUrl) {
    return (
      <SimpleVideoPlayer url={streamUrl} fileName={fileName} isTorrent={true} />
    );
  }

  // Otherwise show thumbnail with play button
  return (
    <TouchableOpacity
      onPress={loadTorrent}
      style={styles.container}
      disabled={isLoading || error}
    >
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>
            {isMultistream ? "🌐" : "🎬"}
          </Text>
          <Text style={styles.placeholderText}>
            {isMultistream ? "Multistream Video" : "P2P Video"}
          </Text>
        </View>
      )}

      <View style={styles.overlay}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00ffff" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadTorrent} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.playContainer}>
            <View style={styles.playButton}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
            {isMultistream && (
              <Text style={styles.multistreamBadge}>MULTISTREAM</Text>
            )}
          </View>
        )}
      </View>

      {fileName && (
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#1a1a1a",
  },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 48,
    color: "#00ffff",
    marginBottom: 8,
  },
  placeholderText: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 8,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 16,
    borderRadius: 8,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  retryText: {
    color: "#000",
    fontWeight: "bold",
  },
  playContainer: {
    alignItems: "center",
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(0, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  playIcon: {
    fontSize: 32,
    color: "#fff",
    marginLeft: 4,
  },
  multistreamBadge: {
    color: "#00ffff",
    fontSize: 10,
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
  },
  fileName: {
    position: "absolute",
    bottom: 8,
    left: 8,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    maxWidth: "80%",
  },
});

export default TorrentVideoPlayer;
