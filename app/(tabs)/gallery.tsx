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

  useEffect(() => {
    if ((isVisible || inBuffer) && !shouldLoad) {
      setShouldLoad(true);
    }
  }, [isVisible, inBuffer, shouldLoad]);

  const fileName = media.fileName || media.title || "media";
  const fileType = getFileType(fileName);
  const isSupportedMedia = fileType === "video" || fileType === "image";
  const isDocument = fileType === "document";

const getFormattedDate = (input: any): string => {
  if (!input) return "";
  const timestamp = /^\d+$/.test(input) ? parseInt(input) : Date.parse(input);
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? "" : 
    `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}/${date.getFullYear().toString().slice(-2)}`;
};

  // Don't render heavy content if not visible and not priority
  if (!shouldLoad) {
    return (
      <View style={[styles.mediaCard, styles.placeholderCard]}>
        <View style={styles.placeholderContent}>
          <Text style={styles.placeholderText}>Loading...</Text>
          <View style={styles.placeholderIcon}>
            {fileType === "video" ? "🎬" : fileType === "image" ? "🖼️" : "📄"}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mediaCard}>
      {/* Title and Description */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {media.title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {media.description || "No description provided."}
        </Text>
      </View>

      {/* File type badge */}
      <View
        style={[
          styles.fileTypeBadge,
          fileType === "video" && styles.videoBadge,
          fileType === "image" && styles.imageBadge,
          fileType === "document" && styles.documentBadge,
        ]}
      >
        <Text style={styles.fileTypeText}>{fileType.toUpperCase()}</Text>
        {media.magnetLink && <Text style={styles.p2pBadge}> • 🌐 P2P</Text>}
      </View>

      {/* Media Content */}
      {isSupportedMedia ? (
        <WebTorrentMedia
          media={{
            ...media,
            fileType,
            fileName,
          }}
          isFocused={isFocused && isVisible}
        />
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

      {/* Metadata */}
      <View style={styles.metadata}>
        <View style={styles.userRow}>
          <Text style={styles.userIcon}>👤</Text>
          <Text style={styles.userInfo}>
            {media.user?.username || "Unknown"}
          </Text>
        </View>

        {media.neighborhood && (
          <View style={styles.neighborhoodRow}>
            <Text style={styles.neighborhoodIcon}>🏘️</Text>
            <Text style={styles.neighborhoodInfo}>
              {media.neighborhood.name}
            </Text>
          </View>
        )}

        <View style={styles.timestampRow}>
            <Text style={styles.timestamp}>
              {getFormattedDate(media.createdAt)}
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

  // Lazy loading state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 3 });
  const flatListRef = useRef<FlatList>(null);

  const numColumns = Platform.OS === "web" && width > 900 ? 2 : 1;

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


  // Handle scroll for lazy loading
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS === "web") {
      const scrollY = event.nativeEvent.contentOffset.y;
      const windowHeight = height;

      const itemHeight = 700; // Increased for larger cards
      const startIndex = Math.max(0, Math.floor(scrollY / itemHeight) - 1);
      const endIndex = Math.min(
        sortedMedia.length - 1,
        startIndex + Math.ceil(windowHeight / itemHeight) + 4 // Buffer
      );

      setVisibleRange({ start: startIndex, end: endIndex });
    }
  };

  // Web-specific intersection observer
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
              start: Math.min(prev.start, index - 1),
              end: Math.max(prev.end, index + 2),
            }));
          }
        });
      },
      {
        rootMargin: "300px 0px", // Increased buffer for smooth loading
        threshold: 0.05,
      }
    );

    const cards = document.querySelectorAll("[data-media-index]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [sortedMedia.length]);

  // Load more items
  const loadMore = () => {
    setVisibleRange((prev) => ({
      start: 0,
      end: Math.min(sortedMedia.length - 1, prev.end + 3),
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

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isVisible = index >= visibleRange.start && index <= visibleRange.end;
    const isFocused =
      isVisible &&
      index >= visibleRange.start &&
      index <= visibleRange.start + 1;
    const inBuffer =
      index >= visibleRange.start - 2 && index <= visibleRange.end + 3;
    const priority = index < 2;

    return (
      <View
        data-media-index={index}
        style={{ width: numColumns > 1 ? "50%" : "100%" }}
      >
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

  const p2pCount = mediaItems.filter((item) => item.magnetLink).length;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        key={`flatlist-${numColumns}`}
        data={mediaItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[
          styles.galleryContainer,
          Platform.OS === "web" && { maxWidth: 1200, marginHorizontal: "auto" },
        ]}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>MEDIA GALLERY</Text>
            <Text style={styles.headerSubtitle}>
              {mediaItems.length} ITEMS • {p2pCount} P2P ENABLED
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>
                  {
                    mediaItems.filter(
                      (m) => getFileType(m.fileName) === "video"
                    ).length
                  }
                </Text>
                <Text style={styles.statLabel}>VIDEOS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>
                  {
                    mediaItems.filter(
                      (m) => getFileType(m.fileName) === "image"
                    ).length
                  }
                </Text>
                <Text style={styles.statLabel}>IMAGES</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>
                  {
                    mediaItems.filter(
                      (m) => getFileType(m.fileName) === "document"
                    ).length
                  }
                </Text>
                <Text style={styles.statLabel}>DOCUMENTS</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>NO MEDIA FOUND</Text>
            <Text style={styles.emptySubtext}>
              UPLOAD SOME CONTENT TO GET STARTED
            </Text>
          </View>
        }
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : null}
        refreshing={loading}
        onRefresh={refetch}
      />
    </View>
  );
}

// BOLD COLOR STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    padding: 40,
  },
  headerContainer: {
    padding: 30,
    backgroundColor: "#000000",
    borderBottomWidth: 4,
    borderBottomColor: "#FF00FF",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 3,
    textShadowColor: "#00FFFF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 20,
    color: "#FFFF00",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 2,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 30,
    marginTop: 20,
  },
  statBox: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#111111",
    borderWidth: 2,
    borderColor: "#00FF00",
    minWidth: 120,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FF00FF",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: "#00FFFF",
    letterSpacing: 1,
  },
  galleryContainer: {
    padding: 20,
    backgroundColor: "#000000",
  },
  columnWrapper: {
    gap: 25,
    paddingHorizontal: 20,
  },
  mediaCard: {
    backgroundColor: "#000000",
    borderWidth: 3,
    borderColor: "#000000ff",
    marginBottom: 25,
    overflow: "hidden",
    shadowColor: "#FF00FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  placeholderCard: {
    minHeight: 400,
    backgroundColor: "#111111",
    borderColor: "#666666",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderContent: {
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 48,
    marginTop: 10,
  },
  placeholderText: {
    color: "#FFFF00",
    fontSize: 18,
    fontFamily: "monospace",
  },
  header: {
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#000000ff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#CCCCCC",
    textAlign: "center",
    lineHeight: 22,
  },
  fileTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
    margin: 15,
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
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  p2pBadge: {
    color: "#FFFF00",
    fontWeight: "bold",
    marginLeft: 5,
  },
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 30,
    backgroundColor: "#111111",
    borderWidth: 3,
    borderColor: "#0000FF",
    margin: 15,
    minHeight: 150,
  },
  documentIcon: {
    fontSize: 48,
    marginRight: 20,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  documentSubtext: {
    fontSize: 16,
    color: "#00FFFF",
  },
  unsupportedContainer: {
    padding: 40,
    backgroundColor: "#220000",
    borderWidth: 3,
    borderColor: "#000000ff",
    margin: 15,
    alignItems: "center",
  },
  unsupportedText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  metadata: {
    padding: 20,
    backgroundColor: "#111111",
    borderTopWidth: 2,
    borderTopColor: "#000000ff",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  userIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  userInfo: {
    fontSize: 16,
    color: "#00FF00",
    fontWeight: "bold",
  },
  neighborhoodRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  neighborhoodIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  neighborhoodInfo: {
    fontSize: 16,
    color: "#FF8000",
    fontWeight: "bold",
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestampIcon: {
    fontSize: 14, // or whatever size you want
    marginRight: 8,
    color: "#00FFFF", // Cyan to match
  },
  timestamp: {
    fontSize: 14,
    color: "#00FFFF", // Cyan
    fontFamily: "monospace",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  loadingText: {
    marginTop: 20,
    color: "#00FFFF",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  errorText: {
    fontSize: 28,
    color: "#FF0000",
    marginBottom: 15,
    textAlign: "center",
    fontWeight: "bold",
  },
  errorDetail: {
    fontSize: 16,
    color: "#FFFF00",
    textAlign: "center",
    marginBottom: 20,
    fontFamily: "monospace",
  },
  retryButton: {
    backgroundColor: "#FF0000",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  retryText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
  },
  emptyContainer: {
    padding: 60,
    alignItems: "center",
    backgroundColor: "#000000",
  },
  emptyText: {
    fontSize: 36,
    color: "#FF0000",
    marginBottom: 20,
    fontWeight: "bold",
    textAlign: "center",
    borderWidth: 4,
    borderColor: "#FF0000",
    padding: 30,
  },
  emptySubtext: {
    fontSize: 20,
    color: "#FFFF00",
    textAlign: "center",
    letterSpacing: 1,
  },
});
