// app/neighborhood-members.js
import React, { useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { gql, useQuery, useMutation } from "@apollo/client";

// GraphQL Queries
const GET_NEIGHBORHOOD_DETAILS = gql`
  query GetNeighborhoodDetails($id: ID!) {
    neighborhood(id: $id) {
      id
      name
      description
      type
      owner {
        id
        username
        profilePhoto
      }
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
      joinRequests {
        user {
          id
          username
          profilePhoto
        }
        requestedAt
        status
      }
    }
  }
`;

// GraphQL Mutations
const APPROVE_JOIN_REQUEST = gql`
  mutation ApproveJoinRequest($neighborhoodId: ID!, $userId: ID!) {
    approveJoinRequest(neighborhoodId: $neighborhoodId, userId: $userId) {
      id
      members {
        user {
          id
          username
        }
        role
      }
      joinRequests {
        user {
          id
          username
        }
        status
      }
    }
  }
`;

const REMOVE_MEMBER = gql`
  mutation RemoveMember($neighborhoodId: ID!, $userId: ID!) {
    removeMember(neighborhoodId: $neighborhoodId, userId: $userId) {
      id
      members {
        user {
          id
          username
        }
        role
      }
    }
  }
`;

export default function NeighborhoodMembersScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const neighborhoodId = params.neighborhoodId;

  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useQuery(GET_NEIGHBORHOOD_DETAILS, {
    variables: { id: neighborhoodId },
  });

  const [approveJoinRequest] = useMutation(APPROVE_JOIN_REQUEST);
  const [removeMember] = useMutation(REMOVE_MEMBER);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleApproveRequest = async (userId) => {
    try {
      await approveJoinRequest({
        variables: {
          neighborhoodId,
          userId,
        },
      });
      Alert.alert("Success", "Join request approved!");
      refetch();
    } catch (err) {
      Alert.alert("Error", "Failed to approve request");
    }
  };

  const handleRemoveMember = async (userId, username) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember({
                variables: {
                  neighborhoodId,
                  userId,
                },
              });
              Alert.alert("Success", "Member removed");
              refetch();
            } catch (err) {
              Alert.alert("Error", "Failed to remove member");
            }
          },
        },
      ]
    );
  };

  const neighborhood = data?.neighborhood;
  const pendingRequests = neighborhood?.joinRequests?.filter(
    (request) => request.status === "pending"
  );
  const members = neighborhood?.members || [];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading members</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏘️ {neighborhood?.name} - Members</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Pending Join Requests */}
        {pendingRequests && pendingRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Pending Join Requests ({pendingRequests.length})
            </Text>
            {pendingRequests.map((request) => (
              <View key={request.user.id} style={styles.requestCard}>
                <Image
                  source={{ uri: request.user.profilePhoto }}
                  style={styles.avatar}
                />
                <View style={styles.userInfo}>
                  <Text style={styles.username}>{request.user.username}</Text>
                  <Text style={styles.requestDate}>
                    Requested:{" "}
                    {new Date(request.requestedAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleApproveRequest(request.user.id)}
                  >
                    <Text style={styles.approveButtonText}>✓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Members List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          {members.map((member) => (
            <View key={member.user.id} style={styles.memberCard}>
              <Image
                source={{ uri: member.user.profilePhoto }}
                style={styles.avatar}
              />
              <View style={styles.userInfo}>
                <Text style={styles.username}>
                  {member.user.username}
                  {member.role === "owner" && " 👑"}
                  {member.role === "moderator" && " ⭐"}
                </Text>
                <Text style={styles.memberInfo}>
                  {member.role} • Joined{" "}
                  {new Date(member.joinedAt).toLocaleDateString()}
                </Text>
              </View>
              {member.role !== "owner" && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() =>
                    handleRemoveMember(member.user.id, member.user.username)
                  }
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
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
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00FF00",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00FF00",
  },
  title: {
    fontSize: 18,
    color: "#00FF00",
    fontWeight: "bold",
  },
  headerSpacer: {
    width: 40, // Balance the header
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00FF00",
    marginHorizontal: 15,
    marginVertical: 10,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    marginHorizontal: 15,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#FFAA00",
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    marginHorizontal: 15,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  requestDate: {
    color: "#888888",
    fontSize: 12,
  },
  memberInfo: {
    color: "#888888",
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
  },
  approveButton: {
    backgroundColor: "#00AA00",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  approveButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 16,
  },
  removeButton: {
    backgroundColor: "#AA0000",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  removeButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
  },
  retryButton: {
    backgroundColor: "#00FF00",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
  },
});
