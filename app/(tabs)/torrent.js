import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    FlatList, 
    ActivityIndicator, 
    StyleSheet, 
    SafeAreaView,
    Platform,
    useWindowDimensions // Used for basic responsive styling
} from 'react-native';
// Ensure you have run: npx expo install expo-av
import { Video } from 'expo-av'; 

// Use the environment variable for your backend URL
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL; 

// --- Video Card Component ---
const VideoCard = ({ video }) => {
    // 1. Implement the URL processing logic: 
    //    Prioritize CID for the Pinata gateway, otherwise fix old Filebase URLs
    const ipfsUrl = video.cid
        ? `https://gateway.pinata.cloud/ipfs/${video.cid}`
        : video.ipfsUrl?.replace('ipfs.filebase.io', 'gateway.pinata.cloud');
    
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
                useNativeControls // Crucial for native playback controls
                resizeMode="contain" 
                isLooping
            />
        </View>
    );
};

// --- Main App Component ---
export default function App() {
    const { width } = useWindowDimensions();
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Calculate grid columns based on screen width (for web/tablet responsiveness)
    const numColumns = Platform.OS === 'web' && width > 900 ? 3 : 1;
    const itemWidth = Platform.OS === 'web' && width > 900 ? width / numColumns - 30 : '100%';

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
            setVideos(data); 

        } catch (e) {
            console.error("Fetch Error:", e);
            setError("Failed to load videos. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVideos();
        // 30-second refresh interval
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

    // Use FlatList for efficient scrolling
    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={videos}
                // Use the unique _id from your JSON for keyExtractor
                keyExtractor={(item) => item._id} 
                // Render a VideoCard for each item
                renderItem={({ item }) => <VideoCard video={item} />}
                contentContainerStyle={[
                    styles.galleryContainer,
                    // Apply the max-width and center alignment for web
                    Platform.OS === 'web' && { maxWidth: 1200, marginHorizontal: 'auto' }
                ]}
                ListHeaderComponent={<Text style={styles.header}>Minnow Video Strike</Text>}
                numColumns={numColumns} // Uses 1 column on mobile, 3 on large screens
                columnWrapperStyle={numColumns > 1 ? { justifyContent: 'space-between' } : null}
            />
        </SafeAreaView>
    );
}

// --- Styles ---
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
        // Basic card styling
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        backgroundColor: '#f9f9f9',
        
        // Flexbox ensures width works for both mobile and web grid
        flex: 1, 
        margin: 5, // Space between grid items
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
        height: 250, // Fixed height for visual consistency
        backgroundColor: '#000',
        borderRadius: 4,
    },
    errorText: {
        color: '#721c24',
        backgroundColor: '#f8d7da',
        padding: 10,
        borderRadius: 5,
        margin: 10,
        textAlign: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#007AFF',
    }
});
