import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gql, useQuery } from "@apollo/client";

// GraphQL Query - using the same pattern as chat
const GET_MY_PROFILE = gql`
  query GetMyProfile {
    me {
      id
      username
      email
      bio
      profilePhoto
    }
  }
`;

export default function HomeScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Auth check - same pattern as chat
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        if (!token) {
          Alert.alert("Authentication Required", "Please log in to continue");
          router.replace("/login");
          return;
        }

        setUsername(savedUsername || "");
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Auth check error:", error);
        Alert.alert("Error", "Failed to initialize app");
        router.replace("/login");
      }
    };

    checkAuth();
  }, []);

  // GraphQL query - only run when authenticated
  const { loading, error, data, refetch } = useQuery(GET_MY_PROFILE, {
    skip: !isAuthenticated, // Same pattern as chat
    fetchPolicy: "cache-and-network",
  });

  // Handle logout - same pattern as chat
  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "username"]);
    router.replace("/login");
  };

  // Not authenticated yet
  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FF00" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FF00" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
        {username && (
          <Text style={styles.welcomeText}>Welcome back, @{username}! 👋</Text>
        )}
      </View>
    );
  }

  // Error state
  if (error) {
    console.error("Home GraphQL Error:", error);

    // Handle auth errors like chat does
    if (error.message.includes("Authentication")) {
      AsyncStorage.multiRemove(["token", "username"]).then(() => {
        Alert.alert("Session Expired", "Please log in again", [
          { text: "OK", onPress: () => router.replace("/login") },
        ]);
      });
      return null;
    }

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading profile</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No data state
  if (!data?.me) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No profile data found</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const user = data.me;

  // Safe data handling
  const safeUser = {
    username: user.username || "User",
    profilePhoto: user.profilePhoto || "https://via.placeholder.com/60",
    email: user.email || "",
    bio: user.bio || "No bio yet",
    videos: user.videos || [],
    posts: user.posts || [],
    groups: user.groups || [],
    affiliateLinks: user.affiliateLinks || [],
  };

  // Calculate stats
  const totalLinkClicks = safeUser.affiliateLinks.reduce(
    (sum, link) => sum + (link.clicks || 0),
    0
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: safeUser.profilePhoto }}
            style={styles.profileImage}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.welcome}>Welcome back,</Text>
            <Text style={styles.username}>@{safeUser.username}</Text>
            <Text style={styles.email}>{safeUser.email}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Bio */}
      {safeUser.bio && (
        <View style={styles.section}>
          <Text style={styles.bio}>{safeUser.bio}</Text>
        </View>
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{safeUser.videos.length}</Text>
          <Text style={styles.statLabel}>Videos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{safeUser.posts.length}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{safeUser.groups.length}</Text>
          <Text style={styles.statLabel}>Groups</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalLinkClicks}</Text>
          <Text style={styles.statLabel}>Link Clicks</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push("/upload")}
          >
            <Text style={styles.actionIcon}>🎥</Text>
            <Text style={styles.actionText}>Upload Video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push("/create-post")}
          >
            <Text style={styles.actionIcon}>📝</Text>
            <Text style={styles.actionText}>Create Post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push("/go-live")}
          >
            <Text style={styles.actionIcon}>🔴</Text>
            <Text style={styles.actionText}>Go Live</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Videos */}
      {safeUser.videos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Videos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {safeUser.videos.slice(0, 5).map((video) => (
              <TouchableOpacity key={video.id} style={styles.videoCard}>
                <Image
                  source={{
                    uri:
                      video.thumbnail ||
                      `https://via.placeholder.com/120x80/333/fff?text=${encodeURIComponent(
                        video.title || "Video"
                      )}`,
                  }}
                  style={styles.videoThumbnail}
                />
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {video.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

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
    padding: 20,
  },
  loadingText: {
    color: "#00FF00",
    marginTop: 10,
    fontSize: 16,
  },
  welcomeText: {
    color: "#FFFFFF",
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetail: {
    color: "#FF8888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00FF00",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
    backgroundColor: "#333333",
  },
  profileInfo: {
    flex: 1,
  },
  welcome: {
    color: "#888888",
    fontSize: 14,
  },
  username: {
    color: "#00FF00",
    fontSize: 20,
    fontWeight: "bold",
  },
  email: {
    color: "#888888",
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: "#FF4444",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 12,
  },
  section: {
    backgroundColor: "#111111",
    margin: 10,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333333",
  },
  bio: {
    fontSize: 16,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  statsGrid: {
    flexDirection: "row",
    padding: 15,
    backgroundColor: "#111111",
    margin: 10,
    borderRadius: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 10,
  },
  statNumber: {
    color: "#00FF00",
    fontSize: 20,
    fontWeight: "bold",
  },
  statLabel: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    backgroundColor: "#222222",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 5,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
  },
  videoCard: {
    width: 160,
    marginRight: 12,
  },
  videoThumbnail: {
    width: 160,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#333333",
  },
  videoTitle: {
    marginTop: 8,
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  retryButton: {
    backgroundColor: "#00FF00",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
  },
});
