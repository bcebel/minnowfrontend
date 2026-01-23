import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import WebTorrentMedia from "./WebTorrentMedia";
import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

function ChatMediaRenderer({ message }) {
  // Filter out video chunks - they're handled separately
  if (message.fileType === "video_chunk") {
    return null;
  }

  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
  } = message;

  if (!message) return null;

  const [isDownloadingChunks, setIsDownloadingChunks] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState(null);

  // Get the correct IPFS URL
  const getPinataUrl = (url) => {
    if (!url) return null;

    // If it's already a full URL, return it
    if (url.startsWith("http") || url.startsWith("https")) {
      return url;
    }

    // If it's just a CID, construct the URL
    if (url.startsWith("Qm") || url.startsWith("baf")) {
      return `https://${PINATA_GATEWAY}/ipfs/${url}`;
    }

    // If it contains /ipfs/, extract the CID
    if (url.includes("/ipfs/")) {
      const cid = url.split("/ipfs/")[1];
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }

    return url;
  };

  console.log("Media renderer received:", {
    imageUrl,
    videoUrl,
    fileType,
    thumbnailUrl,
    getPinataUrl: getPinataUrl(imageUrl || videoUrl),
  });

  // Handle file press for downloads
  const handleFilePress = async (message) => {
    try {
      const url = getPinataUrl(
        message.fileUrl || message.videoUrl || message.imageUrl
      );

      if (Platform.OS === "web") {
        window.open(url, "_blank");
      } else {
        Alert.alert(message.fileName || "File", "What would you like to do?", [
          {
            text: "Open in Browser",
            onPress: () => Linking.openURL(url),
          },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    } catch (error) {
      console.error("File press error:", error);
      Alert.alert("Error", "Failed to open file");
    }
  };

  // RENDER LOGIC

  // 1. CHUNKED VIDEO
  if (message.fileType === "video_chunked") {
    if (chunkedVideoUrl) {
      // For chunked videos, we need a video player
      return (
        <TouchableOpacity
          style={styles.chunkedVideoContainer}
          onPress={() => console.log("Play chunked video")}
        >
          <Image
            source={{ uri: message.thumbnailUrl }}
            style={styles.videoThumbnail}
            contentFit="cover"
          />
          <View style={styles.videoOverlay}>
            <Text style={styles.playIcon}>▶️</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {message.thumbnailUrl ? (
          <Image
            source={{ uri: message.thumbnailUrl }}
            style={styles.videoThumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎬</Text>
            <Text style={styles.chunkCount}>{message.totalChunks} parts</Text>
          </View>
        )}
        {isDownloadingChunks && (
          <View style={styles.downloadOverlay}>
            <ActivityIndicator size="large" color="#00ffff" />
            <Text style={styles.progressText}>{downloadProgress}%</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // 2. REGULAR MEDIA - Use WebTorrentMedia for everything
  // WebTorrentMedia can handle both images and videos with or without magnet links
  // 2. REGULAR MEDIA - Fix the CID extraction
  if (imageUrl || videoUrl || magnetLink || message.ipfsUrl || message.cid) {
    // Prepare media object for WebTorrentMedia
    const mediaForWebTorrent = {
      ...message,
      // FIX: Check the actual DB field 'ipfsUrl' or the direct 'cid' field first
      cid: (() => {
        if (message.cid) return message.cid;
        const targetUrl = imageUrl || videoUrl || message.ipfsUrl;
        if (targetUrl?.includes("/ipfs/")) return targetUrl.split("/ipfs/")[1];
        return null;
      })(),
      // Ensure WebTorrentMedia has a URL to fallback to if P2P fails
      imageUrl: getPinataUrl(
        imageUrl || (fileType === "image" ? message.ipfsUrl : null)
      ),
      videoUrl: getPinataUrl(
        videoUrl || (fileType === "video" ? message.ipfsUrl : null)
      ),
      magnetLink: magnetLink || null,
      fileName: fileName || "Media",
      fileType:
        fileType || (imageUrl || fileType === "image" ? "image" : "video"),
    };

    return (
      <View style={styles.mediaContainer}>
        <WebTorrentMedia media={mediaForWebTorrent} isFocused={true} />
      </View>
    );
  }

  if (fileUrl) {
    const pinataUrl = getPinataUrl(fileUrl);
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => handleFilePress({ ...message, fileUrl: pinataUrl })}
      >
        <Text style={styles.fileIcon}>📄</Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "File"}
          </Text>
          <Text style={styles.fileType}>
            {fileType || "File"} • Tap to open
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  mediaContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  chunkedVideoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#130720",
    position: "relative",
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  videoThumbnail: {
    width: "100%",
    minHeight: 200,
    aspectRatio: 16 / 9,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playIcon: {
    fontSize: 40,
    color: "#fff",
  },
  videoPlaceholder: {
    backgroundColor: "#1C0A2E",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
  videoIcon: {
    fontSize: 48,
    color: "#00ffff",
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  chunkCount: {
    color: "#fff",
    fontSize: 12,
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  progressText: {
    color: "#00ffff",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "bold",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
    color: "#00ffff",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#F5F2FA",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 14,
  },
});

export default ChatMediaRenderer;
