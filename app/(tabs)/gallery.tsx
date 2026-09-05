// app/(tabs)/gallery.tsx (or whatever your gallery tab is)
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import AllNeighborhoodsGallery from '../../components/AllNeighborhoodsGallery';

export default function GalleryScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkLogin = async () => {
      const token = await AsyncStorage.getItem('token');
      setIsLoggedIn(!!token);
      setLoading(false);
    };
    checkLogin();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00ffff" />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={styles.centered}>
        <Text style={styles.icon}>🖼️</Text>
        <Text style={styles.title}>Your Bubbles' Gallery</Text>
        <Text style={styles.description}>
          Log in to see photos and videos shared in your neighborhoods,
          powered by P2P for blazing fast loading.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/login')}>
          <Text style={styles.buttonText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If logged in, render the actual gallery component
  return (
    <View style={{ flex: 1 }}>
      <AllNeighborhoodsGallery />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#130720',
    padding: 20,
  },
  icon: { fontSize: 60, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  description: { fontSize: 16, color: '#ccc', textAlign: 'center', marginBottom: 30 },
  button: { backgroundColor: '#00FFFF', padding: 15, borderRadius: 30, width: '100%', alignItems: 'center' },
  buttonText: { color: '#130720', fontWeight: 'bold', fontSize: 18 },
});