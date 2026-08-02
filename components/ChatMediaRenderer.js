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
import WebTorrentMedia from "./WebTorrentMedia";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function ChatMediaRenderer({ message, isSwarmingEnabled }: { message: any; isSwarmingEnabled?: boolean }) {
  if (!message || message.fileType === "video_chunk") return null;

  const [isPlaying, setIsPlaying] = useState(false);

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

  const getPinataUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    if (url.startsWith("Qm") || url.startsWith("baf")) {
      return `https://${PINATA_GATEWAY}/ipfs/${url}`;
    }
    return url;
  };

  const formattedThumbnail = getPinataUrl(thumbnailUrl);

  // --- PATH 2: SWARMABLE MEDIA ---
// --- PATH 2: SWARMABLE MEDIA ---
if (magnetLink || cid || ipfsUrl || videoUrl || imageUrl) {
  const isVideo =
    fileType === "video" ||
    videoUrl ||
    fileName?.match(/\.(mp4|mov|m4v|webm)$/i);

  const mediaForSwarm = {
    ...message,
    cid: cid || (imageUrl || videoUrl || ipfsUrl)?.split("/ipfs/")[1],
    fallbackUrl: getPinataUrl(videoUrl || imageUrl || ipfsUrl),
    fileName: fileName || (fileType === "image" ? "image.jpg" : "video.mp4"),
    fileType: fileType || (isVideo ? "video" : "image"),
  };

  // 1. If it's a video and swarming is DISABLED for this item, render static thumbnail only
  if (isVideo && !isSwarmingEnabled && !isPlaying) {
    return (
      <TouchableOpacity
        style={styles.mediaContainer}
        onPress={() => setIsPlaying(true)}
        activeOpacity={0.85}
      >
        {formattedThumbnail ? (
          <Image
            source={{ uri: formattedThumbnail }}
            style={styles.videoThumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎬</Text>
            <Text style={styles.placeholderLabel}>{fileName || "Video Stream"}</Text>
          </View>
        )}
        <View style={styles.videoOverlay}>
          <Text style={styles.playIcon}>▶️</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // 2. If swarming IS enabled or playing: Keep WebTorrentMedia mounted continuously
  return (
    <View style={styles.mediaContainer}>
      {/* Heavy WebTorrent engine stays mounted in ONE place */}
      <WebTorrentMedia 
        media={mediaForSwarm} 
        isFocused={isPlaying} 
      />

      {/* Thumbnail overlay sits ON TOP until user taps Play */}
      {isVideo && !isPlaying && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => setIsPlaying(true)}
          activeOpacity={0.9}
        >
          {formattedThumbnail ? (
            <Image
              source={{ uri: formattedThumbnail }}
              style={styles.videoThumbnail}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
              <Text style={styles.videoIcon}>🎬</Text>
              <Text style={styles.placeholderLabel}>{fileName || "Video Stream"}</Text>
            </View>
          )}
          <View style={styles.videoOverlay}>
            <Text style={styles.playIcon}>▶️</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
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
