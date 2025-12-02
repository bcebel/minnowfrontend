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
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import WebTorrentMedia from "../../components/WebTorrentMedia";

// GraphQL Query
const GET_MY_VIDEOS = gql`
  query GetMyVideos {
    getMyVideos {
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
  if (
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return "document";
  }
  return "unknown";
};

const getFormattedDate = (input: any): string => {
  if (!input) return "";
  const timestamp = /^\d+$/.test(input) ? parseInt(input) : Date.parse(input);
  const date = new Date(timestamp);
  return isNaN(date.getTime())
    ? ""
    : `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
        .getDate()
        .toString()
        .padStart(2, "0")}/${date.getFullYear().toString().slice(-2)}`;
};

const MediaCard = ({
  media,
  isVisible,
  priority,
  inBuffer,
  isFocused,
}: {
  media: any;
  isVisible: boolean;
  priority: boolean;
  inBuffer: boolean;
  isFocused: boolean;
}) => {
  const [shouldLoad, setShouldLoad] = useState(priority);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if ((isVisible || inBuffer) && !shouldLoad) {
      setShouldLoad(true);
    }
  }, [isVisible, inBuffer, shouldLoad]);

  const fileName = media.fileName || media.title || "media";
  const fileType = getFileType(fileName);
  const isSupportedMedia = fileType === "video" || fileType === "image";
  const isDocument = fileType === "document";

  // Don't render heavy content if not visible and not priority
  if (!shouldLoad) {
    return (
      <View style={[styles.mediaCard, styles.placeholderCard]}>
        <View style={styles.placeholderContent}>
          <Text style={styles.placeholderText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mediaCard}>
      {/* Header - LEFT ALIGNED */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {media.title}
        </Text>
        {media.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {media.description}
          </Text>
        ) : null}
      </View>

      {/* File type badge - LEFT ALIGNED */}
      <View
        style={[
          styles.fileTypeBadge,
          fileType === "video" && styles.videoBadge,
          fileType === "image" && styles.imageBadge,
          fileType === "document" && styles.documentBadge,
        ]}
      >
        <Text style={styles.fileTypeText}>{fileType.toUpperCase()}</Text>
        {media.magnetLink && <Text style={styles.p2pBadge}> • P2P</Text>}
      </View>

      {/* Media Content - FULL WIDTH */}
      {isSupportedMedia ? (
        <View style={styles.mediaWrapper}>
          <WebTorrentMedia
            media={{
              ...media,
              fileType,
              fileName,
            }}
            isFocused={isFocused && isVisible}
          />
        </View>
      ) : isDocument ? (
        <View style={styles.documentContainer}>
          <Text style={styles.documentIcon}>📄</Text>
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle} numberOfLines={2}>
              {fileName || "Document"}
            </Text>
            <Text style={styles.documentSubtext}>
              {media.fileSize
                ? `Size: ${(media.fileSize / 1024 / 1024).toFixed(2)} MB`
                : "Document"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.unsupportedContainer}>
          <Text style={styles.unsupportedText}>Unsupported file type</Text>
        </View>
      )}

      {/* Metadata - LEFT ALIGNED */}
      <View style={styles.metadata}>
        <View style={styles.metadataRow}>
          <Text style={styles.userIcon}>👤</Text>
          <Text style={styles.userInfo}>
            {media.user?.username || "Unknown"}
          </Text>
        </View>

        {media.neighborhood && (
          <View style={styles.metadataRow}>
            <Text style={styles.neighborhoodIcon}>🏘️</Text>
            <Text style={styles.neighborhoodInfo}>
              {media.neighborhood.name}
            </Text>
          </View>
        )}

        <View style={styles.metadataRow}>
          <Text style={styles.timestamp}>
            📅 {getFormattedDate(media.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
};

// Main Gallery Component
export default function GraphQLGallery() {
  const { width, height } = useWindowDimensions();
  const { loading, error, data, refetch } = useQuery(GET_MY_VIDEOS);

  // Lazy loading state - start with just 1 visible
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 1 });
  const flatListRef = useRef<FlatList>(null);

  // Single column, full width
  const numColumns = 1;

  // Sort media for optimal loading
  const sortedMedia = React.useMemo(() => {
    if (!data?.getMyVideos) return [];

    return [...data.getMyVideos].sort((a, b) => {
      // Priority 1: Images before videos (faster to load)
      const aType = getFileType(a.fileName);
      const bType = getFileType(b.fileName);

      if (aType === "image" && bType !== "image") return -1;
      if (bType === "image" && aType !== "image") return 1;

      // Priority 2: P2P content first
      if (a.magnetLink && !b.magnetLink) return -1;
      if (!a.magnetLink && b.magnetLink) return 1;

      // Priority 3: Newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data?.getMyVideos]);

  // Handle scroll for lazy loading - aggressive
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = event.nativeEvent.contentOffset.y;

    // Calculate visible items based on scroll position
    const itemHeight = height * 0.9; // 90% of viewport height
    const startIndex = Math.floor(scrollY / itemHeight);
    const visibleItems = Math.ceil(height / itemHeight) + 1; // +1 for buffer

    setVisibleRange({
      start: Math.max(0, startIndex - 1), // Load 1 before
      end: Math.min(sortedMedia.length - 1, startIndex + visibleItems + 2), // Load 2 after
    });
  };

  // Web-specific intersection observer - more aggressive
  useEffect(() => {
    if (Platform.OS !== "web" || !sortedMedia.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(
              entry.target.getAttribute("data-index") || "0"
            );
            setVisibleRange((prev) => ({
              start: Math.min(prev.start, index - 2), // Load 2 before
              end: Math.max(prev.end, index + 3), // Load 3 after
            }));
          }
        });
      },
      {
        rootMargin: "100px 0px", // Small buffer since items are huge
        threshold: 0.01, // Trigger as soon as 1% is visible
      }
    );

    const cards = document.querySelectorAll("[data-media-index]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [sortedMedia.length]);

  // Load more when reaching end
  const loadMore = () => {
    setVisibleRange((prev) => ({
      start: 0,
      end: Math.min(sortedMedia.length - 1, prev.end + 2),
    }));
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF00FF" />
        <Text style={styles.loadingText}>Loading Your Media...</Text>
      </View>
    );
  }

  if (error) {
    console.error("GraphQL Error:", error);
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading media</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>RETRY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mediaItems = sortedMedia;
  const p2pCount = mediaItems.filter((item) => item.magnetLink).length;

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isVisible = index >= visibleRange.start && index <= visibleRange.end;
    const isFocused = isVisible && index === visibleRange.start; // Only first visible is focused
    const inBuffer =
      index >= visibleRange.start - 1 && index <= visibleRange.end + 1;
    const priority = index < 1; // Only first item gets priority

    return (
      <View data-media-index={index} style={styles.fullWidthItem}>
        <MediaCard
          media={item}
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
      {/* Header - LEFT ALIGNED */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>MEDIA GALLERY</Text>
        <Text style={styles.headerSubtitle}>
          {mediaItems.length} ITEMS • {p2pCount} P2P ENABLED
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {
                mediaItems.filter((m) => getFileType(m.fileName) === "video")
                  .length
              }
            </Text>
            <Text style={styles.statLabel}>VIDEOS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {
                mediaItems.filter((m) => getFileType(m.fileName) === "image")
                  .length
              }
            </Text>
            <Text style={styles.statLabel}>IMAGES</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {
                mediaItems.filter((m) => getFileType(m.fileName) === "document")
                  .length
              }
            </Text>
            <Text style={styles.statLabel}>DOCUMENTS</Text>
          </View>
        </View>
      </View>

      {/* Main Gallery - FULL WIDTH */}
      <FlatList
        ref={flatListRef}
        data={mediaItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.1} // Trigger early
        contentContainerStyle={styles.galleryContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>NO MEDIA FOUND</Text>
            <Text style={styles.emptySubtext}>
              UPLOAD SOME CONTENT TO GET STARTED
            </Text>
          </View>
        }
        numColumns={1}
        refreshing={loading}
        onRefresh={refetch}
        snapToInterval={height * 0.9} // Snap to 90% viewport height
        decelerationRate="fast"
      />
    </View>
  );
}

// BOLD, LEFT-ALIGNED, FULL-WIDTH STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start", // LEFT ALIGNED
    backgroundColor: "#000000",
  },
  fullWidthItem: {
    width: "100%",
  },
  headerContainer: {
    padding: 20,
    paddingLeft: 10,
    backgroundColor: "#000000",
    borderBottomWidth: 4,
    borderBottomColor: "#FF00FF",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "left", // LEFT ALIGNED
    marginBottom: 8,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#FFFF00",
    textAlign: "left", // LEFT ALIGNED
    marginBottom: 20,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "flex-start", // LEFT ALIGNED
    gap: 20,
    flexWrap: "wrap",
  },
  statBox: {
    alignItems: "flex-start", // LEFT ALIGNED
    padding: 15,
    paddingLeft: 10,
    backgroundColor: "#111111",
    borderWidth: 2,
    borderColor: "#00FF00",
    minWidth: 100,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FF00FF",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#00FFFF",
    letterSpacing: 1,
  },
  galleryContainer: {
    paddingHorizontal: 0, // NO horizontal padding
  },
  mediaCard: {
    marginBottom: 10,
    width: "100%",
    minHeight: 600, // Minimum height
    backgroundColor: "#000000",
    borderWidth: 3,
    borderColor: "#000000ff",
    overflow: "hidden",
    shadowColor: "#FF00FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  placeholderCard: {
    minHeight: 500,
    backgroundColor: "#111111",
    borderColor: "#ff00ff",
    justifyContent: "center",
    alignItems: "flex-start", // LEFT ALIGNED
  },
  placeholderContent: {
    alignItems: "flex-start", // LEFT ALIGNED
  },
  placeholderText: {
    color: "#FFFF00",
    fontSize: 16,
    fontFamily: "monospace",
  },
  header: {
    padding: 15,
    paddingLeft: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#0000FF",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "left", // LEFT ALIGNED
  },
  description: {
    fontSize: 14,
    color: "#CCCCCC",
    textAlign: "left", // LEFT ALIGNED
    lineHeight: 18,
  },
  fileTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start", // LEFT ALIGNED
    margin: 10,
    marginLeft: 10,
    borderWidth: 2,
  },
  videoBadge: {
    backgroundColor: "#FF0000",
    borderColor: "#FFFFFF",
  },
  imageBadge: {
    backgroundColor: "#00FF00",
    borderColor: "#000000",
  },
  documentBadge: {
    backgroundColor: "#0000FF",
    borderColor: "#FFFFFF",
  },
  fileTypeText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  p2pBadge: {
    color: "#FFFF00",
    fontWeight: "bold",
    marginLeft: 4,
    fontSize: 12,
  },
  mediaWrapper: {
    width: "100%",
    minHeight: 400, // Minimum media height
  },
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111",
    borderWidth: 3,
    borderColor: "#0000FF",
    margin: 10,
    minHeight: 120,
  },
  documentIcon: {
    fontSize: 36,
    marginRight: 15,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "left", // LEFT ALIGNED
  },
  documentSubtext: {
    fontSize: 14,
    color: "#00FFFF",
    textAlign: "left", // LEFT ALIGNED
  },
  unsupportedContainer: {
    backgroundColor: "#220000",
    borderWidth: 3,
    borderColor: "#0000FF",
    margin: 10,
    alignItems: "flex-start", // LEFT ALIGNED
  },
  unsupportedText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  metadata: {
    padding: 15,
    paddingLeft: 10,
    backgroundColor: "#111111",
    borderTopWidth: 2,
    borderTopColor: "#0000FF",
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  userIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  userInfo: {
    fontSize: 14,
    color: "#00FF00",
    fontWeight: "bold",
  },
  neighborhoodIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  neighborhoodInfo: {
    fontSize: 14,
    color: "#FF8000",
    fontWeight: "bold",
  },
  timestamp: {
    fontSize: 14,
    color: "#00FFFF",
    fontFamily: "monospace",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  loadingText: {
    marginTop: 15,
    color: "#00FFFF",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "left", // LEFT ALIGNED
  },
  errorText: {
    fontSize: 22,
    color: "#FF0000",
    marginBottom: 10,
    textAlign: "left", // LEFT ALIGNED
    fontWeight: "bold",
  },
  errorDetail: {
    fontSize: 14,
    color: "#FFFF00",
    textAlign: "left", // LEFT ALIGNED
    marginBottom: 15,
    fontFamily: "monospace",
  },
  retryButton: {
    backgroundColor: "#FF0000",
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignSelf: "flex-start", // LEFT ALIGNED
  },
  retryText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  emptyContainer: {
    padding: 40,
    paddingLeft: 10,
    alignItems: "flex-start", // LEFT ALIGNED
    backgroundColor: "#000000",
  },
  emptyText: {
    fontSize: 28,
    color: "#FF0000",
    marginBottom: 15,
    fontWeight: "bold",
    textAlign: "left", // LEFT ALIGNED
    borderWidth: 4,
    borderColor: "#FF0000",
    padding: 20,
  },
  emptySubtext: {
    fontSize: 16,
    color: "#FFFF00",
    textAlign: "left", // LEFT ALIGNED
    letterSpacing: 1,
  },
});
