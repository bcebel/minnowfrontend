import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gql, useQuery } from "@apollo/client";
import { themes } from "../theme";

// GraphQL Query
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

  // Use ONE theme directly
  const theme = themes.bubblefusion2.dark;

  // Auth check
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

  // GraphQL query
  const { loading, error, data, refetch } = useQuery(GET_MY_PROFILE, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  // Handle logout
  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "username"]);
    router.replace("/login");
  };

  // Not authenticated yet
  if (!isAuthenticated) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.tint} />
        <Text style={[styles.loadingText, { color: theme.typography }]}>
          Checking authentication...
        </Text>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.tint} />
        <Text style={[styles.loadingText, { color: theme.typography }]}>
          Loading your profile...
        </Text>
        {username && (
          <Text style={[styles.welcomeText, { color: theme.typography }]}>
            Welcome back, @{username}! 👋
          </Text>
        )}
      </View>
    );
  }

  // Error state
  if (error) {
    console.error("Home GraphQL Error:", error);

    if (error.message.includes("Authentication")) {
      AsyncStorage.multiRemove(["token", "username"]).then(() => {
        Alert.alert("Session Expired", "Please log in again", [
          { text: "OK", onPress: () => router.replace("/login") },
        ]);
      });
      return null;
    }

    return (
      <View
        style={[styles.centerContainer, { backgroundColor: theme.background }]}
      >
        <Text style={[styles.errorText, { color: theme.accents.apple }]}>
          Error loading profile
        </Text>
        <Text style={[styles.errorDetail, { color: theme.typography }]}>
          {error.message}
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryButton, { backgroundColor: theme.tint }]}
        >
          <Text style={[styles.retryText, { color: theme.background }]}>
            Retry
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLogout}
          style={[
            styles.logoutButton,
            { backgroundColor: theme.accents.apple },
          ]}
        >
          <Text style={[styles.logoutButtonText, { color: theme.background }]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No data state
  if (!data?.me) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: theme.background }]}
      >
        <Text style={[styles.errorText, { color: theme.accents.apple }]}>
          No profile data found
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryButton, { backgroundColor: theme.tint }]}
        >
          <Text style={[styles.retryText, { color: theme.background }]}>
            Retry
          </Text>
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
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.foreground }]}>
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: safeUser.profilePhoto }}
            style={styles.profileImage}
          />
          <View style={styles.profileInfo}>
            <Text style={[styles.welcome, { color: theme.typography }]}>
              Welcome back,
            </Text>
            <Text style={[styles.username, { color: theme.tint }]}>
              @{safeUser.username}
            </Text>
            <Text style={[styles.email, { color: theme.typography }]}>
              {safeUser.email}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={[
            styles.logoutButton,
            { backgroundColor: theme.accents.apple },
          ]}
        >
          <Text style={[styles.logoutButtonText, { color: theme.background }]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bio */}
      {safeUser.bio && (
        <View style={[styles.section, { backgroundColor: theme.foreground }]}>
          <Text style={[styles.bio, { color: theme.typography }]}>
            {safeUser.bio}
          </Text>
        </View>
      )}

      {/* Stats Grid */}
      <View style={[styles.statsGrid, { backgroundColor: theme.foreground }]}>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: theme.tint }]}>
            {safeUser.videos.length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.typography }]}>
            Videos
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: theme.tint }]}>
            {safeUser.posts.length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.typography }]}>
            Posts
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: theme.tint }]}>
            {safeUser.groups.length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.typography }]}>
            Groups
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: theme.tint }]}>
            {totalLinkClicks}
          </Text>
          <Text style={[styles.statLabel, { color: theme.typography }]}>
            Link Clicks
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={[styles.section, { backgroundColor: theme.foreground }]}>
        <Text style={[styles.sectionTitle, { color: theme.tint }]}>
          Quick Actions
        </Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.background }]}
            onPress={() => router.push("/upload")}
          >
            <Text style={styles.actionIcon}>🎥</Text>
            <Text style={[styles.actionText, { color: theme.typography }]}>
              Upload Video
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.background }]}
            onPress={() => router.push("/create-post")}
          >
            <Text style={styles.actionIcon}>📝</Text>
            <Text style={[styles.actionText, { color: theme.typography }]}>
              Create Post
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.background }]}
            onPress={() => router.push("/go-live")}
          >
            <Text style={styles.actionIcon}>🔴</Text>
            <Text style={[styles.actionText, { color: theme.typography }]}>
              Go Live
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Videos */}
      {safeUser.videos.length > 0 && (
        <View style={[styles.section, { backgroundColor: theme.foreground }]}>
          <Text style={[styles.sectionTitle, { color: theme.tint }]}>
            Recent Videos
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {safeUser.videos.slice(0, 5).map((video) => (
              <TouchableOpacity
                key={video.id}
                style={[
                  styles.videoCard,
                  { backgroundColor: theme.background },
                ]}
              >
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
                <Text
                  style={[styles.videoTitle, { color: theme.typography }]}
                  numberOfLines={2}
                >
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  welcomeText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetail: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
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
  },
  profileInfo: {
    flex: 1,
  },
  welcome: {
    fontSize: 14,
  },
  username: {
    fontSize: 20,
    fontWeight: "bold",
  },
  email: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  logoutButtonText: {
    fontWeight: "bold",
    fontSize: 12,
  },
  section: {
    margin: 10,
    padding: 15,
    borderRadius: 12,
  },
  bio: {
    fontSize: 16,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: "row",
    padding: 15,
    margin: 10,
    borderRadius: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 10,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
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
    fontSize: 12,
    textAlign: "center",
  },
  videoCard: {
    width: 160,
    marginRight: 12,
    padding: 8,
    borderRadius: 8,
  },
  videoThumbnail: {
    width: 160,
    height: 100,
    borderRadius: 8,
  },
  videoTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "500",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
  },
  retryText: {
    fontWeight: "bold",
  },
});
