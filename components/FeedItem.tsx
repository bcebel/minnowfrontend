// FeedItem.tsx - Updated
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import AffiliateCard from "./AffiliateCard";
import WebTorrentMedia from "./WebTorrentMedia";
import { useMutation } from "@apollo/client";
import { DELETE_POST } from "../app/graphql/queries";
import CommentSection from "./CommentSection";


const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

// ✅ Copy the function from neighborhood-chat
const getProfilePhotoUrl = (profilePhoto) => {
  if (!profilePhoto) {
    return "https://via.placeholder.com/40";
  }

  if (profilePhoto.startsWith("http")) {
    return profilePhoto;
  }

  if (profilePhoto.startsWith("blob:")) {
    return profilePhoto;
  }

  if (profilePhoto.startsWith("Qm") || profilePhoto.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
  }

  return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
};

function resolveMediaUrl(mediaItem) {
  if (!mediaItem) return null;

  if (typeof mediaItem === "string") {
    if (mediaItem.startsWith("http")) {
      return mediaItem.replace("ipfs.filebase.io", PINATA_GATEWAY);
    }
    return `https://${PINATA_GATEWAY}/ipfs/${mediaItem}`;
  }

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

function formatTimeAgo(timestamp) {
  if (!timestamp) return "";
  const date = new Date(isNaN(timestamp) ? timestamp : Number(timestamp));
  const diffInSeconds = Math.floor((new Date() - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export default function FeedItem({ post, onLike, onComment, onDelete }) {
  if (!post) return null;

  const { author, content, createdAt, media, affiliate } = post;

  // ✅ Use the fixed profile photo function
  const avatarUri = getProfilePhotoUrl(author?.profilePhoto);
  const [deletePost] = useMutation(DELETE_POST);
  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this post?")) {
      try {
        await deletePost({
          variables: { postId: post.id },
        });
        // Refresh the feed
        onDelete?.();
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }
  };
  return (
    <View style={styles.feedItemContainer}>
      {/* Post Header */}
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

      {/* Attached Media */}
      {media && media.length > 0 && (
        <View style={styles.mediaContainer}>
          {media.map((item, index) => {
            const fallbackUrl = resolveMediaUrl(item);

            const normalizedMedia = {
              cid: item.cid,
              magnetLink: item.magnetLink || item.magnetURI,
              fallbackUrl: fallbackUrl,
              ipfsUrl: fallbackUrl,
              fileType: item.fileType || item.mediaType || "image",
              fileName: item.fileName || `media-${item.cid}`,
            };

            return (
              <View
                key={item.cid || item.url || index}
                style={styles.mediaWrapper}
              >
                <WebTorrentMedia media={normalizedMedia} isFocused={true} />
              </View>
            );
          })}
        </View>
      )}

      {/* Affiliate Link Card */}
      {affiliate && <AffiliateCard affiliate={affiliate} />}

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
          <Text style={styles.actionIcon}>🗑️</Text>
          <Text style={styles.actionLabel}>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onLike}>
          <Text style={styles.actionIcon}>⚡</Text>
          <Text style={styles.actionLabel}>Boost</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onComment}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>Reply</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>↗️</Text>
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>
      </View>
      <CommentSection
        postId={post.id}
        onCommentCountChange={() => {
          // Optional: update comment count in UI
        }}
      />
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
    borderColor: "rgba(255,128,0,0.15)", // 🧡 Orange accent
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
    borderWidth: 2,
    borderColor: "#FF8000", // 🧡 Orange border
  },
  headerTextContainer: {
    marginLeft: 10,
  },
  username: {
    color: "#FF8000", // 🧡 Orange username
    fontSize: 14,
    fontWeight: "700",
  },
  timestamp: {
    color: "#FF8000", // 🧡 Orange tint
    fontSize: 11,
    marginTop: 1,
    opacity: 0.7,
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
    gap: 8,
  },
  mediaWrapper: {
    width: "100%",
    height: 240,
    backgroundColor: "#130720",
    borderRadius: 8,
    overflow: "hidden",
  },
  actionBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,128,0,0.1)", // 🧡 Orange tint
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
    color: "#FF8000", // 🧡 Orange
  },
  actionLabel: {
    color: "#8A829E",
    fontSize: 12,
    fontWeight: "600",
  },
});
