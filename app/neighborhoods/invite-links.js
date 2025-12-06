// app/neighborhoods/invite-links.js
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Clipboard,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_NEIGHBORHOOD_INVITE_LINKS,
  CREATE_INVITE_LINK,
  UPDATE_INVITE_LINK,
  DELETE_INVITE_LINK,
} from "../graphql/queries";

export default function InviteLinksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const neighborhoodId = params.neighborhoodId;

  const { loading, data, refetch } = useQuery(GET_NEIGHBORHOOD_INVITE_LINKS, {
    variables: { neighborhoodId },
  });

  const [createInviteLink] = useMutation(CREATE_INVITE_LINK);
  const [updateInviteLink] = useMutation(UPDATE_INVITE_LINK);
  const [deleteInviteLink] = useMutation(DELETE_INVITE_LINK);

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedLink, setSelectedLink] = useState(null);

  // Create form state
  const [linkName, setLinkName] = useState("Invite Link");
  const [maxUses, setMaxUses] = useState("0");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [role, setRole] = useState("member");
  // app/neighborhoods/invite-links.js - Update handleCreateLink
  const handleCreateLink = async () => {
    console.log("handleCreateLink called");
    try {
      // Parse values
      const expiresInDaysValue = expiresInDays.trim();
      const maxUsesValue = parseInt(maxUses) || 0;

      console.log("Parsed values:", {
        expiresInDays: expiresInDaysValue,
        maxUses: maxUsesValue,
      });

      // Validate maxUses
      if (maxUsesValue < 0) {
        Alert.alert("Error", "Max uses cannot be negative");
        return;
      }

      // Prepare variables for GraphQL
      const variables = {
        neighborhoodId,
        name: linkName,
        maxUses: maxUsesValue,
        role,
      };

      // Only add expiresInDays if it's a valid number > 0
      if (expiresInDaysValue !== "") {
        const days = parseInt(expiresInDaysValue);
        if (!isNaN(days) && days > 0) {
          variables.expiresInDays = days;
        } else if (days === 0) {
          Alert.alert(
            "Error",
            "Expiration days must be greater than 0, or leave empty for no expiration"
          );
          return;
        }
      }

      console.log("Sending variables:", variables);

      // Use update function to manually update the cache
      const result = await createInviteLink({
        variables: variables,
        update: (cache, { data: { createInviteLink: newLink } }) => {
          // Read the existing data from cache
          const existingData = cache.readQuery({
            query: GET_NEIGHBORHOOD_INVITE_LINKS,
            variables: { neighborhoodId },
          });

          if (existingData && existingData.neighborhoodInviteLinks) {
            // Write back to cache with the new link added
            cache.writeQuery({
              query: GET_NEIGHBORHOOD_INVITE_LINKS,
              variables: { neighborhoodId },
              data: {
                neighborhoodInviteLinks: [
                  newLink,
                  ...existingData.neighborhoodInviteLinks,
                ],
              },
            });
          }
        },
        // Also refetch to ensure we have the latest data
        refetchQueries: [
          {
            query: GET_NEIGHBORHOOD_INVITE_LINKS,
            variables: { neighborhoodId },
          },
        ],
      });

      console.log("Create invite link result:", result);

      Alert.alert("Success", "Invite link created!");
      setIsCreateModalVisible(false);
      resetForm();

      // Manually refetch to ensure UI is updated
      await refetch();
    } catch (error) {
      console.error("Error creating invite link:", error);
      console.error(
        "Error details:",
        error.message,
        error.graphQLErrors,
        error.networkError
      );
      Alert.alert("Error", error.message || "Failed to create invite link");
    }
  };

  const handleCopyLink = (url) => {
    Clipboard.setString(url);
    Alert.alert("Copied!", "Invite link copied to clipboard");
  };

  const handleDeleteLink = (linkId) => {
    Alert.alert(
      "Delete Invite Link",
      "Are you sure you want to delete this invite link? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteInviteLink({
                variables: { linkId },
                refetchQueries: [
                  {
                    query: GET_NEIGHBORHOOD_INVITE_LINKS,
                    variables: { neighborhoodId },
                  },
                ],
              });
              Alert.alert("Success", "Invite link deleted");
            } catch (error) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleLinkActive = async (link) => {
    try {
      await updateInviteLink({
        variables: {
          linkId: link.id,
          isActive: !link.isActive,
        },
        refetchQueries: [
          {
            query: GET_NEIGHBORHOOD_INVITE_LINKS,
            variables: { neighborhoodId },
          },
        ],
      });
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const resetForm = () => {
    setLinkName("Invite Link");
    setMaxUses("0");
    setExpiresInDays("");
    setRole("member");
  };

  // Update the renderInviteLinkItem function to show all data
  const renderInviteLinkItem = ({ item }) => {
    const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
    const isMaxUses = item.maxUses > 0 && item.uses >= item.maxUses;
    const isActive = item.isActive && !isExpired && !isMaxUses;

    return (
      <View style={[styles.linkItem, !isActive && styles.disabledLinkItem]}>
        <View style={styles.linkHeader}>
          <Text style={styles.linkName}>{item.name}</Text>
          <View style={styles.linkStatusContainer}>
            {!item.isActive && (
              <Text style={styles.statusBadgeInactive}>Inactive</Text>
            )}
            {isExpired && (
              <Text style={styles.statusBadgeExpired}>Expired</Text>
            )}
            {isMaxUses && (
              <Text style={styles.statusBadgeMaxUses}>Max Uses</Text>
            )}
            <Text style={styles.linkRole}>{item.role}</Text>
          </View>
        </View>

        <Text style={styles.linkUrl} numberOfLines={1} selectable={true}>
          {item.url || `https://yourapp.com/join/${item.code}`}
        </Text>

        <Text style={styles.linkCode}>Code: {item.code}</Text>

        <View style={styles.linkStats}>
          <Text style={styles.linkStat}>
            Uses: {item.uses}
            {item.maxUses > 0 ? `/${item.maxUses}` : ""}
          </Text>
          {item.expiresAt && (
            <Text style={styles.linkStat}>
              Expires: {new Date(item.expiresAt).toLocaleDateString()}
            </Text>
          )}
          <Text style={styles.linkStat}>
            Created: {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>

        {item.createdBy && (
          <Text style={styles.createdBy}>
            Created by: {item.createdBy.username}
          </Text>
        )}

        <View style={styles.linkActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              handleCopyLink(
                item.url || `https://yourapp.com/join/${item.code}`
              )
            }
          >
            <Text style={styles.actionButtonText}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              handleShareLink(
                item.url || `https://yourapp.com/join/${item.code}`,
                item.name
              )
            }
          >
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleToggleLinkActive(item)}
          >
            <Text style={styles.actionButtonText}>
              {item.isActive ? "Disable" : "Enable"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteLink(item.id)}
          >
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00ffff" />
      </View>
    );
  }

  const links = data?.neighborhoodInviteLinks || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Links</Text>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subHeaderText}>
          Create shareable links to invite people to your neighborhood
        </Text>
      </View>

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setIsCreateModalVisible(true)}
      >
        <Text style={styles.createButtonText}>+ Create New Invite Link</Text>
      </TouchableOpacity>

      {links.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No invite links yet</Text>
          <Text style={styles.emptySubtext}>
            Create your first invite link to share with others
          </Text>
        </View>
      ) : (
        <FlatList
          data={links}
          keyExtractor={(item) => item.id}
          renderItem={renderInviteLinkItem}
          style={styles.linksList}
          refreshing={loading}
          onRefresh={refetch}
        />
      )}

      {/* Create Link Modal */}
      <Modal
        visible={isCreateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Invite Link</Text>
              <TouchableOpacity
                onPress={() => setIsCreateModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Link Name</Text>
              <TextInput
                style={styles.textInput}
                value={linkName}
                onChangeText={setLinkName}
                placeholder="e.g., Team Invite, Community Link"
              />

              <Text style={styles.inputLabel}>Max Uses (0 = unlimited)</Text>
              <TextInput
                style={styles.textInput}
                value={maxUses}
                onChangeText={setMaxUses}
                keyboardType="numeric"
                placeholder="0"
              />

              <Text style={styles.inputLabel}>Expires In Days (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={expiresInDays}
                onChangeText={setExpiresInDays}
                keyboardType="numeric"
                placeholder="7"
              />

              <Text style={styles.inputLabel}>Role for New Members</Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === "member" && styles.roleButtonSelected,
                  ]}
                  onPress={() => setRole("member")}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === "member" && styles.roleButtonTextSelected,
                    ]}
                  >
                    Member
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === "moderator" && styles.roleButtonSelected,
                  ]}
                  onPress={() => setRole("moderator")}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === "moderator" && styles.roleButtonTextSelected,
                    ]}
                  >
                    Moderator
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleCreateLink}
              >
                <Text style={styles.submitButtonText}>Create Invite Link</Text>
                          </TouchableOpacity>
<TouchableOpacity
  style={styles.debugButton}
  onPress={() => {
    console.log("Current data:", data);
    console.log("Links:", data?.neighborhoodInviteLinks);
    console.log("Number of links:", data?.neighborhoodInviteLinks?.length);
  }}
>
  <Text style={styles.debugButtonText}>Debug</Text>
</TouchableOpacity>


            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    color: "#00ffff",
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00ffff",
    flex: 1,
  },
  subHeader: {
    marginBottom: 25,
  },
  subHeaderText: {
    fontSize: 16,
    color: "#888",
  },
  createButton: {
    backgroundColor: "#00ffff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  createButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
  linksList: {
    flex: 1,
  },
  linkItem: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#333",
  },
  disabledLinkItem: {
    opacity: 0.7,
    borderColor: "#555",
  },
  linkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  linkName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    flex: 1,
  },
  linkStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadgeInactive: {
    backgroundColor: "#555",
    color: "#FFF",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeExpired: {
    backgroundColor: "#FF4444",
    color: "#FFF",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeMaxUses: {
    backgroundColor: "#FFA500",
    color: "#FFF",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  linkRole: {
    fontSize: 12,
    color: "#00AA00",
    backgroundColor: "#113300",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  linkUrl: {
    fontSize: 14,
    color: "#888",
    marginBottom: 10,
    fontFamily: "monospace",
  },
  linkStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  linkStat: {
    fontSize: 12,
    color: "#CCC",
  },
  linkActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#333",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: "#550000",
  },
  deleteButtonText: {
    color: "#FF8888",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: "#FFF",
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: "#FFF",
    fontSize: 24,
  },
  modalBody: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 16,
    color: "#FFF",
    marginBottom: 8,
    marginTop: 15,
  },
  textInput: {
    backgroundColor: "#222",
    color: "#FFF",
    padding: 12,
    borderRadius: 6,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  roleButtons: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  roleButton: {
    flex: 1,
    backgroundColor: "#222",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  roleButtonSelected: {
    backgroundColor: "#00ffff",
    borderColor: "#00ffff",
  },
  roleButtonText: {
    color: "#FFF",
    fontSize: 14,
  },
  roleButtonTextSelected: {
    color: "#000",
    fontWeight: "bold",
  },
  submitButton: {
    backgroundColor: "#00ffff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Add to styles
  debugButton: {
    backgroundColor: "#FF8800",
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  debugButtonText: {
    color: "#FFF",
    textAlign: "center",
  },
});
