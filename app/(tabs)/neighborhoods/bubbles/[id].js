// app/neighborhoods/[id].js
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation, gql } from "@apollo/client";
import {
  GET_NEIGHBORHOOD,
  UPDATE_BUBBLE_PHOTO,
  LEAVE_NEIGHBORHOOD,
} from "../../../graphql/queries";
import { ImageBackground } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { BlurView } from "expo-blur";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

const GET_CURRENT_USER = gql`
  query GetMe {
    me {
      id
      username
    }
  }
`;

const DELETE_NEIGHBORHOOD = gql`
  mutation DeleteNeighborhood($neighborhoodId: ID!) {
    deleteNeighborhood(neighborhoodId: $neighborhoodId)
  }
`;

export default function NeighborhoodDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // ✅ ALL HOOKS AT THE TOP
  const { loading, error, data, refetch } = useQuery(GET_NEIGHBORHOOD, {
    variables: { id },
    fetchPolicy: "network-only",
  });
const [leaveNeighborhood] = useMutation(LEAVE_NEIGHBORHOOD);
  const { data: userData } = useQuery(GET_CURRENT_USER);
  const [username, setUsername] = useState("");
  const [updateBubblePhoto] = useMutation(UPDATE_BUBBLE_PHOTO);
  const [deleteNeighborhood] = useMutation(DELETE_NEIGHBORHOOD);

  useEffect(() => {
    AsyncStorage.getItem("username").then((saved) => setUsername(saved || ""));
  }, []);

  // ✅ NOW early returns are safe
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

  const handleLeaveBubble = async () => {
    const confirmed = window.confirm(
      `Leave "${neighborhood.name}"? You'll need to be re-invited to rejoin.`,
    );
    if (!confirmed) return;

    try {
      await leaveNeighborhood({
        variables: { neighborhoodId: neighborhood.id },
      });
      alert("👋 Left bubble");
      router.replace("/neighborhoods");
    } catch (err) {
      if (err.message.includes("owner")) {
        alert("Owners can't leave — transfer ownership or delete the bubble.");
      } else {
        alert(`Leave failed: ${err.message}`);
      }
    }
  };
  // ✅ Derived values (no hooks)
  const bubblePhotoSource = neighborhood.bubblePhotoCid
    ? { uri: `https://${PINATA_GATEWAY}/ipfs/${neighborhood.bubblePhotoCid}` }
    : require("@/assets/images/bbl.jpg");

  const isOwner = neighborhood.owner?.username === username;
  const isPersonal = neighborhood.type === "personal";

  const canInvite = (() => {
    if (!neighborhood || !username) return false;
    const member = neighborhood.members?.find(
      (m) => m.user?.username === username,
    );
    const isModerator =
      member?.role === "moderator" || member?.role === "admin";
    return isOwner || isModerator;
  })();

  // ✅ Handlers (no hooks)
  const handleDeleteBubble = async () => {
    const confirmed = window.confirm(
      `Delete "${neighborhood.name}"? This will remove all posts, messages, and media in this bubble. This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteNeighborhood({
        variables: { neighborhoodId: neighborhood.id },
      });
      alert("Bubble deleted");
      router.replace("/neighborhoods");
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const pickBubblePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    try {
      const token = await AsyncStorage.getItem("token");
      const formData = new FormData();
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      formData.append("video", blob, "bubble-photo.jpg");
      formData.append("title", "Bubble Photo");
      formData.append("description", "Neighborhood cover photo");

      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      const cid = data.ipfsUrl?.split("/ipfs/")[1];

      if (cid) {
        await updateBubblePhoto({
          variables: { neighborhoodId: id, cid },
        });
        await refetch();
        Alert.alert("Success", "Bubble photo updated!");
      }
    } catch (err) {
      console.error("Bubble photo upload failed:", err);
      Alert.alert("Upload Failed", err.message);
    }
  };

  // ✅ Render
  return (
    <View style={styles.container}>
      <ImageBackground
        source={bubblePhotoSource}
        style={styles.bubbleHeader}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.2)"]}
          style={styles.gradientOverlay}
        >
          <View style={styles.headerContent}>
            <Text style={styles.bubbleName}>{neighborhood.name}</Text>
            <Text style={styles.bubbleDescription}>
              {neighborhood.description}
            </Text>
            {isOwner && (
              <TouchableOpacity
                style={styles.editPhotoButton}
                onPress={pickBubblePhoto}
              >
                <Text style={styles.editPhotoText}>📷 Change Photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </ImageBackground>

      <View style={styles.menu}>
        <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-postfeed?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.button}>📝 Posts</Text>
          </TouchableOpacity>
        </BlurView>

        <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-chat?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.button}>💬 Chat</Text>
          </TouchableOpacity>
        </BlurView>

        <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-gallery?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.button}>🖼️ Gallery</Text>
          </TouchableOpacity>
        </BlurView>

        <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-members?neighborhoodId=${neighborhood.id}`,
              )
            }
          >
            <Text style={styles.button}>👥 Members</Text>
          </TouchableOpacity>
        </BlurView>

        {canInvite && (
          <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/neighborhoods/bubbles/invite-links?neighborhoodId=${neighborhood.id}`,
                )
              }
            >
              <Text style={styles.button}>📧 Invite</Text>
            </TouchableOpacity>
          </BlurView>
        )}
        {!isOwner && !isPersonal && (
          <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
            <TouchableOpacity onPress={handleLeaveBubble}>
              <Text style={[styles.button, { color: "#ff375f" }]}>
                🚪 Leave Bubble
              </Text>
            </TouchableOpacity>
          </BlurView>
        )}

        {isOwner && !isPersonal && (
          <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
            <TouchableOpacity onPress={handleDeleteBubble}>
              <Text style={[styles.button, { color: "#ff375f" }]}>
                🗑️ Delete Bubble
              </Text>
            </TouchableOpacity>
          </BlurView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#130720", paddingBottom: 20 },
  loading: { marginTop: 50 },
  bubbleHeader: { width: "100%", height: 200, zIndex: 2 },
  gradientOverlay: { flex: 1, justifyContent: "flex-end", padding: 20 },
  headerContent: { alignItems: "center" },
  bubbleName: {
    fontSize: 32,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  bubbleDescription: {
    fontSize: 16,
    color: "#ddd",
    textAlign: "center",
    marginTop: 5,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  editPhotoButton: {
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#00ffff",
  },
  editPhotoText: { color: "#00ffff", fontWeight: "bold", fontSize: 14 },
  menu: { flex: 1, padding: 20, gap: 15 },
  bubbleGlass: {
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "rgba(177, 0, 255, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(177, 0, 255, 0.3)",
    boxShadow:
      "inset 1px 1px 1px 0px rgba(255, 255, 255, 0.6), inset -1px -1px 2px 0px rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.15)",
    backdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
    WebkitBackdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
  },
  button: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
});
