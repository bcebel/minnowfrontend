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
import { ImageBackground } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";


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

  // Inside your BubbleHub return:
  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("@/assets/images/bbl.jpg")}
        style={styles.bubbleHeader}
        resizeMode="cover"
      >
        {/* Liquid Glass overlay */}
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.2)"]}
          style={styles.gradientOverlay}
        >
          <View style={styles.headerContent}>
            <Text style={styles.bubbleName}>{neighborhood.name}</Text>
            <Text style={styles.bubbleDescription}>
              {neighborhood.description}
            </Text>
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* 🌟 THE MENU */}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
    paddingBottom: 20,
  },
  bubbleHeader: {
    width: "100%",
    height: 250,
  },
  gradientOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
  },
  headerContent: {
    alignItems: "center",
  },
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
  menu: {
    flex: 1,
    padding: 20,
    gap: 15,
  },
  menuItem: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#1C0A2E",
    padding: 20,
    borderRadius: 48,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#00ffff",
  },
  bubbleGlass: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    backgroundColor: "rgba(177, 0, 255, 0.3)", // Semi-transparent background
    borderWidth: 1,
    borderColor: "rgba(177, 0, 255, 0.3)",
    borderRadius: 48,

    // Web only (React Native Web supports this)
    boxShadow:
      "inset 1px 1px 1px 0px rgba(255, 255, 255, 0.6), inset -1px -1px 2px 0px rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.15)",

    // Web only (Safari needs the prefix)
    backdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
    WebkitBackdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
  },
  button: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 48,
    alignItems: "center",
    backgroundColor: "rgba 57, 17, 89, 0.5",
    padding: "50px",
  },
});
