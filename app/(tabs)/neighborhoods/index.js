// app/neighborhoods/index.js
import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { Link } from "expo-router";
import {
  GET_NEIGHBORHOODS,
  MY_NEIGHBORHOODS,
  JOIN_NEIGHBORHOOD,
  LEAVE_NEIGHBORHOOD,
} from "../../graphql/queries";

export default function NeighborhoodsScreen() {
  const router = useRouter();

  // Use MY_NEIGHBORHOODS query instead of GET_NEIGHBORHOODS
const { loading, error, data, refetch } = useQuery(MY_NEIGHBORHOODS, {
  fetchPolicy: "cache-and-network", // Check cache first, but always update from server
  nextFetchPolicy: "network-only", // Future calls go straight to server
});

  const [joinNeighborhood] = useMutation(JOIN_NEIGHBORHOOD);
  const [leaveNeighborhood] = useMutation(LEAVE_NEIGHBORHOOD);

  const handleJoinNeighborhood = async (neighborhoodId) => {
    try {
      await joinNeighborhood({
        variables: { neighborhoodId },
        refetchQueries: [{ query: MY_NEIGHBORHOODS }],
      });
      alert("✅ Joined neighborhood!");
    } catch (err) {
      if (err.message.includes("already a member")) {
        alert("✅ You are already a member of this neighborhood!");
      } else if (err.message.includes("personal neighborhoods")) {
        alert("🔒 This is a personal neighborhood - cannot join");
      } else {
        alert(`Join failed: ${err.message}`);
      }
    }
  };

  const handleLeaveNeighborhood = async (neighborhoodId) => {
    try {
      await leaveNeighborhood({
        variables: { neighborhoodId },
        refetchQueries: [{ query: MY_NEIGHBORHOODS }],
      });
      alert("👋 Left neighborhood");
    } catch (err) {
      alert(`Leave failed: ${err.message}`);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={styles.loading} />;
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const neighborhoods = data?.myNeighborhoods || [];

  const renderItem = ({ item }) => {
    return (
      <View style={styles.neighborhoodItem}>
        <Text style={styles.neighborhoodName}>{item.name}</Text>
        <Text style={styles.neighborhoodType}>
          {item.type} • {item.members?.length || 0} members
          <Text style={styles.memberBadge}> • ✅ You are a member</Text>
        </Text>
        <Text style={styles.neighborhoodDescription}>{item.description}</Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={() => handleLeaveNeighborhood(item.id)}
          >
            <Text style={styles.leaveButtonText}>Leave</Text>
          </TouchableOpacity>

          <Link
            href={`/neighborhoods/bubbles/neighborhood-chat?neighborhoodId=${item.id}`}
            asChild
          >
            <TouchableOpacity style={styles.viewButton}>
              <Text style={styles.viewButtonText}>View</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🏘️ My Bubbles</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.push(`/bubbles/all`)} // You'll need to create this page
        >
          <Text style={styles.browseButtonText}>
            🔍 Browse All Bubbles
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push(`/bubbles/create`)}
        >
          <Text style={styles.createButtonText}>
            ➕ Create New Bubble
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        {neighborhoods.length} bubble(s) you're a member of
      </Text>

      {neighborhoods.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            You haven't joined any bubbles yet.
          </Text>
          <Text style={styles.emptyStateSubtext}>
            Join bubbles to see them listed here.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push(`/bubbles/all`)}
          >
            <Text style={styles.browseButtonText}>
              Browse Bubbles to Join
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={neighborhoods}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={loading}
          onRefresh={refetch}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#130720",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#00AA00",
    marginBottom: 20,
  },
  actions: {
    flexDirection: "column",
    gap: 10,
    marginBottom: 20,
  },
  browseButton: {
    backgroundColor: "#333",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  browseButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  createButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  createButtonText: {
    color: "#130720",
    fontWeight: "bold",
  },
  neighborhoodItem: {
    backgroundColor: "#130720",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#130720",
  },
  neighborhoodName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 4,
  },
  neighborhoodType: {
    fontSize: 12,
    color: "#00AA00",
    marginBottom: 8,
  },
  memberBadge: {
    color: "#B8B0C9",
  },
  neighborhoodDescription: {
    fontSize: 14,
    color: "#CCC",
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 10,
  },
  viewButton: {
    backgroundColor: "#130720",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    alignItems: "center",
  },
  viewButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  leaveButton: {
    backgroundColor: "#151159",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    alignItems: "center",
  },
  leaveButtonText: {
    color: "#F5F2FA",
    fontWeight: "bold",
  },
  loading: {
    marginTop: 50,
  },
  error: {
    color: "#151159",
    textAlign: "center",
    marginTop: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: "#130720",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 20,
  },
  emptyStateText: {
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
});
