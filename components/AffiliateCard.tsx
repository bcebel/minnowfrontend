import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from "react-native";

export default function AffiliateCard({ affiliate }) {
  if (
    !affiliate ||
    (!affiliate.targetUrl && !affiliate.bannerUrl && !affiliate.title)
  ) {
    return null;
  }

  const handleOpenLink = () => {
    if (affiliate.targetUrl) {
      Linking.openURL(affiliate.targetUrl).catch((err) =>
        console.error("Failed to open affiliate URL:", err),
      );
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={handleOpenLink}
    >
      {/* Banner Image */}
      {affiliate.bannerUrl && (
        <Image
          source={{ uri: affiliate.bannerUrl }}
          style={styles.banner}
          resizeMode="cover"
        />
      )}

      <View style={styles.content}>
        {/* Network & Sponsored Badges */}
        <View style={styles.badgeRow}>
          {affiliate.isSponsored && (
            <View style={styles.sponsoredBadge}>
              <Text style={styles.sponsoredText}>Sponsored</Text>
            </View>
          )}
          {affiliate.network && (
            <View style={styles.networkBadge}>
              <Text style={styles.networkText}>
                {affiliate.network.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Title / Headline */}
        {affiliate.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {affiliate.title}
          </Text>
        ) : (
          <Text style={styles.title} numberOfLines={1}>
            Featured Deal
          </Text>
        )}

        {/* Domain / CTA */}
        <View style={styles.actionRow}>
          <Text style={styles.targetUrl} numberOfLines={1}>
            {affiliate.targetUrl
              ? affiliate.targetUrl
                  .replace(/^https?:\/\/(www\.)?/, "")
                  .split("/")[0]
              : "Visit Sponsor"}
          </Text>
          <View style={styles.ctaButton}>
            <Text style={styles.ctaText}>View Deal ↗</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#130720",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#331B58",
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 4,
  },
  banner: {
    width: "100%",
    height: 140,
    backgroundColor: "#090310",
  },
  content: {
    padding: 12,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  sponsoredBadge: {
    backgroundColor: "#8A2BE2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsoredText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  networkBadge: {
    backgroundColor: "#2A1647",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#331B58",
  },
  networkText: {
    color: "#00FFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  targetUrl: {
    color: "#8A829E",
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  ctaButton: {
    backgroundColor: "rgba(0, 255, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#00FFFF",
  },
  ctaText: {
    color: "#00FFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
