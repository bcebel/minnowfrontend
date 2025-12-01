import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
  TouchableOpacity,
  Linking,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { gql, useQuery } from "@apollo/client";
import WebTorrentPlayer from "../../components/WebTorrentPlayer";
import WebTorrentImage from "../../components/WebTorrentImage";

// GraphQL Query
const GET_NEIGHBORHOOD_VIDEOS = gql`
  query GetNeighborhoodVideos($neighborhoodId: ID!) {
    getNeighborhoodVideos(neighborhoodId: $neighborhoodId) {
      id
      title
      description
      fileName
      fileSize
      fileType
      cid
      ipfsUrl
      magnetLink
      user {
        username
        profilePhoto
      }
      neighborhood {
        name
        description
      }
      createdAt
    }
  }
`;

// Utility functions
const getFileType = (fileName: string) => {
  if (!fileName) return "unknown";
  fileName = fileName.toLowerCase();

  if (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mov") ||
    fileName.endsWith(".webm")
  ) {
    return "video";
  }
  if (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif")
  ) {
    return "image";
  }
  if (
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return "document";
  }
  return "unknown";
};

const downloadFile = async (url: string, fileName: string) => {
  try {
    if (Platform.OS === "web") {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error("Download failed:", error);
    Alert.alert("Download Error", "Failed to download file. Please try again.");
  }
};

// Video Player Component
const VideoPlayer = ({ url }: { url: string }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.videoPlayer}
      showsControls={true}
      contentFit="contain"
      allowsExternalPlayback={true}
    />
  );
};

// Image Preview Component
const ImagePreview = ({
  url,
  onError,
}: {
  url: string;
  onError: () => void;
}) => {
  return (
    <TouchableOpacity onPress={() => Linking.openURL(url)}>
      <Image
        source={{ uri: url }}
        style={styles.imagePlayer}
        resizeMode="contain"
        onError={onError}
      />
    </TouchableOpacity>
  );
};

// Document Preview Component
const DocumentPreview = ({
  url,
  fileName,
  fileType,
}: {
  url: string;
  fileName: string;
  fileType: string;
}) => {
  return (
    <TouchableOpacity
      style={styles.documentContainer}
      onPress={() => downloadFile(url, fileName)}
    >
      <Text style={styles.documentIcon}>
        {fileType === "document" ? "📄" : "📁"}
      </Text>
      <View style={styles.documentInfo}>
        <Text style={styles.documentTitle} numberOfLines={1}>
          {fileName || "Download File"}
        </Text>
        <Text style={styles.documentSubtext}>
          Tap to download • {fileType === "document" ? "Document" : "File"}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// VIDEO CARD COMPONENT - This was missing!
const VideoCard = ({
  video,
  isVisible,
  priority,
  inBuffer,
  isFocused,
}: {
  video: any;
  isVisible: boolean;
  priority: boolean;
  inBuffer: boolean;
  isFocused: boolean;
}) => {
  const [imageError, setImageError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority);

  useEffect(() => {
    if ((isVisible || inBuffer) && !shouldLoad) {
      setShouldLoad(true);
    }
  }, [isVisible]);

  let mediaUrl = video.ipfsUrl;

  // URL processing logic
  if (mediaUrl) {
    if (Platform.OS === "android") {
      mediaUrl = mediaUrl.replace(
        "ipfs.filebase.io",
        process.env.EXPO_PUBLIC_PINATA_GATEWAY
      );
    } else {
      mediaUrl = video.cid
        ? `https://${video.cid}.ipfs.dweb.link/`
        : mediaUrl.replace(
            "ipfs.filebase.io",
            process.env.EXPO_PUBLIC_PINATA_GATEWAY
          );
    }
  }

  const fileName = video.fileName || video.title || "media";
  const fileType = getFileType(fileName);
  const isProfilePhoto =
    !video.magnetLink &&
    video.cid &&
    (video.fileName?.includes("profile-photo") ||
      video.title?.includes("Profile Photo"));

  if (!mediaUrl) {
    return (
      <View style={styles.videoCard}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.errorText}>No media URL available.</Text>
      </View>
    );
  }

  if (!shouldLoad) {
    return (
      <View style={[styles.videoCard, styles.placeholderCard]}>
        <View style={styles.placeholderContent}>
          <Text style={styles.placeholderText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.videoCard}>
      <Text style={styles.title} numberOfLines={1}>
        {video.title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {video.description || "No description provided."}
      </Text>

      {/* File type badge */}
      <View style={styles.fileTypeBadge}>
        <Text style={styles.fileTypeText}>
          {fileType.toUpperCase()} • {fileName ? fileName : "Media"}
        </Text>
      </View>

      {video.magnetLink && !isProfilePhoto ? (
        fileType === "video" ? (
          <WebTorrentPlayer video={video} isFocused={isFocused} />
        ) : (
          <WebTorrentImage image={video} isFocused={isFocused} />
        )
      ) : fileType === "video" ? (
        <VideoPlayer url={mediaUrl} />
      ) : (
        <ImagePreview url={mediaUrl} onError={() => setImageError(true)} />
      )}

      {/* Video metadata */}
      <View style={styles.metadata}>
        <Text style={styles.userInfo}>
          👤 {video.user?.username || "Unknown"}
        </Text>
        {video.neighborhood && (
          <Text style={styles.neighborhoodInfo}>
            🏘️ {video.neighborhood.name}
          </Text>
        )}
        <Text style={styles.timestamp}>
          📅 {new Date(video.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );
};

// Main Neighborhood Gallery Component
export default function NeighborhoodGallery({
  neighborhoodId,
  neighborhoodName,
}: {
  neighborhoodId: string;
  neighborhoodName?: string;
}) {
  const { width, height } = useWindowDimensions();

  const { loading, error, data, refetch } = useQuery(GET_NEIGHBORHOOD_VIDEOS, {
    variables: { neighborhoodId },
    skip: !neighborhoodId,
  });

  // Lazy loading state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 3 });
  const flatListRef = useRef<FlatList>(null);

  const numColumns = Platform.OS === "web" && width > 900 ? 2 : 1;

  // Sort videos for optimal loading
  const sortedVideos = React.useMemo(() => {
    if (!data?.getNeighborhoodVideos) return [];

    return [...data.getNeighborhoodVideos].sort((a, b) => {
      const aType = getFileType(a.fileName);
      const bType = getFileType(b.fileName);

      if (aType === "image" && bType !== "image") return -1;
      if (bType === "image" && aType !== "image") return 1;

      if (a.cid && !b.cid) return -1;
      if (!a.cid && b.cid) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data?.getNeighborhoodVideos]);

  // Handle scroll for lazy loading
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS === "web") {
      const scrollY = event.nativeEvent.contentOffset.y;
      const windowHeight = height;
      const itemHeight = 600;
      const startIndex = Math.max(0, Math.floor(scrollY / itemHeight) - 1);
      const endIndex = Math.min(
        sortedVideos.length - 1,
        startIndex + Math.ceil(windowHeight / itemHeight) + 25
      );

      setVisibleRange({ start: startIndex, end: endIndex });
    }
  };

  const loadMore = () => {
    setVisibleRange((prev) => ({
      start: 0,
      end: Math.min(sortedVideos.length - 1, prev.end + 5),
    }));
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Neighborhood Media...</Text>
      </View>
    );
  }

  if (error) {
    console.error("GraphQL Error:", error);
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading neighborhood media</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const videos = sortedVideos;

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isVisible = index >= visibleRange.start && index <= visibleRange.end;
    const isFocused =
      index >= visibleRange.start && index <= visibleRange.start + 2;
    const inBuffer =
      index >= visibleRange.start - 5 && index <= visibleRange.end + 15;
    const priority = index < 3;

    return (
      <View style={{ width: numColumns > 1 ? "50%" : "100%" }}>
        <VideoCard
          video={item}
          isVisible={isVisible}
          priority={priority}
          inBuffer={inBuffer}
          isFocused={isFocused}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        key={`flatlist-${numColumns}`}
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[
          styles.galleryContainer,
          Platform.OS === "web" && { maxWidth: 1000, marginHorizontal: "auto" },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {neighborhoodName
                ? `${neighborhoodName} Gallery`
                : "Neighborhood Gallery"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {videos.length} item{videos.length !== 1 ? "s" : ""} in this
              neighborhood
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No media in this neighborhood yet
            </Text>
            <Text style={styles.emptySubtext}>
              Share some videos or images in the chat to get started!
            </Text>
          </View>
        }
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        refreshing={loading}
        onRefresh={refetch}
      />
    </View>
  );
}

// Keep all your existing styles...
const styles = StyleSheet.create({
  // ... (copy all your existing styles from the original gallery)
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    padding: 2,
  },
  header: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#dee2e6",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 18,
    color: "#666",
  },
  galleryContainer: {
    padding: 16,
  },
  columnWrapper: {
    justifyContent: "space-between",
    gap: 16,
  },
  videoCard: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    padding: 20,
    backgroundColor: "#f9f9f9",
    margin: 12,
    minHeight: 600,
    width: "100%",
    maxWidth: 1000,
  },
  placeholderCard: {
    minHeight: 300,
    backgroundColor: "#f0f0f0",
  },
  placeholderContent: {
    alignItems: "center",
  },
  placeholderText: {
    color: "#666",
    fontSize: 16,
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    marginBottom: 16,
  },
  imagePlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#721c24",
    backgroundColor: "#f8d7da",
    padding: 12,
    borderRadius: 8,
    margin: 12,
    textAlign: "center",
    fontSize: 14,
  },
  errorDetail: {
    color: "#856404",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  loadingText: {
    marginTop: 12,
    color: "#007AFF",
    fontSize: 18,
  },
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 12,
    width: "100%",
    alignSelf: "center",
  },
  documentIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 6,
    textAlign: "center",
  },
  documentSubtext: {
    fontSize: 14,
    color: "#6c757d",
    textAlign: "center",
  },
  fileTypeBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "center",
    marginBottom: 12,
  },
  fileTypeText: {
    fontSize: 12,
    color: "#1565c0",
    fontWeight: "bold",
  },
  metadata: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center",
  },
  userInfo: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
    textAlign: "center",
  },
  neighborhoodInfo: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
    textAlign: "center",
  },
  timestamp: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  emptyContainer: {
    padding: 60,
    width: "100%",
  },
  emptyText: {
    fontSize: 24,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 18,
    color: "#999",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: "center",
  },
  retryText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
