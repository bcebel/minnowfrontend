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
    backgroundColor: "#000",
    padding: 20,
  },
  loading: {
    marginTop: 50,
  },
  error: {
    color: "#FF4444",
    textAlign: "center",
    marginTop: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00FF00",
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
    color: "#00FF00",
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
    color: "#00FF00",
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
    backgroundColor: "#00FF00",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  chatButtonText: {
    color: "#000",
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
    color: "#00FF00",
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
