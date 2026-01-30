// app/join/[code].js
import React, { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Button,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";

const VALIDATE_INVITE_LINK = gql`
  query ValidateInviteLink($code: String!) {
    validateInviteLink(code: $code) {
      isValid
      message
      link {
        id
        code
        name
        maxUses
        uses
        expiresAt
        role
        isActive
        createdAt
      }
      neighborhood {
        id
        name
        description
        type
        owner {
          id
          username
          profilePhoto
        }
        memberCount
      }
    }
  }
`;

const JOIN_VIA_INVITE_LINK = gql`
  mutation JoinViaInviteLink($code: String!) {
    joinViaInviteLink(code: $code) {
      success
      message
      error
      neighborhood {
        id
        name
        description
        type
        owner {
          id
          username
          profilePhoto
        }
        memberCount
      }
    }
  }
`;

export default function JoinViaLinkScreen() {
  const params = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();
  const code = params.code;

  const [isJoining, setIsJoining] = useState(false);

  const { loading, data, error } = useQuery(VALIDATE_INVITE_LINK, {
    variables: { code },
    skip: !code,
    fetchPolicy: "network-only", // Always get fresh data
  });

  const [joinViaInviteLink] = useMutation(JOIN_VIA_INVITE_LINK, {
    onCompleted: (data) => {
      setIsJoining(false);
      if (data.joinViaInviteLink.success) {
        Alert.alert("Success!", data.joinViaInviteLink.message, [
          {
            text: "Go to Neighborhood",
            onPress: () => {
              // Navigate to the neighborhood
              router.push(
                `/bubbles/${data.joinViaInviteLink.neighborhood.id}`
              );
            },
          },
        ]);
      } else {
        Alert.alert("Error", data.joinViaInviteLink.message);
      }
    },
    onError: (error) => {
      setIsJoining(false);
      Alert.alert("Error", error.message);
    },
  });

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      await joinViaInviteLink({
        variables: { code },
      });
    } catch (err) {
      setIsJoining(false);
      console.error("Join error:", err);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Validating invite link...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error loading invite link</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <Text>No data received</Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  const { validateInviteLink } = data;

  if (!validateInviteLink.isValid) {
    return (
      <View style={styles.container}>
        <Text style={styles.invalidText}>Invalid Invite Link</Text>
        <Text style={styles.messageText}>{validateInviteLink.message}</Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  const { link, neighborhood } = validateInviteLink;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Join {neighborhood.name}</Text>
        <Text style={styles.description}>{neighborhood.description}</Text>
      </View>

      <View style={styles.neighborhoodInfo}>
        <Text style={styles.infoTitle}>Neighborhood Info</Text>
        <Text>Type: {neighborhood.type}</Text>
        <Text>Members: {neighborhood.memberCount}</Text>
        <Text>Owner: {neighborhood.owner.username}</Text>
      </View>

      {link && (
        <View style={styles.linkInfo}>
          <Text style={styles.infoTitle}>Invite Details</Text>
          <Text>Name: {link.name}</Text>
          <Text>Role: {link.role}</Text>
          <Text>
            Uses: {link.uses}/{link.maxUses || "Unlimited"}
          </Text>
          {link.expiresAt && (
            <Text>
              Expires: {new Date(link.expiresAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.joinButton, isJoining && styles.joinButtonDisabled]}
        onPress={handleJoin}
        disabled={isJoining}
      >
        {isJoining ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.joinButtonText}>Join Neighborhood</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#FFF",
  },
  header: {
    marginBottom: 30,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  neighborhoodInfo: {
    backgroundColor: "#f0f8ff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  linkInfo: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 10,
    marginBottom: 30,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  joinButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 15,
  },
  joinButtonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  joinButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  cancelButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  cancelButtonText: {
    color: "#007AFF",
    fontSize: 16,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 20,
    color: "red",
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  invalidText: {
    fontSize: 24,
    color: "red",
    marginBottom: 10,
  },
  messageText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    textAlign: "center",
  },
});
