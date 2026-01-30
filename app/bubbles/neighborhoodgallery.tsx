import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { gql, useQuery } from "@apollo/client";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "../../components/WebTorrentMedia"; // Import from your chat
import AdMessage from "../../components/AdMessage"; // New Ad component
// GraphQL Query
const GET_NEIGHBORHOOD_GALLERY = gql`
  query GetNeighborhoodGallery($neighborhoodId: ID!) {
    getNeighborhoodGallery(neighborhoodId: $neighborhoodId) {
      videos {
        id
        title
        fileName
        fileType
        cid
        ipfsUrl
        magnetLink
        user {
          username
        }
        neighborhood {
          name
        }
        createdAt
      }
      images {
        id
        title
        fileName
        fileType
        cid
        ipfsUrl
        magnetLink
        user {
          username
        }
        neighborhood {
          name
        }
        createdAt
      }
      totalCount
    }
  }
`;

const GET_RANDOM_AFFILIATE_LINK = gql`
  query GetRandomAffiliateLink {
    randomAffiliateLink {
      id
      url
      title
      imageUrl
      description
      clicks
    }
  }
`;

// Helper function
const getFileType = (fileName: string) => {
  if (!fileName) return "unknown";
  const lower = fileName.toLowerCase();

  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".webm")
  ) {
    return "video";
  }
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".gif")
  ) {
    return "image";
  }
  return "unknown";
};

// Simple Video Player Component - SAME AS IN CHAT
const SimpleVideoPlayer = ({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={() => player.play()}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
      />
      {fileName && (
        <Text style={styles.videoCaption} numberOfLines={1}>
          {fileName}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// Media Display Component - USING SAME LOGIC AS CHAT
const MediaDisplay = ({ item }: { item: any }) => {
  const fileType = getFileType(item.fileName);
  const isImage = fileType === "image";
  const isVideo = fileType === "video";

  // Get the display URL
  const getDisplayUrl = () => {
    if (item.ipfsUrl) {
      return item.ipfsUrl.replace(
        "ipfs.filebase.io",
        process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud"
      );
    }

    if (item.cid) {
      return `https://${
        process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud"
      }/ipfs/${item.cid}`;
    }

    return null;
  };

  const displayUrl = getDisplayUrl();

  if (!displayUrl) {
    return (
      <View style={styles.noMedia}>
        <Text>No media URL available</Text>
      </View>
    );
  }

  // 🎯 SIMPLE RULES - SAME AS CHAT:

  // 1. If it has magnet link → WebTorrentMedia (handles both images and videos)
  if (item.magnetLink && (fileType === "image" || fileType === "video")) {
    return (
      <View style={styles.magnetContainer}>
        <WebTorrentMedia
          media={{
            ...item,
            imageUrl: isImage ? displayUrl : null,
            videoUrl: isVideo ? displayUrl : null,
            fileType: fileType,
          }}
          isFocused={true}
        />
      </View>
    );
  }

  // 2. If it's an image → Direct image
  if (isImage) {
    return (
      <Image
        source={{ uri: displayUrl }}
        style={styles.image}
        contentFit="cover"
        transition={300}
        onError={() => console.log("Image failed to load")}
      />
    );
  }

  // 3. If it's a video → Simple video player (SAME AS CHAT)
  if (isVideo) {
    return (
      <SimpleVideoPlayer url={displayUrl} fileName={item.fileName || "Video"} />
    );
  }

  // 4. File download fallback
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(displayUrl)}
      style={styles.fileContainer}
    >
      <Text style={styles.fileIcon}>📁</Text>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.fileName || "File"}
        </Text>
        <Text style={styles.fileType}>
          {fileType || "File"} • Tap to download
        </Text>
      </View>
    </TouchableOpacity>
  );
};

interface NeighborhoodGalleryProps {
  neighborhoodId: string;
  neighborhoodName?: string;
}

export default function NeighborhoodGallery({
  neighborhoodId,
  neighborhoodName,
}: NeighborhoodGalleryProps) {
  const { loading, error, data, refetch } = useQuery(GET_NEIGHBORHOOD_GALLERY, {
    variables: { neighborhoodId },
    skip: !neighborhoodId,
    fetchPolicy: "network-only",
  });

  const { data: adData } = useQuery(GET_RANDOM_AFFILIATE_LINK);

  // Combine videos and images
 const allMedia = React.useMemo(() => {
   if (!data?.getNeighborhoodGallery) return [];

   const rawMedia = [
     ...(data.getNeighborhoodGallery.videos || []),
     ...(data.getNeighborhoodGallery.images || []),
   ].sort(
     (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
   );

   // Inject an Ad every 6 items for the Gallery
   const withAds = [];
   rawMedia.forEach((item, index) => {
     withAds.push(item);
     if ((index + 1) % 6 === 0 && adData?.randomAffiliateLink) {
       withAds.push({ isAd: true, ...adData.randomAffiliateLink });
     }
   });
   return withAds;
 }, [data, adData]);
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Error: {error.message}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.button}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const galleryData = data?.getNeighborhoodGallery;
  const media = allMedia;
  const totalCount = galleryData?.totalCount || 0;

  const renderItem = ({ item }: { item: any }) => {
    if (item.isAd) {
      return (
        <View style={styles.galleryAdWrapper}>
          <AdMessage ad={item} />
        </View>
      );
    }
    const fileType = getFileType(item.fileName);

    return (
      <View style={styles.card}>
        <View
          style={[
            styles.badge,
            fileType === "image" ? styles.imageBadge : styles.videoBadge,
          ]}
        >
          <Text style={styles.badgeText}>{fileType.toUpperCase()}</Text>
        </View>

        <Text style={styles.title}>
          {item.title || item.fileName || "Untitled"}
        </Text>

        <MediaDisplay item={item} />

        <View style={styles.info}>
          <Text>👤 {item.user?.username || "Unknown"}</Text>
          <Text>🏘️ {item.neighborhood?.name || "No neighborhood"}</Text>
          <Text>📅 {new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
      </View>
    );
  };

  if (media.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>
          {neighborhoodName ? `${neighborhoodName} Gallery` : "Gallery"}
        </Text>
        <Text style={styles.empty}>No media in this neighborhood yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {neighborhoodName ? `${neighborhoodName} Gallery` : "Gallery"}
      </Text>
      <Text style={styles.subheader}>{totalCount} items</Text>

      <FlatList
        data={allMedia}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        // --- ADD THESE ---
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subheader: {
    fontSize: 16,
    color: "#666",
    marginBottom: 16,
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#1C0A2E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  imageBadge: {
    backgroundColor: "#4CAF50",
  },
  videoBadge: {
    backgroundColor: "#FF5722",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  noMedia: {
    padding: 20,
    backgroundColor: "#eee",
    borderRadius: 8,
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  // Video styles from chat
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
    backgroundColor: "#130720",
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#130720",
  },
  videoCaption: {
    color: "#F5F2FA",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  magnetContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
  },
  // File container from chat
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
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
  info: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 18,
    color: "#666",
  },
  error: {
    color: "red",
    marginBottom: 10,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  buttonText: {
    color: "white",
  },
});
