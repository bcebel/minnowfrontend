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
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { gql, useQuery } from "@apollo/client";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "../../../../components/WebTorrentMedia"; // Import from your chat
import AdMessage from "../../../../components/AdMessage"; // New Ad component
const { width, height } = Dimensions.get("window");
const SAFE_SQUARE_SIZE = Math.min(width, height);

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
        style={styles.fullMedia} // 🎯 Force it to fill exactly
        contentFit="contain" // 🎯 This is the most important prop for expo-video
        showsControls={true}
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
        process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud",
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
    fetchPolicy: "cache-and-network",
  });

  const { data: adData } = useQuery(GET_RANDOM_AFFILIATE_LINK);

  // Combine videos and images
  const allMedia = React.useMemo(() => {
    if (!data?.getNeighborhoodGallery) return [];

    const rawMedia = [
      ...(data.getNeighborhoodGallery.videos || []),
      ...(data.getNeighborhoodGallery.images || []),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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

const renderItem = ({ item }) => {
  if (item.isAd) return <AdMessage ad={item} />;

  return (
    <View style={styles.card}>
      {/* 1. The Media Frame */}
      <View style={styles.mediaWrapper}>
        <MediaDisplay item={item} />
      </View>

      {/* 2. The Text/Control Footer */}
      <View style={styles.footerInfo}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || "Untitled Neighborhood Post"}
        </Text>
        <Text style={styles.caption}>
          👤 {item.user?.username || "Neighbor"}
        </Text>
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
        pagingEnabled={true}
        snapToInterval={SAFE_SQUARE_SIZE + 32} // Square size + your vertical margins
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: (width - SAFE_SQUARE_SIZE) / 2, // Centers the square horizontally
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A", // Dark theme makes letterboxing (black bars) invisible
    borderRadius: 16,
    width: SAFE_SQUARE_SIZE,
    height: SAFE_SQUARE_SIZE,
    alignSelf: "center",
    marginBottom: 20,
    overflow: "hidden", // Keeps everything inside the rounded corners
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  // This is the "Frame" the media sits in
  mediaWrapper: {
    width: "100%",
    height: "80%", // 🎯 Leaves 20% at the bottom for controls/text
    backgroundColor: "#000", 
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
    contentFit: "contain", // 🎯 Ensures no cropping
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
    // For expo-video, contentFit is a prop, not a style
  },
  // The Safe Zone for text/controls
  footerInfo: {
    width: "100%",
    height: "20%",
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#222",
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  caption: {
    color: "#aaa",
    fontSize: 12,
  },
 
  videoContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#130720",
  },

  magnetContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
  },
  container: {
    flex: 1,
    backgroundColor: "#000", // Black background looks better for full-screen media
  },

  // Move info/title to overlay style
  info: {
    position: "absolute",
    bottom: 40,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 8,
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

  noMedia: {
    padding: 20,
    backgroundColor: "#eee",
    borderRadius: 8,
    alignItems: "center",
  },

  videoCaption: {
    color: "#F5F2FA",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 8,
    textAlign: "center",
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
