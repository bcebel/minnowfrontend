import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions, // Used for basic responsive styling
} from "react-native";
// Correct import from expo-video
import { useVideoPlayer, VideoView } from "expo-video";

// Use the environment variable for your backend URL
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- Video Card Component ---
const VideoCard = ({ video }) => {
  // 1. Implement the URL processing logic, prioritizing the most stable IPFS gateway.
  let ipfsUrl = video.cid
    ? // Use the stable subdomain gateway format for CIDs (this fixed the iOS issue)
      `https://${video.cid}.ipfs.dweb.link/`
    : // Fallback for legacy items that only use the old ipfsUrl structure
      video.ipfsUrl?.replace("ipfs.filebase.io", "gateway.pinata.cloud");

  if (!ipfsUrl) {
    return (
      <View style={styles.videoCard}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.errorText}>Video link unavailable.</Text>
      </View>
    );
  }

  // 2. Initialize the video player with the IPFS URL
  const player = useVideoPlayer(ipfsUrl, (player) => {
    // Set properties like looping during initialization
    player.loop = true;
    // Optionally: player.play(); // to autoplay
  });

  return (
    <View style={styles.videoCard}>
      <Text style={styles.title} numberOfLines={1}>
        {video.title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {video.description || "No description provided."}
      </Text>

      {/* 3. Use the VideoView component */}
      <VideoView
        player={player}
        style={[styles.videoPlayer]} // Style prop requires an array/object
        showsControls={true} // Display native controls (Play/Pause, Seek, etc.)
        contentFit="contain" // Equivalent to resizeMode="contain"
        // Retaining this fix as it helps native players manage streams
        allowsExternalPlayback={true}
      />
    </View>
  );
};

// --- Main App Component ---
export default function App() {
  // ... (rest of App component code remains unchanged)

  const { width } = useWindowDimensions();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calculate grid columns based on screen width (for web/tablet responsiveness)
  const numColumns = Platform.OS === "web" && width > 900 ? 3 : 1;

  const fetchVideos = async () => {
    // Guard against missing URL
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
    // 5-minute refresh interval (300000 ms)
    const interval = setInterval(fetchVideos, 300000);
    return () => clearInterval(interval);
  }, []);

  // --- Loading, Error, and Render States ---
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Videos...</Text>
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

  // Use FlatList for efficient scrolling
  return (
    <View style={styles.container}>
      <FlatList
        data={videos}
        // Use the unique _id from your JSON for keyExtractor
        keyExtractor={(item) => item._id}
        // Render a VideoCard for each item
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={[
          styles.galleryContainer,
          // Apply the max-width and center alignment for web
          Platform.OS === "web" && { maxWidth: 1200, marginHorizontal: "auto" },
        ]}
        ListHeaderComponent={
          <Text style={styles.header}>Minnow Video Strike</Text>
        }
        numColumns={numColumns} // Uses 1 column on mobile, 3 on large screens
        // Ensures equal spacing when multiple columns are active
        columnWrapperStyle={
          numColumns > 1 ? { justifyContent: "space-between" } : null
        }
      />
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    // When using a regular View as the root, the system often handles safe area
    // automatically, or we rely on the component's internal padding (like FlatList)
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
    // Basic card styling
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f9f9f9",

    // Flexbox ensures width works for both mobile (full width) and web grid (equal width)
    flex: 1,
    margin: 5, // Space between grid items
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
    height: 250, // Fixed height for visual consistency
    backgroundColor: "#000",
    borderRadius: 4,
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
});
