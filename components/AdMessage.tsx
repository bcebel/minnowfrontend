// components/AdMessage.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Linking,
  Alert,
  Platform,
} from "react-native";

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

      // Track click (optional)
      // await fetch(`/api/track-click/${ad.id}`, { method: 'POST' });

      // Open with privacy considerations
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
      {/* DISPLAY THE IMAGE if imageUrl exists */}
      {ad.imageUrl ? (
        <Image
          source={{ uri: ad.imageUrl }}
          style={styles.image}
          resizeMode="cover"
          onError={(e) =>
            console.log("Image failed to load:", e.nativeEvent.error)
          }
          onLoad={() => console.log("Image loaded successfully")}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>Ad</Text>
        </View>
      )}

      <View style={styles.content}>
        {/* Use title if exists, otherwise default */}
        <Text style={styles.title}>{ad.title || "Sponsored Link"}</Text>

        {/* Display description if exists */}
        {ad.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {ad.description}
          </Text>
        ) : (
          <Text style={styles.defaultDescription}>
            Visit our partner's website
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.cta}>Visit Partner Site →</Text>
          <Text style={styles.disclaimer}>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
    borderLeftWidth: 4,
    borderRadius: 8,
    marginVertical: 4,
    overflow: "hidden",
    maxWidth: 500, // Limit width on large screens
    alignSelf: "flex-start", // Center in chat
    width: "90%", // Responsive width
  },
  image: {
    width: 200,
    height: 200,
    borderRadius:10,
  },
  imagePlaceholder: {
    width: "100%",
    height: 150,
    backgroundColor: "#000000ff",
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
    color: "#ffffff",
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
  disclaimer: {
    fontSize: 10,
    color: "#888888",
  },
});
