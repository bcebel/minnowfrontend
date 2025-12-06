import React, { useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import SimpleVideoPlayer from "./SimpleVideoPlayer";
import TorrentVideoPlayer from "./TorrentVideoPlayer";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

const ChatMediaRenderer = ({ message }) => {
  // 🟢 ADD NULL CHECK HERE
  if (!message) {
    console.error("❌ ChatMediaRenderer: message is undefined!");
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

  const [showVideoPlayer, setShowVideoPlayer] = useState(false);

  // Helper function
  const getPinataUrl = (url) => {
    if (!url) return null;
    if (url.includes("/ipfs/")) {
      const cid = url.split("/ipfs/")[1];
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    return url;
  };

  // 🎯 Check what type of media we have
  const hasAnyMedia = imageUrl || videoUrl || fileUrl || magnetLink;
  if (!hasAnyMedia) {
    return null;
  }

  // 🎯 1. Images
  if (imageUrl || fileType === "image") {
    const pinataUrl = getPinataUrl(imageUrl);
    if (!pinataUrl) return null;

    return (
      <TouchableOpacity onPress={() => console.log("Open image")}>
        <Image
          source={{ uri: pinataUrl }}
          style={styles.messageImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  // 🎯 2. Regular videos (IPFS)
  if (videoUrl && !magnetLink) {
    const pinataUrl = getPinataUrl(videoUrl);

    if (showVideoPlayer && pinataUrl) {
      return <SimpleVideoPlayer url={pinataUrl} fileName={fileName} />;
    }

    return (
      <TouchableOpacity
        onPress={() => setShowVideoPlayer(true)}
        style={styles.videoThumbnailContainer}
        disabled={!pinataUrl}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎥</Text>
          </View>
        )}
        <View style={styles.videoOverlay}>
          <View style={styles.playButton}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // 🎯 3. Torrent videos (with magnet links)
  if (
    magnetLink &&
    (fileType === "video" || fileType === "video_multistream")
  ) {
    return (
      <TorrentVideoPlayer
        magnetLink={magnetLink}
        fileName={fileName}
        thumbnailUrl={thumbnailUrl}
        isMultistream={fileType === "video_multistream"}
      />
    );
  }

  // 🎯 4. Files
  if (fileUrl) {
    const pinataUrl = getPinataUrl(fileUrl);

    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => {
          if (pinataUrl) {
            Alert.alert("Download", `Download ${fileName || "file"}?`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Download",
                onPress: () => {
                  if (Platform.OS === "web") {
                    window.open(pinataUrl, "_blank");
                  } else {
                    Alert.alert("Info", "Use browser to download file");
                  }
                },
              },
            ]);
          }
        }}
      >
        <Text style={styles.fileIcon}>📄</Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "File"}
          </Text>
          <Text style={styles.fileType}>
            {fileType || "File"} • Tap to download
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  messageImage: {
    width: "100%",
    maxWidth: "90%",
    height: undefined,
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center",
  },
  videoThumbnailContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoThumbnail: {
    width: "100%",
    minHeight: 200,
    aspectRatio: 16 / 9,
  },
  videoPlaceholder: {
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  videoIcon: {
    fontSize: 48,
    color: "#00ffff",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    fontSize: 30,
    color: "#fff",
    marginLeft: 4,
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
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#FFFFFF",
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
