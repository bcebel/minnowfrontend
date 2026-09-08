// app/neighborhoods/[id].js
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, gql } from "@apollo/client";
import { GET_NEIGHBORHOOD } from "../../../graphql/queries";

const GET_CURRENT_USER = gql`
  query GetMe {
    me {
      id
      username
    }
  }
`;

export default function NeighborhoodDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { loading, error, data } = useQuery(GET_NEIGHBORHOOD, {
    variables: { id },
  });

  const { data: userData } = useQuery(GET_CURRENT_USER);
  const [username, setUsername] = useState("");

  useEffect(() => {
    AsyncStorage.getItem("username").then((saved) => setUsername(saved || ""));
  }, []);

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

  // ✅ Check if current user can invite (Owner or Moderator)
  const canInvite = (() => {
    if (!neighborhood || !username) return false;

    const isOwner = neighborhood.owner?.username === username;
    const member = neighborhood.members?.find(
      (m) => m.user?.username === username,
    );
    const isModerator =
      member?.role === "moderator" || member?.role === "admin";

    return isOwner || isModerator;
  })();

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

      {/* ✅ BUBBLE HUB MENU */}
      <View style={styles.hubMenu}>
        <Text style={styles.sectionTitle}>🫧 Enter the Bubble</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.hubButton}
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-postfeed?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.hubButtonText}>📝 Posts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hubButton}
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-chat?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.hubButtonText}>💬 Chat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.hubButton}
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-gallery?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.hubButtonText}>🖼️ Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hubButton}
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-members?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.hubButtonText}>👥 Members</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ Invite ONLY if user has permission */}
        {canInvite && (
          <TouchableOpacity
            style={styles.hubButton}
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/invite-links?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.hubButtonText}>📧 Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Members Section */}
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
  // ✅ BUBBLE HUB STYLES
  hubMenu: {
    backgroundColor: "#1C0A2E",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#00ffff",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  hubButton: {
    flex: 1,
    backgroundColor: "#00ffff",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 5,
  },
  hubButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  // ✅ MEMBERS SECTION
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
});
