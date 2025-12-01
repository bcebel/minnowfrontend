import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
} from "react-native";

const AdMessage = ({ ad }) => {
  // Use the HTML from your database - ad should be the affiliateLink object
  const html = ad?.url || "";

  console.log("🔍 AdMessage received:", {
    ad,
    html: html ? `${html.substring(0, 100)}...` : "empty",
  });

  const extractUrls = (html) => {
    if (!html) return { clickUrl: null, imageUrl: null };

    const clickUrl = html?.match(/href="([^"]*)"/)?.[1];
    const imageUrl = html?.match(/src="([^"]*)"/)?.[1];

    console.log("🔗 Extracted URLs:", { clickUrl, imageUrl });
    return { clickUrl, imageUrl };
  };

  const { clickUrl, imageUrl } = extractUrls(html);

  const handleAdClick = async () => {
    if (clickUrl) {
      try {
        console.log("🖱️ Opening ad URL:", clickUrl);
        await Linking.openURL(clickUrl);

        // TODO: Add click tracking here
        // You'll need to call a mutation to increment the click count
      } catch (error) {
        console.error("Error opening ad:", error);
      }
    }
  };

  if (!imageUrl) {
    console.log("❌ No image URL found in HTML:", html);
    return (
      <View style={styles.adContainer}>
        <Text style={{ color: "#fff" }}>Invalid ad format</Text>
        <Text style={{ color: "#666", fontSize: 10 }}>
          HTML: {html ? `${html.substring(0, 50)}...` : "empty"}
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.adContainer} onPress={handleAdClick}>
      <View style={styles.adBadge}>
        <Text style={styles.adBadgeText}>🛍️ Sponsored</Text>
      </View>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.bannerImage}
          resizeMode="contain"
          onError={(e) =>
            console.log("❌ Image load error:", e.nativeEvent.error)
          }
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  adContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 1,
  },
  adBadge: {
    padding: 1,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    alignItems: "center",
    
  },
  adBadgeText: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  imageContainer: {
   height: 175,
    backgroundColor: "#000",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  adTitleContainer: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  adTitle: {
    color: "#ccc",
    fontSize: 12,
    textAlign: "center",
  },
});

export default AdMessage;
