import React, { useState, useEffect } from "react";
import { View, Image, StyleSheet, Platform, TouchableOpacity, Text, Linking, Alert } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "./WebTorrentMedia";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

// --- TYPE DEFINITIONS ---
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

// --- HELPER FUNCTIONS ---
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
          { text: "Copy Link", onPress: () => Alert.alert("Link", ipfsUrl) },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    } catch (error) {
      console.error("File press error:", error);
      Alert.alert("Error", "Failed to handle file: " + error.message);
    }
  };

// --- INTERNAL VIDEO COMPONENT (FIX) ---
// This component isolates the useVideoPlayer hook so it's ONLY called for videos.
const VideoPlayerComponent: React.FC<{ videoUrl: string, initialAspectRatio: number }> = ({ videoUrl, initialAspectRatio }) => {
    const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);

    const player = useVideoPlayer(videoUrl, (player) => {
        player.loop = false;
        // Set aspect ratio once the video is playing and we have its dimensions
        player.events.on('playingChange', (isPlaying) => {
            if (isPlaying) {
                const { width, height } = player.naturalSize;
                if (height > 0) {
                    setAspectRatio(width / height);
                }
            }
        });
    });

    useEffect(() => {
        player.play();
    }, [player]);

    return (
        <VideoView
            player={player}
            style={[styles.media, { aspectRatio }]}
            contentFit="contain"
            allowsExternalPlayback
        />
    );
}

// --- MAIN RENDERER COMPONENT ---
const DynamicMediaRenderer: React.FC<DynamicMediaRendererProps> = ({ media, isFocused }) => {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState(16 / 9);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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
      Image.getSize(mediaUrl, (width, height) => {
          if (height > 0) setAspectRatio(width / height);
        }, (error) => console.error("Failed to get image size:", error)
      );
    }
    if (media.thumbnailUrl) {
        Image.getSize(media.thumbnailUrl, (width, height) => {
            if (height > 0) setThumbnailAspectRatio(width / height);
            }, (error) => console.error("Failed to get thumbnail size:", error)
        );
    }
  }, [mediaUrl, media.fileType, media.thumbnailUrl]);

  // --- RENDER LOGIC ---

  if (media.magnetLink) {
    return <WebTorrentMedia media={media} isFocused={isFocused} />;
  }

  if (!mediaUrl) {
    return null;
  }

  // IMAGE
  if (media.fileType === "image") {
    return (
        <Image source={{ uri: mediaUrl }} style={[styles.media, { aspectRatio }]} resizeMode="contain" />
    );
  }

  // VIDEO
  if (media.fileType === "video") {
    // If playing or no thumbnail, render the isolated video player
    if (isPlaying || !media.thumbnailUrl) {
        return <VideoPlayerComponent videoUrl={mediaUrl} initialAspectRatio={aspectRatio} />;
    }
    // Otherwise, show the thumbnail with a play button
    else {
        return (
            <TouchableOpacity onPress={() => setIsPlaying(true)} style={styles.videoThumbnailContainer}>
                <Image
                    source={{ uri: media.thumbnailUrl }}
                    style={[styles.videoThumbnail, { aspectRatio: thumbnailAspectRatio }]}
                    resizeMode="cover"
                />
                <View style={styles.videoOverlay}>
                    <Text style={styles.playIcon}>▶️</Text>
                </View>
            </TouchableOpacity>
        );
    }
  }

  // FALLBACK FOR OTHER FILE TYPES
  return (
    <TouchableOpacity style={styles.fileContainer} onPress={() => handleFilePress({ ...media, fileUrl: mediaUrl })}>
        <Text style={styles.fileIcon}>📄</Text>
        <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{media.fileName || "File"}</Text>
            <Text style={styles.fileType}>{media.fileType || "File"} • Tap to download</Text>
        </View>
    </TouchableOpacity>
  );
};

// --- STYLES ---
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
    maxWidth: 600,
    alignSelf: "center",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
    color: "#FFF",
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
    color: 'white',
  },
});

export default DynamicMediaRenderer;
