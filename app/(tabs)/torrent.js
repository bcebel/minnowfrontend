import React, { useState, useEffect } from "react";
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
import { Image } from "expo-image"; // Use the correct Image import from expo-image
import { useVideoPlayer, VideoView } from "expo-video";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- UTILITY FUNCTIONS ---

// SIMPLE file type detection
const getFileType = (fileName) => {
  if (!fileName) return "unknown";

  // Use the fileName provided in the object, not the mediaUrl (which lacks extension)
  fileName = fileName.toLowerCase();

  // Check for video extensions
  if (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".mov") ||
    fileName.endsWith(".avi") ||
    fileName.endsWith(".mkv") ||
    fileName.endsWith(".webm")
  ) {
    return "video";
  }

  // Check for image extensions
  if (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp")
  ) {
    return "image";
  }

  // Check for document extensions (PDF, DOCX, etc.)
  if (
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".ppt")
  ) {
    return "document";
  }

  return "unknown";
};

// Click tracking function
const trackAffiliateClick = async (affiliateLinkId) => {
  try {
    await fetch(`${BACKEND_URL}/api/track-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affiliateLinkId }),
    });
  } catch (error) {
    console.log("Click tracking failed:", error);
  }
};

// Download function for files
const downloadFile = async (url, fileName) => {
  try {
    if (Platform.OS === "web") {
      // For web, create a download link
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // For mobile, open in browser/app
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error("Download failed:", error);
    Alert.alert("Download Error", "Failed to download file. Please try again.");
  }
};

// --- SUB-COMPONENTS ---

// Affiliate Links Component
const AffiliateLinks = ({ user }) => {
  if (!user?.affiliateLinks?.length) return null;

  return (
    <View style={styles.affiliateSection}>
      <Text style={styles.affiliateTitle}>
        💎 Recommended by {user.username}
      </Text>
      {user.affiliateLinks.map((link) => (
        <TouchableOpacity
          key={link._id || link.id}
          style={styles.affiliateLink}
          onPress={async () => {
            await trackAffiliateClick(link._id || link.id);
            Linking.openURL(link.url);
          }}
        >
          <Text style={styles.linkTitle}>{link.title}</Text>
          <Text style={styles.linkClicks}>{link.clicks} clicks</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// SIMPLE Video Player Component
const VideoPlayer = ({ url }) => {
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

// SIMPLE Image Preview Component
const ImagePreview = ({ url, onError }) => {
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

// SIMPLE Document Preview Component
const DocumentPreview = ({ url, fileName, fileType }) => {
  return (
    <TouchableOpacity
      style={styles.documentContainer}
      onPress={() => downloadFile(url, fileName)} // Uses the download helper
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

// --- Video/Media Card Component (Main Item Renderer) ---

const VideoCard = ({ video }) => {
  const [userData, setUserData] = useState(null);
  const [imageError, setImageError] = useState(false);

  let mediaUrl = video.ipfsUrl;

  // URL processing logic
  if (mediaUrl) {
    if (Platform.OS === "android") {
      mediaUrl = mediaUrl.replace("ipfs.filebase.io", "gateway.pinata.cloud");
    } else {
      mediaUrl = video.cid
        ? `https://${video.cid}.ipfs.dweb.link/`
        : mediaUrl.replace("ipfs.filebase.io", "gateway.pinata.cloud");
    }
  }

  // Get file type and name
  const fileName = video.fileName || video.title || "media";
  const fileType = getFileType(fileName); // Uses the fixed logic

  useEffect(() => {
    // Mock user data for affiliate links demonstration
    const mockUserData = {
      username: video.user?.username || "Creator",
      affiliateLinks: [
        {
          id: "1",
          url: "https://impact.com/test",
          title: "Amazon Products",
          clicks: Math.floor(Math.random() * 10),
        },
        {
          id: "2",
          url: "https://impact.com/electronics",
          title: "Electronics",
          clicks: Math.floor(Math.random() * 5),
        },
      ],
    };
    setUserData(mockUserData);
  }, [video.user]);

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

      {/* Media Rendering */}
      {fileType === "video" ? (
        <VideoPlayer url={mediaUrl} />
      ) : fileType === "image" ? (
        <ImagePreview url={mediaUrl} onError={() => setImageError(true)} />
      ) : (
        <DocumentPreview
          url={mediaUrl}
          fileName={fileName}
          fileType={fileType}
        />
      )}

      {/* Affiliate Links */}
      <AffiliateLinks user={userData} />
    </View>
  );
};

// --- Main App Component ---
export default function App() {
  const { width } = useWindowDimensions();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const numColumns = Platform.OS === "web" && width > 900 ? 3 : 1;

  const fetchVideos = async () => {
    if (!BACKEND_URL) {
      setError("BACKEND_URL is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const apiUrl = `${BACKEND_URL}/api/videos`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setVideos(data);
    } catch (e) {
      console.error("Fetch Error:", e);
      setError(
        `Failed to load videos. Check console for details. Error: ${e.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 300000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Media...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={videos}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={[
          styles.galleryContainer,
          Platform.OS === "web" && { maxWidth: 1200, marginHorizontal: "auto" },
        ]}
        ListHeaderComponent={
          <Text style={styles.header}>Minnow File Gallery</Text>
        }
        numColumns={numColumns}
        columnWrapperStyle={
          numColumns > 1 ? { justifyContent: "space-between" } : null
        }
        windowSize={5}
        initialNumToRender={3}
        maxToRenderPerBatch={1}
      />
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    padding: 15,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  galleryContainer: {
    padding: 10,
  },
  videoCard: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f9f9f9",
    flex: 1,
    margin: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  videoPlayer: {
    width: "100%",
    height: 250,
    backgroundColor: "#000",
    borderRadius: 4,
    marginBottom: 10,
  },
  imagePlayer: {
    width: "100%",
    height: 300,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    color: "#721c24",
    backgroundColor: "#f8d7da",
    padding: 10,
    borderRadius: 5,
    margin: 10,
    textAlign: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#007AFF",
  },
  affiliateSection: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  affiliateTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  affiliateLink: {
    backgroundColor: "white",
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#eee",
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  linkClicks: {
    fontSize: 12,
    color: "#666",
  },
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 10,
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
  },
  documentSubtext: {
    fontSize: 12,
    color: "#6c757d",
  },
  fileTypeBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  fileTypeText: {
    fontSize: 10,
    color: "#1565c0",
    fontWeight: "bold",
  },
});
