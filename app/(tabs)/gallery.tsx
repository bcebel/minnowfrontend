// app/(tabs)/gallery.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from "expo-router";
import AllNeighborhoodsGallery from '../../components/AllNeighborhoodsGallery';

export default function GalleryScreen() {
  const router = useRouter();
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

  // 🚨 SAFE EARLY RETURN: If loading, show spinner
  if (loading) return <ActivityIndicator size="large" color="#00ffff" style={styles.loading} />;

  // 🚨 LOGGED OUT: Show the exact same style as Livestream
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require("@/assets/images/bbl.jpg")}
          style={styles.heroBubble}
          resizeMode="cover"
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
 <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Log in to view</Text>
          </TouchableOpacity>
        </View>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            Bubble Gallery
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
          Photos & videos shared in your bubbles
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>
            Powered by WebTorrent
          </Text>
        </View>
     
       
      </View>
    );
  }

  // ✅ LOGGED IN: Render the actual gallery ONLY HERE
  // (If this crashes, it's the backend resolver, not the login check)
  return (
    <View style={{ flex: 1 }}>
      <AllNeighborhoodsGallery />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    marginTop: 50,
  },
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