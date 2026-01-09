// components/AllNeighborhoodsGallery.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Dimensions,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import WebTorrentMedia from "../components/WebTorrentMedia";
import { Image } from "expo-image";

// Use the working 'images' query instead of 'myImages'
const GET_NEIGHBORHOOD_GALLERY = gql`
  query GetMyAllNeighborhoodsGallery {
    getMyAllNeighborhoodsGallery {
      videos {
        id
        title
        cid
        description
        fileName
        ipfsUrl
        magnetLink
        createdAt
        user {
          username
          profilePhoto
        }
        neighborhood {
          name
        }
      }
      images {
        id
        title
        description
        fileName
        cid
        ipfsUrl
        magnetLink
        createdAt
        user {
          username
          profilePhoto
        }
        neighborhood {
          name
        }
      }
      totalCount
    }
  }
`;

// Utility function
const getFileType = (fileName: string) => {
  if (!fileName) return "unknown";
  fileName = fileName.toLowerCase();

  if (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mov") ||
    fileName.endsWith(".webm") ||
    fileName.endsWith(".avi") ||
    fileName.endsWith(".mkv")
  ) {
    return "video";
  }
  if (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp")
  ) {
    return "image";
  }
  return "unknown";
};

// Simple media display component
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
        <Text style={styles.noMediaText}>No media URL available</Text>
      </View>
    );
  }

  // If it has magnet link → WebTorrentMedia
  if (item.magnetLink && (isImage || isVideo)) {
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

  // If it's an image → Direct image
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

  // If it's a video → Show a thumbnail with play button
  if (isVideo) {
    return (
      <TouchableOpacity
        style={styles.videoContainer}
        onPress={() => Linking.openURL(displayUrl)}
      >
        <View style={styles.videoThumbnail}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
        <Text style={styles.videoLabel}>Tap to play video</Text>
      </TouchableOpacity>
    );
  }

  // File download fallback
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

export default function AllNeighborhoodsGallery() {
  const { data, loading, error, refetch } = useQuery(GET_NEIGHBORHOOD_GALLERY);
  const [refreshing, setRefreshing] = useState(false);

  // Extract and combine data from the single query result
  const combinedData = React.useMemo(() => {
    if (!data?.getMyAllNeighborhoodsGallery) return [];

    const { videos, images } = data.getMyAllNeighborhoodsGallery;
    return [...videos, ...images].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF00FF" />
      </View>
    );
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{error.message}</Text>
      </View>
    );

  // ... rest of your rendering logic using combinedData

  const mediaItems = combinedData;
  const totalCount = mediaItems.length;
  const videoCount = mediaItems.filter(
    (m) => getFileType(m.fileName) === "video"
  ).length;
  const imageCount = mediaItems.filter(
    (m) => getFileType(m.fileName) === "image"
  ).length;

  const renderItem = ({ item }: { item: any }) => {
    const fileType = getFileType(item.fileName);
    const neighborhoodName = item.neighborhood?.name || "Unknown Neighborhood";

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title || item.fileName || "Untitled"}
            </Text>
            <View
              style={[
                styles.fileTypeBadge,
                fileType === "video" ? styles.videoBadge : styles.imageBadge,
              ]}
            >
              <Text style={styles.badgeText}>{fileType.toUpperCase()}</Text>
            </View>
          </View>

          {item.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>

        {/* Media */}
        <View style={styles.mediaContainer}>
          <MediaDisplay item={item} />
        </View>

        {/* Metadata */}
        <View style={styles.metadata}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>By:</Text>
            <Text style={styles.metadataValue}>
              {item.user?.username || "Unknown"}
            </Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Neighborhood:</Text>
            <Text style={styles.metadataValue}>{neighborhoodName}</Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Posted:</Text>
            <Text style={styles.metadataValue}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (mediaItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>All Bubbles</Text>
          <Text style={styles.headerSubtitle}>
            Your combined media from all bubbles
          </Text>
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={styles.emptyTitle}>No media found</Text>
          <Text style={styles.emptySubtitle}>
            Upload some content or try these queries:
          </Text>
          <View style={styles.queryList}>
            <Text style={styles.queryItem}>
              • Use 'images' instead of 'myImages'
            </Text>
            <Text style={styles.queryItem}>
              • Check if 'getMyVideos' returns data
            </Text>
            <Text style={styles.queryItem}>
              • Try 'publicImages' or 'publicVideos'
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All Neighborhoods Gallery</Text>
        <Text style={styles.headerSubtitle}>
          {totalCount} items • {videoCount} videos • {imageCount} images
        </Text>
      </View>

      {/* Gallery List */}
      <FlatList
        data={mediaItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal={true}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListFooterComponent={<View style={styles.footer} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#130720",
  },
  loadingText: {
    marginTop: 15,
    color: "#00FFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorTitle: {
    fontSize: 22,
    color: "#FF0000",
    marginBottom: 10,
    fontWeight: "bold",
    textAlign: "center",
  },
  errorDetail: {
    fontSize: 14,
    color: "#FFFF00",
    textAlign: "center",
    marginBottom: 10,
    fontFamily: "monospace",
  },
  errorHint: {
    fontSize: 12,
    color: "#888888",
    textAlign: "center",
    marginBottom: 15,
    fontStyle: "italic",
  },
  retryButton: {
    backgroundColor: "#FF0000",
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#F5F2FA",
  },
  retryText: {
    color: "#130720",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  header: {
    padding: 10,
    paddingBottom: 10,
    backgroundColor: "#130720",
    borderBottomWidth: 2,
    borderBottomColor: "#591155",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#F5F2FA",
    marginBottom: 5,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#FFFF00",
    letterSpacing: 0.5,
  },
  listContainer: {
    padding: 0, // Set to 0 or remove padding to avoid clipping
    paddingBottom: 20, // Keep if you want space below the card
  },
  card: {
    backgroundColor: "#1C0A2E",
    borderRadius: 12,
    // Add margin to separate cards visually (if desired)
    marginHorizontal: 10,
    // 👇 CRITICAL: Set card width to screen width minus margins
    width: Dimensions.get("window").width - 20, // (Full width - left margin - right margin)
    marginBottom: 15,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#222222",
  },
  cardHeader: {
    padding: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1C0A2E",
  },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: "#F5F2FA",
    marginRight: 10,
  },
  fileTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  videoBadge: {
    backgroundColor: "#FF0000",
  },
  imageBadge: {
    backgroundColor: "#591155",
  },
  badgeText: {
    color: "#130720",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  description: {
    fontSize: 14,
    color: "#CCCCCC",
    lineHeight: 20,
  },
  mediaContainer: {
    padding: 10,
  },
  noMedia: {
    padding: 40,
    backgroundColor: "#130720",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  noMediaText: {
    color: "#F5F2FA",
    fontSize: 14,
  },
  magnetContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 200,
  },
  image: {
    width: "100%",
    height: 250,
    borderRadius: 8,
    backgroundColor: "#222222",
  },
  videoContainer: {
    width: "100%",
    height: 250,
    borderRadius: 8,
    backgroundColor: "#130720",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FF0000",
  },
  videoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  playIcon: {
    fontSize: 40,
    color: "#F5F2FA",
    marginLeft: 5,
  },
  videoLabel: {
    color: "#F5F2FA",
    fontSize: 16,
    fontWeight: "bold",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#130720",
    padding: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#1307200FF",
  },
  fileIcon: {
    fontSize: 36,
    marginRight: 15,
    color: "#F5F2FA",
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
  metadata: {
    padding: 15,
    backgroundColor: "#130720",
    borderTopWidth: 1,
    borderTopColor: "#130720",
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  metadataLabel: {
    fontSize: 14,
    color: "#888888",
    width: 120,
  },
  metadataValue: {
    fontSize: 14,
    color: "#F5F2FA",
    fontWeight: "bold",
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 20,
    color: "#F5F2FA",
  },
  emptyTitle: {
    fontSize: 24,
    color: "#F5F2FA",
    fontWeight: "bold",
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#CCCCCC",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 15,
  },
  queryList: {
    alignItems: "flex-start",
    paddingHorizontal: 20,
  },
  queryItem: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 5,
  },
  footer: {
    height: 50,
  },
});
