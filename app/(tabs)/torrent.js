import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    FlatList, 
    ActivityIndicator, 
    StyleSheet, 
    SafeAreaView,
    Platform 
} from 'react-native';
import { Video } from 'expo-av'; 

// Use the environment variable as before
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL; 

// --- Video Card Component ---
const VideoCard = ({ video }) => {
    // 1. Implement the same URL processing logic from your old HTML script
    //    Prioritize CID for the Pinata gateway, otherwise fix old Filebase URLs
    const ipfsUrl = video.cid
        ? `https://gateway.pinata.cloud/ipfs/${video.cid}`
        : video.ipfsUrl?.replace('ipfs.filebase.io', 'gateway.pinata.cloud');
    
    // Fallback if no valid URL can be constructed
    if (!ipfsUrl) {
        return (
            <View style={styles.videoCard}>
                <Text style={styles.title}>{video.title}</Text>
                <Text style={styles.errorText}>Video link unavailable.</Text>
            </View>
        );
    }

    return (
        <View style={styles.videoCard}>
            <Text style={styles.title} numberOfLines={1}>{video.title}</Text>
            <Text style={styles.description} numberOfLines={2}>{video.description || "No description provided."}</Text>
            
            {/* 2. Use the native Video component (expo-av) */}
            <Video
                source={{ uri: ipfsUrl }}
                style={styles.videoPlayer}
                useNativeControls // Crucial for native playback controls (solves iPhone issue)
                resizeMode="contain" // Ensures the video fits within the bounds
                isLooping
            />
        </View>
    );
};

// --- Main App Component ---
export default function App() {
    // Redirect web users to the public page (same logic as before)
    if (Platform.OS === 'web') {
        window.location.href = BACKEND_URL;
        return null;
    }
    
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchVideos = async () => {
        setLoading(true);
        setError(null);
        try {
            const apiUrl = `${BACKEND_URL}/api/videos`; 
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            // The VideoCard component handles the URL modification logic, 
            // so we just pass the raw data array to state.
            setVideos(data); 

        } catch (e) {
            console.error("Fetch Error:", e);
            setError("Failed to load videos.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVideos();
        // Implement the 30-second refresh interval
        const interval = setInterval(fetchVideos, 30000); 
        return () => clearInterval(interval);
    }, []);

    // --- Loading, Error, and Render States ---
    if (loading) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading Videos...</Text>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
            </SafeAreaView>
        );
    }

    // Use FlatList for efficient scrolling and rendering of a list of videos
    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={videos}
                keyExtractor={(item) => item._id} // Use the unique _id from your JSON
                renderItem={({ item }) => <VideoCard video={item} />}
                contentContainerStyle={styles.galleryContainer}
                ListHeaderComponent={<Text style={styles.header}>Minnow Video Strike</Text>}
            />
        </SafeAreaView>
    );
}

// --- Basic Styles (adapted from your HTML/CSS) ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        padding: 15,
        textAlign: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    galleryContainer: {
        padding: 10,
    },
    videoCard: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        marginBottom: 15, // Space between cards
        backgroundColor: '#f9f9f9',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    description: {
        fontSize: 14,
        color: '#666',
        marginBottom: 10,
    },
    videoPlayer: {
        width: '100%',
        height: 250, // Set a fixed height for consistency
        backgroundColor: '#000',
        borderRadius: 4,
    },
    errorText: {
        color: '#721c24',
        backgroundColor: '#f8d7da',
        padding: 10,
        borderRadius: 5,
        margin: 10,
    },
    loadingText: {
        marginTop: 10,
        color: '#007AFF',
    }
});
