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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { gql, useQuery, useMutation } from "@apollo/client";
import { BlurView } from "expo-blur";

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
  const [selectedMember, setSelectedMember] = useState(null);

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
      ],
    );
  };

  const neighborhood = data?.neighborhood;
  const pendingRequests = neighborhood?.joinRequests?.filter(
    (request) => request.status === "pending",
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
            <TouchableOpacity
              key={member.user.id}
              style={styles.memberCard}
              onPress={() => setSelectedMember(member)}
            >
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
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Member Profile Modal */}
      {selectedMember && (
        <Modal visible={true} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <BlurView intensity={50} tint="dark" style={styles.modalContent}>
              <Image
                source={{ uri: selectedMember.user.profilePhoto }}
                style={styles.modalAvatar}
              />
              <Text style={styles.modalName}>
                {selectedMember.user.username}
              </Text>
              <Text style={styles.modalRole}>{selectedMember.role}</Text>

              <TouchableOpacity
                style={styles.modalMessageButton}
                onPress={() => {
                  Alert.alert("Coming Soon", "Direct messages coming soon!");
                }}
              >
                <Text style={styles.modalMessageText}>💬 Message</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedMember(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#130720",
    padding: 20,
  },
  loadingText: {
    color: "#00ffff",
    fontSize: 16,
  },
  errorText: {
    color: "#151159",
    fontSize: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00ffff",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00ffff",
  },
  title: {
    fontSize: 18,
    color: "#00ffff",
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
    color: "#00ffff",
    marginHorizontal: 15,
    marginVertical: 10,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C0A2E",
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
    backgroundColor: "#1C0A2E",
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
    color: "#F5F2FA",
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
    color: "#130720",
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
    color: "#F5F2FA",
    fontWeight: "bold",
    fontSize: 16,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalContent: {
    width: 300,
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.3)",
  },
  modalAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
  },
  modalName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 5,
  },
  modalRole: {
    fontSize: 16,
    color: "#ff8000",
    marginBottom: 20,
  },
  modalMessageButton: {
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  modalMessageText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  modalCloseButton: {
    backgroundColor: "#333",
    padding: 10,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: "#130720",
    fontWeight: "bold",
  },
});
