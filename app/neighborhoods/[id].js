// app/neighborhoods/[id].js
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@apollo/client";
import { GET_NEIGHBORHOOD } from "../graphql/queries";
import WebTorrentPlayer from "../../components/WebTorrentPlayer"; // Add this import

// ADD THIS FUNCTION - Generates static pages for each neighborhood
export async function generateStaticParams() {
  // You'll need to fetch neighborhood IDs from your API
  // For now, return some sample IDs or fetch from a static list
  const neighborhoodIds = await getNeighborhoodIds(); // You'll need to implement this

  return neighborhoodIds.map((id) => ({ id }));
}

// Helper function to get neighborhood IDs (you'll need to implement this)
async function getNeighborhoodIds() {
  // Option 1: Hardcode some IDs for testing
  // return ['photography', 'music', 'art', 'tech'];

  // Option 2: Fetch from your API (if available during build)
  try {
    const response = await fetch("https://your-api.com/neighborhoods/ids");
    const data = await response.json();
    return data.ids;
  } catch (error) {
    // Fallback to hardcoded IDs
    return ["photography", "music", "art", "tech"];
  }
}

export default function NeighborhoodDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { loading, error, data } = useQuery(GET_NEIGHBORHOOD, {
    variables: { id },
  });

  if (loading) return <ActivityIndicator size="large" style={styles.loading} />;
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const neighborhood = data?.neighborhood;

  if (!neighborhood) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Neighborhood not found</Text>
      </View>
    );
  }

  // ADD THIS - Sample neighborhood content for P2P seeding
  const neighborhoodContent = {
    photography: [
      {
        fileName: "Photography Tips Tutorial.mp4",
        magnetLink: "magnet:?xt=urn:btih:...",
        cid: "...",
      },
      {
        fileName: "Sunset Composition Guide.mov",
        magnetLink: "magnet:?xt=urn:btih:...",
        cid: "...",
      },
    ],
    music: [
      {
        fileName: "Guitar Basics Lesson.mp4",
        magnetLink: "magnet:?xt=urn:btih:...",
        cid: "...",
      },
    ],
    art: [
      {
        fileName: "Digital Painting Techniques.mp4",
        magnetLink: "magnet:?xt=urn:btih:...",
        cid: "...",
      },
    ],
    tech: [
      {
        fileName: "Web Development Workshop.mov",
        magnetLink: "magnet:?xt=urn:btih:...",
        cid: "...",
      },
    ],
  };

  const renderMember = ({ item }) => (
    <TouchableOpacity
      style={styles.memberItem}
      onPress={() => router.push(`/profile/${item.user.username}`)}
    >
      <Image
        source={{
          uri: item.user.profilePhoto || "https://via.placeholder.com/40",
        }}
        style={styles.avatar}
      />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {item.user.username}
          {item.role === "owner" && " 👑"}
        </Text>
        {/* Show bio if it exists */}
        {item.user.bio ? (
          <Text style={styles.memberBio} numberOfLines={2}>
            {item.user.bio}
          </Text>
        ) : (
          <Text style={styles.noBio}>No bio yet</Text>
        )}
        <Text style={styles.memberRole}>
          {item.role} • Joined {new Date(item.joinedAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{neighborhood.name}</Text>
        <Text style={styles.type}>{neighborhood.type} neighborhood</Text>
        <Text style={styles.description}>{neighborhood.description}</Text>

        <View style={styles.stats}>
          <Text style={styles.stat}>
            👥 {neighborhood.members?.length || 0} members
          </Text>
          <Text style={styles.stat}>
            🗓️ Created {new Date(neighborhood.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {/* ADD THIS SECTION - Neighborhood P2P Content */}
      <View style={styles.p2pSection}>
        <Text style={styles.sectionTitle}>🌐 P2P Shared Content</Text>
        <Text style={styles.p2pDescription}>
          This neighborhood page actively seeds content to the P2P network
        </Text>

        {(neighborhoodContent[id] || []).map((video, index) => (
          <WebTorrentPlayer key={index} video={video} />
        ))}

        {(neighborhoodContent[id] || []).length === 0 && (
          <Text style={styles.noContent}>
            No P2P content yet for this neighborhood
          </Text>
        )}
      </View>

      {neighborhood.rules ? (
        <View style={styles.rulesSection}>
          <Text style={styles.sectionTitle}>📜 Community Rules</Text>
          <Text style={styles.rules}>{neighborhood.rules}</Text>
        </View>
      ) : null}

      <View style={styles.membersSection}>
        <Text style={styles.sectionTitle}>👥 Members</Text>
        <FlatList
          data={neighborhood.members}
          keyExtractor={(item) => item.user.username}
          renderItem={renderMember}
          style={styles.membersList}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() =>
            router.push(
              `/neighborhoods/neighborhood-chat?neighborhoodId=${neighborhood.id}`
            )
          }
        >
          <Text style={styles.chatButtonText}>💬 Open Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back to List</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
    padding: 20,
  },
  loading: {
    marginTop: 50,
  },
  error: {
    color: "#151159",
    textAlign: "center",
    marginTop: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
  },
  type: {
    fontSize: 16,
    color: "#00AA00",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: "#CCC",
    marginBottom: 16,
    lineHeight: 22,
  },
  stats: {
    flexDirection: "row",
    gap: 15,
  },
  stat: {
    fontSize: 14,
    color: "#00AA00",
  },
  // ADD THESE NEW STYLES
  p2pSection: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#00AA00",
  },
  p2pDescription: {
    fontSize: 14,
    color: "#CCC",
    marginBottom: 10,
    lineHeight: 18,
  },
  noContent: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  rulesSection: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 10,
  },
  rules: {
    fontSize: 14,
    color: "#CCC",
    lineHeight: 20,
  },
  membersSection: {
    flex: 1,
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#111",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 12,
    color: "#00AA00",
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  chatButton: {
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  chatButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  backButton: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  memberBio: {
    fontSize: 14,
    color: "#CCC",
    marginBottom: 4,
    lineHeight: 18,
  },
  noBio: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 4,
  },
});
