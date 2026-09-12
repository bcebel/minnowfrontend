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
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation } from "@apollo/client";
import { Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GET_NEIGHBORHOODS,
  MY_NEIGHBORHOODS,
  JOIN_NEIGHBORHOOD,
  LEAVE_NEIGHBORHOOD,
} from "../../graphql/queries";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function NeighborhoodsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
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
      <View style={{flex:1}}>
        <ImageBackground
          source={require("@/assets/images/bbl.jpg")}
          style={styles.heroBubble}
          resizeMode="cover"
        />
  
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>
            Make and Join Bubbles
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>
            Context-based privacy
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>
            P2P powered
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>Log in</Text>
          </TouchableOpacity>
        </View>
        </View>
    );
  }

  // 🚨 Query error state
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const neighborhoods = data?.myNeighborhoods || [];

 const renderItem = ({ item }) => {
   return (
     <Link href={`/neighborhoods/bubbles/${item.id}`} asChild>
       <View style={styles.neighborhoodItem}>
         <ImageBackground
           source={
             item.bubblePhotoCid
               ? {
                   uri: `https://${PINATA_GATEWAY}/ipfs/${item.bubblePhotoCid}`,
                 }
               : {
                   uri: "/bbl.jpg" 
                 }
           }
           style={styles.neighborhoodCardImage}
           resizeMode="cover"
         >
           <LinearGradient
             colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0.1)"]}
             style={styles.neighborhoodCardOverlay}
           >
             <Text style={styles.neighborhoodName}>{item.name}</Text>
             <Text style={styles.neighborhoodType}>
               {item.type} • {item.members?.length || 0} members
             </Text>
             <Text style={styles.neighborhoodDescription}>
               About: {item.description}
             </Text>

             <View style={styles.buttonContainer}>
               <TouchableOpacity
                 style={styles.leaveButton}
                 onPress={() => handleLeaveNeighborhood(item.id)}
               >
                 <Text style={styles.leaveButtonText}>Leave</Text>
               </TouchableOpacity>
             </View>
           </LinearGradient>
         </ImageBackground>
       </View>
     </Link>
   );
  };

  return (
    
    <View style={styles.container}>
      <Text style={styles.header}>🏘️ My Bubbles - Click a bubble to enter!</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push(`/neighborhoods/bubbles/create`)}
        >
          <Text style={styles.createButtonText}>➕ Create New Bubble</Text>
        </TouchableOpacity>
      </View>

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
            <Text style={styles.browseButtonText}>Browse Bubbles to Join</Text>
          </TouchableOpacity>
        </View>
      ) : (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>

        <View style={styles.grid}>
          {neighborhoods.map((item) => (
            <View
              key={item.id}
              style={[styles.gridItem, isWide && styles.gridItemWide]}
            >
              {renderItem({ item })}
            </View>
          ))}
              
            </View>
          </ScrollView>
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
    backgroundColor: "#00FFFF",
    padding: 15,
    borderRadius: 30,
    width: "80%",
    alignItems: "center",
    marginTop: 5,
    marginBottom: 85,
  },
  loginButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 22,
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
    fontSize: 20,
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
    fontSize: 26,
  },
  neighborhoodItem: {
    borderRadius: 48,
    marginBottom: 15,
    overflow: "hidden",
  },
  neighborhoodName: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#ffffff",
    margin: 10,
    alignSelf: "center",
  },
  neighborhoodType: {
    fontSize: 18,
    color: "rgba(255, 0, 129, 1)",
    marginBottom: 8,
    alignSelf: "center",
  },
  memberBadge: {
    color: "#B8B0C9",
  },
  neighborhoodDescription: {
    fontSize: 20,
    color: "#CCC",
    marginBottom: 12,
    alignSelf: "center",
  },
  buttonContainer: {
    width: "20%",
    flexDirection: "row",
    gap: 10,
    alignSelf: "center",
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
    alignSelf: "center",
  },
  leaveButtonText: {
    color: "#F5F2FA",
    fontWeight: "bold",
    alignSelf: "center",
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
    fontSize: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: "#888",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  listContent: {
    paddingBottom: 120, // Adjust this until it clears your tab bar
    flexGrow: 1, // Ensures empty states center properly
  },
  neighborhoodCardImage: {
    width: "100%",
    aspectRatio: 1, // square, scales with whatever width the wrapper gives it
    overflow: "scroll",
    justifyContent: "flex-end",
    borderWidth: 2,
    borderColor: "#008888",
    borderRadius: 48,
  },
  neighborhoodCardOverlay: {
    flex: 1,
    borderRadius: 48,
    aspectRatio: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    justifyContent: "center",
    paddingBottom: 120,
  },
  gridItem: {
    width: "100%", // phone: full width, one per row
  },
  gridItemWide: {
    width: "30%", // laptop: two per row
    // or "31%" for three per row
  },
});
