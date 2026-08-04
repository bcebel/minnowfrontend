import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import AffiliateCard from "./AffiliateCard";

const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

// 🎯 IPFS / Gateway URL Resolver (Same logic as NeighborhoodGallery)
function resolveMediaUrl(mediaItem) {
  if (!mediaItem) return null;

  // Handle string URLs or CIDs
  if (typeof mediaItem === "string") {
    if (mediaItem.startsWith("http")) {
      return mediaItem.replace("ipfs.filebase.io", PINATA_GATEWAY);
    }
    return `https://${PINATA_GATEWAY}/ipfs/${mediaItem}`;
  }

  // Handle object structure { url, ipfsUrl, cid }
  if (mediaItem.ipfsUrl) {
    return mediaItem.ipfsUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);
  }

  if (mediaItem.cid) {
    return `https://${PINATA_GATEWAY}/ipfs/${mediaItem.cid}`;
  }

  if (mediaItem.url) {
    return mediaItem.url.startsWith("http")
      ? mediaItem.url.replace("ipfs.filebase.io", PINATA_GATEWAY)
      : `https://${PINATA_GATEWAY}/ipfs/${mediaItem.url}`;
  }

  return null;
}

// Quick helper to format relative time
function formatTimeAgo(timestamp) {
  if (!timestamp) return "";
  const date = new Date(isNaN(timestamp) ? timestamp : Number(timestamp));
  const diffInSeconds = Math.floor((new Date() - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export default function FeedItem({ post, onLike, onComment }) {
  if (!post) return null;

  const { author, content, createdAt, media, affiliate } = post;

  // Resolve Profile Avatar through Pinata Gateway
  const avatarUri =
    resolveMediaUrl(author?.profilePhoto) ||
    "https://via.placeholder.com/150/1C0A2E/00FFFF?text=U";

  return (
    <View style={styles.feedItemContainer}>
      {/* Post Header: Avatar + Username + Timestamp */}
      <View style={styles.header}>
        <Image
          source={{ uri: avatarUri }}
          style={styles.avatar}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.headerTextContainer}>
          <Text style={styles.username}>{author?.username || "Anonymous"}</Text>
          <Text style={styles.timestamp}>{formatTimeAgo(createdAt)}</Text>
        </View>
      </View>

      {/* Main Post Content */}
      {content ? <Text style={styles.content}>{content}</Text> : null}

      {/* Attached Media (Photo / Video) */}
      {media && media.length > 0 && (
        <View style={styles.mediaContainer}>
          {media.map((item, index) => {
            const mediaUrl = resolveMediaUrl(item);
            if (!mediaUrl) return null;

            return (
              <Image
                key={item.cid || item.url || index}
                source={{ uri: mediaUrl }}
                style={styles.postImage}
                contentFit="cover"
                transition={300}
                onError={(err) =>
                  console.log(`Failed to load post image [${index}]:`, err)
                }
              />
            );
          })}
        </View>
      )}

      {/* Affiliate Link / Banner Card */}
      {affiliate && <AffiliateCard affiliate={affiliate} />}

      {/* Post Footer Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={onLike}>
          <Text style={styles.actionIcon}>⚡</Text>
          <Text style={styles.actionLabel}>Boost</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onComment}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>Reply</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>🔗</Text>
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedItemContainer: {
    backgroundColor: "#1E1035",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#331B58",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#130720",
    borderWidth: 1,
    borderColor: "#00FFFF",
  },
  headerTextContainer: {
    marginLeft: 10,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  timestamp: {
    color: "#8A829E",
    fontSize: 11,
    marginTop: 1,
  },
  content: {
    color: "#E0D8F0",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 10,
  },
  mediaContainer: {
    borderRadius: 8,
    overflow: "hidden",
    marginVertical: 6,
    gap: 8, // Spacing if multiple images exist
  },
  postImage: {
    width: "100%",
    height: 240,
    backgroundColor: "#130720",
    borderRadius: 8,
  },
  actionBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#2A1647",
    marginTop: 10,
    paddingTop: 8,
    justifyContent: "space-around",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  actionIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  actionLabel: {
    color: "#8A829E",
    fontSize: 12,
    fontWeight: "600",
  },
});
