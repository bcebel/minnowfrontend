// components/AdMessage.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image"; // 👈 Swap this in

// Inside your AdMessage return:

interface AdProps {
  ad: {
    id: string;
    url: string;
    title: string;
    description?: string;
    imageUrl?: string; // ← Now this exists!
    clicks?: number;
  };
}

export default function AdMessage({ ad }: AdProps) {
  const handlePress = async () => {
    try {
      if (!ad.url) {
        Alert.alert("Error", "No link available");
        return;
      }

      console.log("Opening affiliate link:", ad.url);
      if (Platform.OS === "web") {
        // On web, open in new tab with no referrer
        const newWindow = window.open(ad.url, "_blank", "noopener,noreferrer");
        if (newWindow) newWindow.opener = null;
      } else {
        // On mobile, use Linking
        await Linking.openURL(ad.url);
      }
    } catch (error) {
      console.error("Failed to open link:", error);
      Alert.alert("Error", "Could not open link");
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {ad.imageUrl ? (
<Image
  source={{ uri: ad.imageUrl }}
  style={styles.image}
  contentFit="cover" 
  transition={200} 
  cachePolicy="memory-disk"
/>
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>Ad</Text>
        </View>
      )}

      <View style={styles.content}>
    
      
          <Text style={styles.defaultDescription}>
            Visit our partner's website
          </Text>
      

        <View style={styles.footer}>
          <Text style={styles.cta}>Visit Partner Site →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1C0A2E",
    borderLeftWidth: 4,
    borderRadius: 8,
    marginVertical: 4,
    overflow: "hidden",
    maxWidth: 500,
    alignSelf: "flex-start",
    width: "90%",
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 10,
  },
  imagePlaceholder: {
    width: "100%",
    height: 150,
    backgroundColor: "#130720ff",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  content: {
    padding: 12,
  },
  title: {
    color: "#F5F2FA",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  description: {
    color: "#cccccc",
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 18,
  },
  defaultDescription: {
    color: "#888888",
    fontSize: 14,
    marginBottom: 8,
    fontStyle: "italic",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  cta: {
    fontWeight: "bold",
    fontSize: 14,
  },
});
