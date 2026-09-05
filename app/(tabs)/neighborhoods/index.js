// app/neighborhoods/index.js
import React, { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GET_NEIGHBORHOODS,
  MY_NEIGHBORHOODS,
  JOIN_NEIGHBORHOOD,
  LEAVE_NEIGHBORHOOD,
} from "../../graphql/queries";

export default function NeighborhoodsScreen() {
  const router = useRouter();

  // ✅ Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkLogin = async () => {
      const token = await AsyncStorage.getItem('token');
      setIsLoggedIn(!!token);
      setLoading(false);
    };
    checkLogin();
  }, []);

  // ✅ Queries (skipped until logged in)
  const { loading: loadingNeighborhoods, error, data, refetch } = useQuery(
    MY_NEIGHBORHOODS,
    {
      skip: !isLoggedIn,
      fetchPolicy: "cache-and-network",
      nextFetchPolicy: "network-only",
    }
  );

  const [joinNeighborhood] = useMutation(JOIN_NEIGHBORHOOD);
  const [leaveNeighborhood] = useMutation(LEAVE_NEIGHBORHOOD);

  // ... rest of your handlers (join/leave) ...

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

  

  // 🚨 Loading state (only after login check)
  if (loading) return <ActivityIndicator size="large" style={styles.loading} />;

  // 🚨 Logged out: Show the preview
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require("@/assets/images/bbl.jpg")}
          style={styles.heroBubble}
          resizeMode="cover"
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            My Bubbles
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            Join private neighborhoods
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            Context-based privacy
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            P2P powered
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Log in to view</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 🚨 Query error state
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const neighborhoods = data?.myNeighborhoods || [];

  const renderItem = ({ item }) => {
    // ... (keep your renderItem code unchanged)
  };

  return (
    <View style={styles.container}>
      {/* ... (keep your header, actions, and list code) ... */}
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
          refreshing={loadingNeighborhoods}
          onRefresh={refetch}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  heroBubble: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  loginButton: {
    backgroundColor: '#00FFFF',
    padding: 15,
    borderRadius: 30,
    width: '80%',
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonText: {
    color: '#130720',
    fontWeight: 'bold',
    fontSize: 18,
  },
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
    color: "#ff8000",
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
    borderRadius: 48,
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
    borderRadius: 48,
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
    color: "rgba(255, 0, 129, 1)",
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
    backgroundColor: "#F5F2FA",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 48,
    flex: 1,
    alignItems: "center",
  },
  viewButtonText: {
    color: "#151159",
    fontWeight: "bold",
  },
  leaveButton: {
    backgroundColor: "#151159",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 48,
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
  listContent: {
    paddingBottom: 120, // Adjust this until it clears your tab bar
    flexGrow: 1, // Ensures empty states center properly
  },
});
