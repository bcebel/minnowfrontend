// components/AllNeighborhoodsGallery.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Dimensions,
  Platform,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import WebTorrentMedia from "../components/WebTorrentMedia";
import { Image } from "expo-image";
import AdMessage from "./AdMessage";

const { width, height } = Dimensions.get("window");
const CARD_WIDTH = width;
const MEDIA_SIZE = width - 40;

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

const getFileType = (fileName: string) => {
  if (!fileName) return "unknown";
  fileName = fileName.toLowerCase();
  if (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mov") ||
    fileName.endsWith(".webm") ||
    fileName.endsWith(".avi") ||
    fileName.endsWith(".mkv")
  ) return "video";
  if (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".bmp") ||
    fileName.endsWith(".tiff") ||
    fileName.endsWith(".avif") ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif") ||
    fileName.endsWith(".svg")
  ) return "image";
  return "unknown";
};

const MediaDisplay = ({ item, isFocused }: { item: any; isFocused: boolean }) => {
  const fileType = getFileType(item.fileName);
  const isImage = fileType === "image";
  const isVideo = fileType === "video";
  const isGif = item.fileName?.toLowerCase().endsWith(".gif");

  const getDisplayUrl = () => {
    if (item.ipfsUrl) return item.ipfsUrl.replace("ipfs.filebase.io", process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud");
    if (item.cid) return `https://${process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud"}/ipfs/${item.cid}`;
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

  if (item.magnetLink && (isImage || isVideo)) {
    return (
      <View style={styles.magnetContainer}>
        <WebTorrentMedia
          media={{ ...item, imageUrl: isImage ? displayUrl : null, videoUrl: isVideo ? displayUrl : null, fileType: fileType, isGif: isGif }}
          isFocused={isFocused}
        />
      </View>
    );
  }

  if (isGif) {
    return (
      <TouchableOpacity style={styles.gifContainer} activeOpacity={1} onPress={() => console.log("GIF tapped:", displayUrl)}>
        <Image source={{ uri: displayUrl }} style={styles.image} contentFit="contain" transition={100} cachePolicy="memory-disk" recyclingKey={`gif-${item.id}`} />
        <View style={styles.gifBadge}><Text style={styles.gifBadgeText}>GIF</Text></View>
        <Text style={styles.gifHint}>Tap and hold to save</Text>
      </TouchableOpacity>
    );
  }

  if (isImage) {
    return (
      <View style={styles.fixedMediaWrapper}>
        <Image source={{ uri: displayUrl }} style={styles.standardImage} contentFit="contain" transition={300} onError={(e) => console.log("Image failed:", displayUrl, e)} />
      </View>
    );
  }

  if (isVideo) {
    return (
      <TouchableOpacity style={styles.videoContainer} onPress={() => Linking.openURL(displayUrl)}>
        <View style={styles.videoThumbnail}><Text style={styles.playIcon}>▶</Text></View>
        <Text style={styles.videoLabel}>Tap to play video</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={() => Linking.openURL(displayUrl)} style={styles.fileContainer}>
      <Text style={styles.fileIcon}>📁</Text>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.fileName || "File"}</Text>
        <Text style={styles.fileType}>{fileType || "File"} • Tap to download</Text>
      </View>
    </TouchableOpacity>
  );
};

export default function AllNeighborhoodsGallery() {
  const { data, loading, error, refetch } = useQuery(GET_NEIGHBORHOOD_GALLERY, {
    fetchPolicy: "cache-and-network",
  });
  const [refreshing, setRefreshing] = useState(false);
  const { data: adData } = useQuery(GET_RANDOM_AFFILIATE_LINK);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

const combinedData = React.useMemo(() => {
    if (!data?.getMyAllNeighborhoodsGallery) return [];

    // 1. Get both videos and images (or maybe it's just pulling posts?)
    const { videos, images } = data.getMyAllNeighborhoodsGallery;

    // 2. Flatten them
    const flattened = [...(videos || []), ...(images || [])];

    // 3. NORMALIZE: If the media is nested in an array (Post object), extract it!
    const normalized = flattened.map((item: any) => {
      // Check if it's a Post object (has media array)
      if (item.media && item.media.length > 0) {
        return {
          ...item, // Spread the post info
          ...item.media[0], // Spread the media info (cid, url, magnetURI)
          fileName: item.fileName || item.media[0].fileName || `media-${item.media[0].cid}`,
          fileType: item.media[0].mediaType === "video" ? "video" : "image",
          // Make sure we get the neighborhood ID to populate later
          neighborhoodId: item.neighborhood, 
        };
      }
      // If it's already flat, just return it
      return item;
    });

    // 4. Sort by createdAt (normalized)
    const raw = normalized.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    // 5. Inject ads
    const withAds = [];
    raw.forEach((item, index) => {
      withAds.push(item);
      if ((index + 1) % 5 === 0 && adData?.randomAffiliateLink) {
        withAds.push({ isAd: true, id: `ad-page-${index}`, ...adData.randomAffiliateLink });
      }
    });
    return withAds;
  }, [data, adData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Add this new function
  const handleScroll = (e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00FF" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorTitle}>{error.message}</Text></View>;

  const mediaItems = combinedData;
  const totalCount = mediaItems.length;
  const videoCount = mediaItems.filter((m) => getFileType(m.fileName) === "video").length;
  const imageCount = mediaItems.filter((m) => getFileType(m.fileName) === "image").length;

  if (mediaItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>All Bubbles</Text>
          <Text style={styles.headerSubtitle}>Your combined media from all bubbles</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={styles.emptyTitle}>No media found</Text>
        </View>
      </View>
    );
  }

  const WINDOW = 2; // render current +/- 2 = max 5 items
  const startIndex = Math.max(0, activeIndex - WINDOW);
  const endIndex = Math.min(mediaItems.length - 1, activeIndex + WINDOW);
  const visibleIndices = [];
  for (let i = startIndex; i <= endIndex; i++) visibleIndices.push(i);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
 <Text style={styles.headerTitle}>All Bubbles Gallery</Text>
        <Text style={styles.headerSubtitle}>{mediaItems.length} items</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll} // ✅ Use onScroll for web reliability
        scrollEventThrottle={16} // ✅ Essential for web
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
      >
        {/* ✅ MAP OVER ALL 45 ITEMS so the scroll width is correct */}
        {mediaItems.map((item, index) => {
          const isInWindow = index >= startIndex && index <= endIndex;
          const neighborhoodName = item.neighborhood?.name || "Unknown Neighborhood";
          const isFocused = Math.abs(index - activeIndex) <= 1;

          if (item.isAd) {
            return (
              <View key={item.id || `ad-${index}`} style={[styles.card, styles.adCardCenter]}>
                <View style={styles.adBadgeOverlay}><Text style={styles.badgeText}>SPONSORED</Text></View>
                <View style={styles.adMessageContainer}><AdMessage ad={item} /></View>
                <Text style={styles.adSwipeHint}>Swipe to continue gallery →</Text>
              </View>
            );
          }

          // If it's OUT of the window, render a lightweight empty placeholder
          if (!isInWindow) {
            return (
              <View key={item.id || `placeholder-${index}`} style={styles.card}>
                <View style={styles.mediaContainer} />
                <View style={styles.metadata}>
                  <Text style={styles.metadataValue}>Loading {index + 1}...</Text>
                </View>
              </View>
            );
          }

          // If it IS in the window, render the full card
          return (
            <View key={item.id || index} style={styles.card}>
              <View style={styles.mediaContainer}>
                <MediaDisplay item={item} isFocused={isFocused} />
              </View>

              <View style={styles.metadata}>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>By:</Text>
                  <Text style={styles.metadataValue}>{item.user?.username || "Unknown"}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Neighborhood:</Text>
                  <Text style={styles.metadataValue}>{neighborhoodName}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#130720" },
  listContainer: { padding: 0 },
  card: { width: CARD_WIDTH, height: height * 0.7, backgroundColor: "#1C0A2E", justifyContent: "center", alignItems: "center", padding: 20, overflow: "hidden" },
  mediaContainer: { width: MEDIA_SIZE, height: MEDIA_SIZE, backgroundColor: "#000", borderRadius: 12, overflow: "hidden", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#333" },
  fixedMediaWrapper: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  standardImage: { width: "100%", height: "100%" },
  magnetContainer: { width: "100%", height: "100%" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#130720" },
  errorTitle: { fontSize: 22, color: "#FF0000", marginBottom: 10, fontWeight: "bold", textAlign: "center" },
  header: { padding: 10, paddingBottom: 10, backgroundColor: "#130720", borderBottomWidth: 2, borderBottomColor: "#591155" },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#F5F2FA", marginBottom: 5, letterSpacing: 1 },
  headerSubtitle: { fontSize: 14, color: "#FFFF00", letterSpacing: 0.5 },
  noMedia: { padding: 40, backgroundColor: "#130720", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noMediaText: { color: "#F5F2FA", fontSize: 14 },
  image: { width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#222222" },
  videoContainer: { width: "100%", height: 250, borderRadius: 8, backgroundColor: "#130720", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FF0000" },
  videoThumbnail: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255, 0, 0, 0.8)", alignItems: "center", justifyContent: "center", marginBottom: 15 },
  playIcon: { fontSize: 40, color: "#F5F2FA", marginLeft: 5 },
  videoLabel: { color: "#F5F2FA", fontSize: 16, fontWeight: "bold" },
  fileContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#130720", padding: 20, borderRadius: 8, borderWidth: 2, borderColor: "#130720" },
  fileIcon: { fontSize: 36, marginRight: 15, color: "#F5F2FA" },
  fileInfo: { flex: 1 },
  fileName: { color: "#F5F2FA", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  fileType: { color: "#00AA00", fontSize: 14 },
  metadata: { padding: 15, backgroundColor: "#130720", borderTopWidth: 1, borderTopColor: "#130720" },
  metadataRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  metadataLabel: { fontSize: 14, color: "#888888", width: 120 },
  metadataValue: { fontSize: 14, color: "#F5F2FA", fontWeight: "bold", flex: 1 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIcon: { fontSize: 60, marginBottom: 20, color: "#F5F2FA" },
  emptyTitle: { fontSize: 24, color: "#F5F2FA", fontWeight: "bold", marginBottom: 10 },
  adCardCenter: { justifyContent: "center", alignItems: "center", backgroundColor: "#1C0A2E", borderColor: "#591155" },
  adBadgeOverlay: { position: "absolute", top: 15, right: 15, backgroundColor: "#FFFF00", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adMessageContainer: { width: "100%", alignItems: "center", padding: 10 },
  adSwipeHint: { color: "#888", fontSize: 12, marginTop: 20, fontStyle: "italic" },
  gifContainer: { position: "relative", width: "100%", alignItems: "center", marginBottom: 10 },
  gifBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "#FF10FF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, zIndex: 10 },
  gifBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "bold" },
  gifHint: { color: "#888", fontSize: 12, marginTop: 5, fontStyle: "italic" },
});
