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
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

// Function to fetch user affiliate data
const fetchUserAffiliateData = async (userId) => {
  try {
    const response = await fetch(`${BACKEND_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetUserAffiliateLinks($userId: ID!) {
            user(id: $userId) {
              id
              username
              affiliateLinks {
                id
                url
                title
                clicks
              }
            }
          }
        `,
        variables: { userId },
      }),
    });

    const result = await response.json();
    return result.data?.user;
  } catch (error) {
    console.log("Failed to fetch affiliate data:", error);
    return null;
  }
};

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

// --- Video Card Component ---
// --- SIMPLE Video Card Component ---
// --- SMART Video Card Component ---
const VideoCard = ({ video }) => {
  const [userData, setUserData] = useState(null);
  let ipfsUrl;

  // URL processing logic
  if (Platform.OS === "android") {
    ipfsUrl = video.ipfsUrl?.replace(
      "ipfs.filebase.io",
      "gateway.pinata.cloud"
    );
  } else {
    ipfsUrl = video.cid
      ? `https://${video.cid}.ipfs.dweb.link/`
      : video.ipfsUrl?.replace("ipfs.filebase.io", "gateway.pinata.cloud");
  }

  // SIMPLIFIED: Only try to fetch affiliate data for users we know exist in GraphQL
  useEffect(() => {
    // For now, let's just use mock data for everyone
    // But in the future, we can conditionally fetch real data
    const mockUserData = {
      username: video.user?.username || "Creator",
      affiliateLinks: [
        {
          id: "1",
          url: "https://impact.com/test",
          title: "Amazon Products", 
          clicks: Math.floor(Math.random() * 10)
        },
        {
          id: "2", 
          url: "https://impact.com/electronics",
          title: "Electronics",
          clicks: Math.floor(Math.random() * 5)
        }
      ]
    };
    setUserData(mockUserData);
    
    // Optional: Uncomment this later when we fix the data sync
    // if (video.user?._id) {
    //   fetchUserAffiliateData(video.user._id).then(data => {
    //     if (data) {
    //       setUserData(data); // Use real data if available
    //     } else {
    //       setUserData(mockUserData); // Fallback to mock
    //     }
    //   });
    // }
  }, [video.user]);

  if (!ipfsUrl) {
    return (
      <View style={styles.videoCard}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.errorText}>Video link unavailable.</Text>
      </View>
    );
  }

  const player = useVideoPlayer(ipfsUrl, (player) => {
    player.loop = true;
  });

  return (
    <View style={styles.videoCard}>
      <Text style={styles.title} numberOfLines={1}>
        {video.title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {video.description || "No description provided"}
      </Text>

      <VideoView
        player={player}
        style={[styles.videoPlayer]}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
      />

      {/* This will now show data (mock for now, real later) */}
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
          <Text style={styles.header}>Minnow Video Strike</Text>
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
  // Add affiliate styles
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
});
