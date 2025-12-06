import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, Text, Platform } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

const SimpleVideoPlayer = ({ url, fileName, isTorrent = false }) => {
  console.log(
    "🎬 SimpleVideoPlayer rendering with URL:",
    url?.substring(0, 50)
  );

  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
    player.muted = false;
  });

  const [hasError, setHasError] = useState(false);

  // ✅ FIXED: Safe autoplay with error handling
  useEffect(() => {
    if (player && url && !hasError) {
      console.log("🎬 SimpleVideoPlayer: Attempting to auto-play video:", url);

      // Check if player.play exists and is a function
      if (player && typeof player.play === "function") {
        const playPromise = player.play();

        // Only call .catch() if it returns a Promise
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            console.log("Auto-play prevented:", err);
            setHasError(true);
          });
        } else {
          console.log("⚠️ player.play() didn't return a Promise");
        }
      } else {
        console.log("⚠️ player.play is not a function", player);
      }
    }

    // Cleanup function for blob URLs
    return () => {
      if (isTorrent && url && url.startsWith("blob:")) {
        console.log("🧹 Cleaning up blob URL");
        URL.revokeObjectURL(url);
      }
    };
  }, [player, url, isTorrent, hasError]);

  // Handle play on click (for autoplay restrictions)
  const handlePlay = () => {
    if (player && typeof player.play === "function") {
      const playPromise = player.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.log("Play failed:", err);
        });
      }
    }
  };

  if (!url) {
    return (
      <View style={styles.errorContainer}>
        <Text>No video URL provided</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text>Video playback error. Try tapping to play.</Text>
        <TouchableOpacity onPress={handlePlay} style={styles.retryButton}>
          <Text style={styles.retryText}>Tap to Play</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={handlePlay}
      activeOpacity={0.9}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
        nativeControls={Platform.OS !== "web"}
      />
      {fileName && (
        <Text style={styles.videoCaption} numberOfLines={1}>
          {fileName} {isTorrent && "🔗"}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = {
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    width: "100%",
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  videoCaption: {
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  errorContainer: {
    padding: 20,
    backgroundColor: "#333",
    borderRadius: 8,
    alignItems: "center",
  },
  retryButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#00ffff",
    borderRadius: 8,
  },
  retryText: {
    color: "#000",
    fontWeight: "bold",
  },
};

export default SimpleVideoPlayer;
