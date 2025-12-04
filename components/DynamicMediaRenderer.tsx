import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableOpacity,
  Text,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "./WebTorrentMedia";

const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Media {
  fileUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  ipfsUrl?: string;
  fileName?: string;
  fileType?: string;
  thumbnailUrl?: string;
  magnetLink?: string;
  width?: number; // Optional: pre-known dimensions
  height?: number; // Optional: pre-known dimensions
}

interface DynamicMediaRendererProps {
  media: Media;
  isFocused: boolean;
  maxWidth?: number; // Maximum width for the media
}

const handleFilePress = async (media: Media) => {
  try {
    const url =
      media.fileUrl || media.imageUrl || media.videoUrl || media.ipfsUrl;
    if (!url) {
      Alert.alert("Error", "No file URL available");
      return;
    }

    const ipfsUrl = url.replace("ipfs.filebase.io", PINATA_GATEWAY);

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
            if (Platform.OS === "web" && navigator.clipboard) {
              await navigator.clipboard.writeText(ipfsUrl);
              Alert.alert("Success", "Link copied to clipboard!");
            } else {
              Alert.alert("Link", ipfsUrl);
            }
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

const DynamicMediaRenderer: React.FC<DynamicMediaRendererProps> = ({
  media,
  isFocused,
  maxWidth = SCREEN_WIDTH * 0.9, // 90% of screen width by default
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState<
    number | null
  >(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  const player = useVideoPlayer(mediaUrl || "", (player) => {
    player.loop = false;
    player.muted = true; // Start muted for auto-play compliance
  });

  // Get the actual URL from IPFS
  useEffect(() => {
    const getPinataUrl = (url?: string) => {
      if (!url) return null;
      if (url.includes("/ipfs/")) {
        const cid = url.split("/ipfs/")[1];
        return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
      }
      return url;
    };

    const url = getPinataUrl(
      media.imageUrl || media.videoUrl || media.fileUrl || media.ipfsUrl
    );
    setMediaUrl(url);

    // Reset states when media changes
    setImageError(false);
    setIsPlaying(false);

    // If we have pre-known dimensions, use them immediately
    if (media.width && media.height) {
      setAspectRatio(media.width / media.height);
    }
    if (media.thumbnailUrl && media.fileType === "video") {
      // Thumbnails are always 320x240 from your generation
      setThumbnailAspectRatio(320 / 240); // 4:3
    }
  }, [media]);

  // Get image dimensions when URL is available
  useEffect(() => {
    if (!mediaUrl || media.fileType !== "image" || imageError) return;

    setIsLoading(true);
    Image.getSize(
      mediaUrl,
      (width, height) => {
        if (height > 0) {
          setAspectRatio(width / height);
        } else {
          setAspectRatio(4 / 3); // Fallback
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("Failed to get image size:", error);
        setImageError(true);
        setAspectRatio(4 / 3); // Fallback to 4:3
        setIsLoading(false);
      }
    );
  }, [mediaUrl, media.fileType, imageError]);

  // Handle thumbnail aspect ratio
  useEffect(() => {
    if (!media.thumbnailUrl || thumbnailAspectRatio !== null) return;

    Image.getSize(
      media.thumbnailUrl,
      (width, height) => {
        if (height > 0) {
          setThumbnailAspectRatio(width / height);
        } else {
          setThumbnailAspectRatio(4 / 3); // Fallback
        }
      },
      (error) => {
        console.error("Failed to get thumbnail size:", error);
        setThumbnailAspectRatio(4 / 3); // Fallback
      }
    );
  }, [media.thumbnailUrl, thumbnailAspectRatio]);

  // Calculate actual dimensions with constraints
  const calculateDimensions = (targetAspectRatio: number | null) => {
    if (!targetAspectRatio)
      return { width: maxWidth, height: maxWidth * (3 / 4) };

    const calculatedHeight = maxWidth / targetAspectRatio;
    const maxHeight = SCREEN_WIDTH; // Don't exceed screen height

    return {
      width: maxWidth,
      height: Math.min(calculatedHeight, maxHeight),
      aspectRatio: targetAspectRatio,
    };
  };

  const imageDimensions = calculateDimensions(aspectRatio);
  const thumbnailDimensions = calculateDimensions(
    thumbnailAspectRatio || 4 / 3
  );

  // Handle magnet links with WebTorrent
  if (
    media.magnetLink &&
    (media.fileType === "image" || media.fileType === "video")
  ) {
    return (
      <View style={[styles.container, { maxWidth }]}>
        <WebTorrentMedia media={media} isFocused={isFocused} />
      </View>
    );
  }

  if (!mediaUrl) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: maxWidth, height: maxWidth * (3 / 4) },
        ]}
      >
        <ActivityIndicator size="large" color="#00ffff" />
      </View>
    );
  }

  // Handle images
  if (media.fileType === "image") {
    if (isLoading) {
      return (
        <View style={[styles.placeholder, imageDimensions]}>
          <ActivityIndicator size="large" color="#00ffff" />
        </View>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => console.log("Open full screen image")}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: mediaUrl }}
          style={[styles.media, imageDimensions]}
          resizeMode="contain"
          onError={() => setImageError(true)}
        />
        {media.fileName && (
          <Text style={styles.fileName} numberOfLines={1}>
            {media.fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // Handle videos
  if (media.fileType === "video") {
    // Show video player when playing
    if (isPlaying) {
      return (
        <View style={[styles.videoContainer, { maxWidth }]}>
          <VideoView
            player={player}
            style={[styles.videoPlayer, imageDimensions]}
            contentFit="contain"
            allowsExternalPlayback
            showsControls
          />
          {media.fileName && (
            <Text style={styles.videoFileName} numberOfLines={1}>
              {media.fileName}
            </Text>
          )}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setIsPlaying(false)}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Show thumbnail when not playing
    return (
      <TouchableOpacity
        onPress={() => setIsPlaying(true)}
        activeOpacity={0.8}
        style={[styles.videoThumbnailContainer, { maxWidth }]}
      >
        {media.thumbnailUrl ? (
          <Image
            source={{ uri: media.thumbnailUrl }}
            style={[styles.videoThumbnail, thumbnailDimensions]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoPlaceholder, thumbnailDimensions]}>
            <Text style={styles.videoIcon}>🎥</Text>
          </View>
        )}
        <View style={styles.videoOverlay}>
          <View style={styles.playButton}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
        {media.fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {media.fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // Handle other file types
  return (
    <TouchableOpacity
      style={[styles.fileContainer, { maxWidth }]}
      onPress={() => handleFilePress({ ...media, fileUrl: mediaUrl })}
      activeOpacity={0.7}
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
    alignSelf: "center",
    marginVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
  },
  media: {
    borderRadius: 12,
    backgroundColor: "#000",
  },
  videoContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  videoPlayer: {
    backgroundColor: "#000",
  },
  videoThumbnailContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  videoThumbnail: {
    backgroundColor: "#000",
  },
  videoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  videoIcon: {
    fontSize: 48,
    opacity: 0.5,
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
    backgroundColor: "rgba(0, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    fontSize: 28,
    color: "#000",
    marginLeft: 4, // Offset for play triangle
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  fileName: {
    color: "#888",
    fontSize: 12,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    textAlign: "center",
  },
  videoFileName: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    color: "#ccc",
    fontSize: 12,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    textAlign: "center",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#333333",
    alignSelf: "center",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
    color: "#00ffff",
  },
  fileInfo: {
    flex: 1,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 14,
  },
});

export default DynamicMediaRenderer;
