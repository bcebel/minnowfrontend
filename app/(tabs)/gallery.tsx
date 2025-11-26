// app/media/gallery.tsx
import React, { useState } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { gql, useQuery } from "@apollo/client";
import WebTorrentPlayer from '../../components/WebTorrentPlayer';
  import WebTorrentImage from '../../components/WebTorrentImage';

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

// Video Card Component
const VideoCard = ({ video }: { video: any }) => {
  const [imageError, setImageError] = useState(false);

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

  if (!mediaUrl) {
    return (
      <View style={styles.videoCard}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.errorText}>No media URL available.</Text>
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

      {video.magnetLink ? ( 
      fileType === 'video' ? (
        <WebTorrentPlayer video = {video} />
        ) : (
        <WebTorrentImage image={video}
          />
        )
      ) : (
      fileType === 'video' ? (
        <VideoPlayer url={mediaUrl} />
        ) : (
        <ImagePReview url={mediaUrl}
          onError={() =>
            setImageError(true)} />
        )
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

// Main Gallery Component
export default function GraphQLGallery() {
  const { width } = useWindowDimensions();
  const { loading, error, data, refetch } = useQuery(GET_MY_VIDEOS);

  const numColumns = Platform.OS === "web" && width > 900 ? 3 : 1;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const videos = data?.getMyVideos || [];

  console.log("📹 Gallery Data:", {
    videoCount: videos.length,
      videos: videos.map((v) => ({ id: v.id, title: v.title })),
  });

  return (
    <View style={styles.container}>
      <FlatList
        key={`flatlist-${numColumns}`}
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={[
          styles.galleryContainer,
          Platform.OS === "web" && { maxWidth: 1200, marginHorizontal: "auto" },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Media Gallery</Text>
            <Text style={styles.headerSubtitle}>
              {videos.length} item{videos.length !== 1 ? "s" : ""} in your
              collection
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No media found</Text>
            <Text style={styles.emptySubtext}>
              Upload some videos or images to see them here!
            </Text>
          </View>
        }
        numColumns={numColumns}
        columnWrapperStyle={
          numColumns > 1 ? { justifyContent: "flex-start" } : null
        }
        refreshing={loading}
        onRefresh={refetch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    padding: 2,
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#dee2e6",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#666",
  },
  galleryContainer: {
    padding: 1,
    alignItems: "flex-start", // Center all items in the gallery
  },
  videoCard: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 1,
    backgroundColor: "#f9f9f9",
    flex: 1,
    margin: 5,
    width: "95%", // 95% of screen width
    alignSelf: "flex-start", // Center each card
    maxWidth: 800, // Optional: prevent cards from getting too wide on large screens
  },
  title: {
    display: "none",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#333",
    textAlign: "center", // Center title
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 1,
    textAlign: "center", // Center description
  },
  videoPlayer: {
    width: "100%",
    height: undefined, // Variable height
    aspectRatio: 16 / 9, // Maintain aspect ratio
    backgroundColor: "#000",
    borderRadius: 4,
    marginBottom: 1,
    alignSelf: "flex-start", // Center video player
  },
  imagePlayer: {
    width: "100%",
    height: undefined, // Variable height
    aspectRatio: 4 / 3, // Maintain aspect ratio
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    marginBottom: 1,
    alignSelf: "flex-start", // Center image
  },
  errorText: {
    color: "#721c24",
    backgroundColor: "#f8d7da",
    padding: 1,
    borderRadius: 5,
    margin: 10,
    textAlign: "center",
  },
  errorDetail: {
    color: "#856404",
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 10,
  },
  loadingText: {
    marginTop: 10,
    color: "#007AFF",
    fontSize: 16,
  },
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 1,
    width: "100%", // Full width of card
    alignSelf: "center", // Center document container
  },
  documentIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 4,
    textAlign: "center", // Center document title
  },
  documentSubtext: {
    fontSize: 12,
    color: "#6c757d",
    textAlign: "center", // Center document subtext
  },
  fileTypeBadge: {
    display: "none",
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 1,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: "center", // Center badge
    marginBottom: 8,
  },
  fileTypeText: {
    display: "none",
    fontSize: 10,
    color: "#1565c0",
    fontWeight: "bold",
  },
  metadata: {
    marginTop: 1,
    paddingTop: 1,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center", // Center metadata
  },
  userInfo: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
    textAlign: "center", // Center user info
  },
  neighborhoodInfo: {
    display: "none",
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
    textAlign: "center", // Center neighborhood info
  },
  timestamp: {
    display: "none",
    fontSize: 12,
    color: "#999",
    textAlign: "center", // Center timestamp
  },
  emptyContainer: {
    alignItems: "center",
    padding: 40,
    width: "100%", // Full width for empty state
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: "center", // Center retry button
  },
  retryText: {
    color: "white",
    fontWeight: "bold",
  },
});
