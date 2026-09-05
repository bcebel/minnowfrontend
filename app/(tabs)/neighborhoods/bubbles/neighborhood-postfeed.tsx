import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  ImageBackground, 
  TouchableOpacity 
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PostFeed from "./PostFeed"; // Adjust path if needed

export default function NeighborhoodGalleryScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const neighborhoodId = params.neighborhoodId as string;

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

  if (loading) return <ActivityIndicator size="large" color="#00ffff" style={styles.loading} />;

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
            Neighborhood Feed
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            See what's happening in this bubble
          </Text>
        </View>
        <View style={{ flex: 1, justifyContentText: 'center', alignItems: 'center' }}>
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

  // ✅ Logged in: Render the actual feed
  return <PostFeed neighborhoodId={neighborhoodId} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: 50 },
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
});