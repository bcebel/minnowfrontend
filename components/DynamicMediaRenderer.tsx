import React, { useState, useEffect } from "react";
import { View, Image, StyleSheet, Dimensions, Platform, TouchableOpacity, Text, Linking, Alert } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "./WebTorrentMedia";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

interface Media {
    fileUrl?: string;
    imageUrl?: string;
    videoUrl?: string;
    ipfsUrl?: string;
    fileName?: string;
    fileType?: string;
    thumbnailUrl?: string;
    magnetLink?: string;
}

interface DynamicMediaRendererProps {
    media: Media;
    isFocused: boolean;
}

const handleFilePress = async (media: Media) => {
    try {
      if (!media.fileUrl) {
        Alert.alert("Error", "No file URL available");
        return;
      }

      const ipfsUrl = media.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);

      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = ipfsUrl;
        link.download = media.fileName || "download";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert(
          "Download Started",
          `${media.fileName || "File"} download started in new tab.`
        );
      } else {
        Alert.alert(media.fileName || "File", "What would you like to do?", [
          {
            text: "Open in Browser",
            onPress: () =>
              Linking.openURL(ipfsUrl).catch((err) => {
                console.error("Open URL error:", err);
                Alert.alert("Error", "Could not open file");
              }),
          },
          {
            text: "Copy Link",
            onPress: async () => {
                // Clipboard API is not available in React Native, so we'll just show the link
                Alert.alert("Link", ipfsUrl);
            },
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ]);
      }
    } catch (error) {
      console.error("File press error:", error);
      Alert.alert("Error", "Failed to handle file: " + error.message);
    }
  };

const DynamicMediaRenderer: React.FC<DynamicMediaRendererProps> = ({ media, isFocused }) => {
  const [aspectRatio, setAspectRatio] = useState(16 / 9); // Default aspect ratio
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState(16 / 9); // Default aspect ratio
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useVideoPlayer(mediaUrl || "", (player) => {
    player.loop = false;
    player.events.on('playingChange', (isPlaying) => {
        if (isPlaying) {
            const { width, height } = player.naturalSize;
            if (height > 0) {
                setAspectRatio(width / height);
            }
        }
    })
  });

  useEffect(() => {
    const getPinataUrl = (url?: string) => {
        if (!url) return null;
        if (url.includes("/ipfs/")) {
            const cid = url.split("/ipfs/")[1];
            return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
        }
        return url;
    };

    const url = getPinataUrl(media.imageUrl || media.videoUrl || media.fileUrl || media.ipfsUrl);
    setMediaUrl(url);
  }, [media]);

  useEffect(() => {
    if (mediaUrl && media.fileType === "image") {
      Image.getSize(
        mediaUrl,
        (width, height) => {
          if (height > 0) {
            setAspectRatio(width / height);
          }
        },
        (error) => {
          console.error("Failed to get image size:", error);
        }
      );
    }
    if (media.thumbnailUrl) {
        Image.getSize(
            media.thumbnailUrl,
            (width, height) => {
                if (height > 0) {
                    setThumbnailAspectRatio(width / height);
                }
            },
            (error) => {
                console.error("Failed to get thumbnail size:", error);
            }
        );
    }
  }, [mediaUrl, media.fileType, media.thumbnailUrl]);

  if (media.magnetLink) {
    return (
      <WebTorrentMedia media={media} isFocused={isFocused} />
    );
  }

  if (!mediaUrl) {
    return null;
  }

  if (media.fileType === "image") {
    return (
        <Image
          source={{ uri: mediaUrl }}
          style={[styles.media, { aspectRatio }]}
          resizeMode="contain"
        />
    );
    } else if (media.fileType === "video") {
        if (isPlaying || !media.thumbnailUrl) {
            return (
                <VideoView
                    player={player}
                    style={[styles.media, { aspectRatio }]}
                    contentFit="contain"
                    allowsExternalPlayback
                />
            );
        } else {
            return (
                <TouchableOpacity
                    onPress={() => setIsPlaying(true)}
                    style={styles.videoThumbnailContainer}
                >
                    <Image
                    source={{ uri: media.thumbnailUrl }}
                    style={[styles.videoThumbnail, {aspectRatio: thumbnailAspectRatio}]}
                    resizeMode="cover"
                    />
                    <View style={styles.videoOverlay}>
                    <Text style={styles.playIcon}>▶️</Text>
                    </View>
                </TouchableOpacity>
            )
        }
    }

    // Fallback for other file types
    return (
        <TouchableOpacity
            style={styles.fileContainer}
            onPress={() => handleFilePress({ ...media, fileUrl: mediaUrl })}
        >
            <Text style={styles.fileIcon}>📄</Text>
            <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>
                {media.fileName || "File"}
            </Text>
            <Text style={styles.fileType}>
                {media.fileType || "File"} • Tap to download
            </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  media: {
    width: "100%",
    height: undefined,
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
    maxWidth: 600, // Limit file container width
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
  videoThumbnailContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoThumbnail: {
    width: "100%",
    height: undefined,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playIcon: {
    fontSize: 40,
  },
});

export default DynamicMediaRenderer;
