// components/CommentSection.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { GET_COMMENTS, ADD_COMMENT } from "../app/graphql/queries";
import { formatTimeAgo } from "../app/utils/helpers";

const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

const getProfilePhotoUrl = (profilePhoto) => {
  if (!profilePhoto) return "https://via.placeholder.com/40";
  if (profilePhoto.startsWith("http")) return profilePhoto;
  if (profilePhoto.startsWith("blob:")) return profilePhoto;
  if (profilePhoto.startsWith("Qm") || profilePhoto.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
  }
  return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
};

export default function CommentSection({ postId, onCommentCountChange }) {
  const [newComment, setNewComment] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, loading, refetch } = useQuery(GET_COMMENTS, {
    variables: { postId },
    skip: !isExpanded,
    fetchPolicy: "cache-and-network",
  });

  const [addComment] = useMutation(ADD_COMMENT);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await addComment({
        variables: {
          postId,
          content: newComment.trim(),
        },
      });
      setNewComment("");
      refetch();
      onCommentCountChange?.(); // Update parent comment count
    } catch (error) {
      console.error("Failed to add comment:", error);
    }
  };

  const comments = data?.comments || [];

  return (
    <View style={styles.container}>
      {/* Toggle Comments */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.commentToggle}
      >
        <Text style={styles.commentToggleText}>
          💬 {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
        </Text>
      </TouchableOpacity>

      {/* Comment Input */}
      {isExpanded && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Write a comment..."
            placeholderTextColor="#666"
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !newComment.trim() && styles.sendButtonDisabled,
            ]}
            onPress={handleAddComment}
            disabled={!newComment.trim()}
          >
            <Text style={styles.sendButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Comments List */}
      {isExpanded && (
        <>
          {loading && comments.length === 0 ? (
            <ActivityIndicator
              style={styles.loader}
              color="#FF8000"
              size="small"
            />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Image
                    source={{
                      uri: getProfilePhotoUrl(item.author?.profilePhoto),
                    }}
                    style={styles.avatar}
                  />
                  <View style={styles.commentContent}>
                    <Text style={styles.username}>
                      {item.author?.username || "Anonymous"}
                    </Text>
                    <Text style={styles.commentText}>{item.content}</Text>
                    <Text style={styles.timestamp}>
                      {formatTimeAgo(item.createdAt)}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.commentsList}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  commentToggle: {
    paddingVertical: 6,
  },
  commentToggleText: {
    color: "#FF8000",
    fontSize: 13,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#1A0B2E",
    borderWidth: 1,
    borderColor: "rgba(255,128,0,0.3)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#FF8000",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 13,
  },
  commentsList: {
    paddingTop: 8,
    gap: 8,
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#333",
    borderWidth: 1,
    borderColor: "#FF8000",
  },
  commentContent: {
    flex: 1,
  },
  username: {
    color: "#FF8000",
    fontSize: 12,
    fontWeight: "600",
  },
  commentText: {
    color: "#E0D8F0",
    fontSize: 14,
    marginTop: 2,
  },
  timestamp: {
    color: "#666",
    fontSize: 10,
    marginTop: 2,
  },
  loader: {
    marginTop: 10,
  },
});
