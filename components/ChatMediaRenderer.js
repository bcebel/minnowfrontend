import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "./WebTorrentMedia";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// Standardized URL helper to ensure we always have a working gateway link
const getPinataUrl = (url) => {
  if (!url) return null;
  if (typeof url !== "string") return url;
  if (url.startsWith("http")) return url;
  if (url.startsWith("Qm") || url.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${url}`;
  }
  if (url.includes("/ipfs/")) {
    return `https://${PINATA_GATEWAY}/ipfs/${url.split("/ipfs/")[1]}`;
  }
  return url;
};

const SimpleVideoPlayer = ({ url }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  return (
    <View style={styles.videoPlayerContainer}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
      />
    </View>
  );
};

export default function ChatMediaRenderer({ message }) {
  // 1. Block raw chunks from rendering
  if (!message || message.fileType === "video_chunk") return null;

  const [isDownloadingChunks, setIsDownloadingChunks] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
    ipfsUrl,
    cid,
  } = message;

  // --- PATH 1: CHUNKED ARCHIVES ---
  if (fileType === "video_chunked") {
    return (
      <TouchableOpacity
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎬</Text>
            <Text style={styles.chunkCount}>
              {message.totalChunks || 0} parts
            </Text>
          </View>
        )}
        <View style={styles.videoOverlay}>
          {isDownloadingChunks ? (
            <ActivityIndicator color="#00ffff" />
          ) : (
            <Text style={styles.playIcon}>▶️</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // --- PATH 2: SWARMABLE MEDIA ---
  // If it's a standard video on native, use SimpleVideoPlayer
  const isVideo =
    fileType === "video" ||
    videoUrl ||
    fileName?.match(/\.(mp4|mov|webm)$/i);
  const isImage =
    fileType === "image" ||
    imageUrl ||
    fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  if (Platform.OS !== "web" && isVideo) {
    return (
      <View style={styles.mediaContainer}>
        <SimpleVideoPlayer url={getPinataUrl(videoUrl || ipfsUrl || cid)} />
      </View>
    );
  }

  // On Web, or for images on Native, we can use WebTorrentMedia or direct Image
  if (magnetLink || cid || ipfsUrl || videoUrl || imageUrl) {
    if (Platform.OS !== "web" && isImage) {
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: getPinataUrl(imageUrl || ipfsUrl || cid) }}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      );
    }

    // Default to WebTorrentMedia for Web (handles P2P)
    const mediaForSwarm = {
      ...message,
      cid: cid || (imageUrl || videoUrl || ipfsUrl)?.split("/ipfs/")[1],
      fallbackUrl: getPinataUrl(videoUrl || imageUrl || ipfsUrl),
      fileName: fileName || (isImage ? "image.jpg" : "video.mp4"),
      fileType: fileType || (isImage ? "image" : "video"),
    };

    return (
      <View style={styles.mediaContainer}>
        <WebTorrentMedia media={mediaForSwarm} isFocused={true} />
      </View>
    );
  }

  // --- PATH 3: GENERAL FILES ---
  if (fileUrl) {
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => Linking.openURL(getPinataUrl(fileUrl))}
      >
        <Text style={styles.fileIcon}>📄</Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "File"}
          </Text>
          <Text style={styles.fileSubtext}>Tap to open</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  mediaContainer: {
    width: "100%",
    minHeight: 220,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    marginVertical: 4,
  },
  videoPlayerContainer: {
    width: "100%",
    height: "100%",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  chunkedVideoContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  videoThumbnail: { width: "100%", height: "100%", opacity: 0.8 },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: { fontSize: 42 },
  videoPlaceholder: { justifyContent: "center", alignItems: "center" },
  fileContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
  },
  fileInfo: { marginLeft: 12, flex: 1 },
  fileName: { color: "#fff", fontWeight: "bold" },
  fileSubtext: { color: "#aaa", fontSize: 12 },
  fileIcon: { fontSize: 24 },
  videoIcon: { fontSize: 32 },
  chunkCount: { color: "#00ffff", fontSize: 11 },
});
