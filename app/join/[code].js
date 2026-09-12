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
  ImageBackground,
  ScrollView,
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
  const [hasJoined, setHasJoined] = useState(false);
  const [newNeighborhoodId, setNewNeighborhoodId] = useState(null);

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
router.replace({
  pathname: "/neighborhoods/bubbles/neighborhood-postfeed",
  params: { neighborhoodId: nId },
});
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
    const result = await joinViaInviteLink({ variables: { code } });
    if (result.data?.joinViaInviteLink.success) {
      setNewNeighborhoodId(result.data.joinViaInviteLink.neighborhood.id);
      setHasJoined(true); // 🎯 Switch the UI
    } else {
      Alert.alert("Error", result.data.joinViaInviteLink.message);
    }
  } catch (err) {
    console.error(err);
  } finally {
    setIsJoining(false);
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
    <View style={styles.container}>
      <ImageBackground
        source={require("@/assets/images/bbl.jpg")}
        style={styles.heroBubble}
        resizeMode="cover"
      />
      <View style={styles.header}>
        <Text style={styles.mainTitle}>bubbleBASED.com</Text>
        <Text style={styles.title}>
          Your formal invitation to the {neighborhood.name} bubble.
        </Text>
        <Text style={styles.description}>{neighborhood.description}</Text>
      </View>

      <View style={styles.neighborhoodInfo}>
        <Text style={styles.infoTitle}>Bubble Info</Text>
        <Text style={styles.infoTitle}>Type: {neighborhood.type}</Text>
      </View>

      {link && (
        <View style={styles.linkInfo}>
          <Text style={styles.infoTitle}>Role: {link.role}</Text>
          <Text>
            Uses: {link.uses}/{link.maxUses || "Unlimited"}
          </Text>
          {link.expiresAt && (
            <Text style={styles.infoTitle}>
              Expires: {new Date(link.expiresAt).toLocaleDateString()}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.joinButton, { backgroundColor: "#28a745" }]} // Green for success
            onPress={() => {
              router.push({
                pathname: "/",
              });
            }}
          >
            <Text style={styles.infoTitle}>
              New User?  Register Here First
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!hasJoined ? (
        <TouchableOpacity
          style={[styles.joinButton, isJoining && styles.joinButtonDisabled]}
          onPress={handleJoin}
          disabled={isJoining}
        >
          {isJoining ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.joinButtonText}>Join Bubble</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.joinButton, { backgroundColor: "#28a745" }]} // Green for success
          onPress={() => {
            router.push({
              pathname: "/neighborhoods/bubbles/neighborhood-postfeed",
              params: { neighborhoodId: newNeighborhoodId },
            });
          }}
        >
          <Text style={styles.joinButtonText}>✅ GO TO NEIGHBORHOOD</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
      >
        <Text style={styles.cancelButtonText}>
          {hasJoined ? "Back to Home" : "Cancel"}
        </Text>
      </TouchableOpacity>
      </View>
    </ScrollView>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    marginBottom: 30,
    alignItems: "center",
  },
  mainTitle: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#fff",
    padding: 10,
  },
  title: {
    fontSize: 25,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#fff",
  },
  description: {
    fontSize: 20,
    color: "#fff",
    textAlign: "center",
  },
  neighborhoodInfo: {
    padding: 15,
    borderRadius: 8,
    // ✅ CENTER VERTICALLY AND HORIZONTALLY
    justifyContent: "center",
    alignItems: "center",
    // Optional: give the box a fixed height so centering is visible
    minHeight: 80,
  },
  linkInfo: {
    padding: 15,
    borderRadius: 8,
    // ✅ CENTER VERTICALLY AND HORIZONTALLY
    justifyContent: "center",
    alignItems: "center",
    // Optional: give the box a fixed height so centering is visible
    minHeight: 80,
  },
  infoTitle: {
    color: "#fff",
    fontSize: 20,
    // ✅ CENTER THE TEXT HORIZONTALLY WITHIN THE BOX
    textAlign: "center",
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
  heroBubble: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
});
