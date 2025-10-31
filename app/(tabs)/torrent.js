import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
// Use Expo's AV for native video playback
import { Video } from 'expo-av'; 

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const styles = StyleSheet.create({
    // ... Add styles for your layout (container, card, title, etc.)
});

// A new component to render each video card
const VideoCard = ({ video }) => {
    // Determine the correct IPFS URL based on your HTML logic
    const ipfsUrl = video.cid
        ? `https://gateway.pinata.cloud/ipfs/${video.cid}`
        : video.ipfsUrl?.replace('ipfs.filebase.io', 'gateway.pinata.cloud');
    
    if (!ipfsUrl) return null;

    return (
        <View style={styles.videoCard}>
            <Text style={styles.title}>{video.title}</Text>
            <Text style={styles.description}>{video.description || "No desc"}</Text>
            <Video
                source={{ uri: ipfsUrl }}
                style={styles.videoPlayer} // You'll need to define this style
                useNativeControls // Gives a native play/pause/timeline UI
                resizeMode="contain"
                isLooping
            />
        </View>
    );
};

export default function App() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchVideos = async () => {
        setLoading(true);
        setError(null);
        try {
            // Note: Use the full API path
            const apiUrl = `${BACKEND_URL}/api/videos`; 
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // Perform the same URL processing logic as your HTML script
            const processedVideos = data.map(v => ({
                ...v,
                ipfsUrl: v.cid
                    ? `https://gateway.pinata.cloud/ipfs/${v.cid}`
                    : v.ipfsUrl?.replace('ipfs.filebase.io', 'gateway.pinata.cloud') // Fix old URLs
            }));
            setVideos(processedVideos);
        } catch (e) {
            console.error("Fetch Error:", e);
            setError("Failed to load videos. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVideos();
        // Implement your refresh logic (e.g., every 30 seconds)
        const interval = setInterval(fetchVideos, 30000); 
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
    }

    if (error) {
        return <Text style={styles.errorText}>{error}</Text>;
    }

    // Use FlatList for efficient rendering of long lists
    return (
        <FlatList
            data={videos}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <VideoCard video={item} />}
            contentContainerStyle={styles.galleryContainer}
        />
    );
}
