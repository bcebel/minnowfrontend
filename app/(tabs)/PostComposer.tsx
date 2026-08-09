import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation } from "@apollo/client";
import { CREATE_POST } from "../graphql/queries"; // Adjust path to match your project
import { uploadToIPFS } from "../utils/uploadHelper"; // Adjust path to match your project
import  webtorrentService from "../../utils/webtorrentService"; // Adjust path to match your project
interface PostComposerProps {
  currentNeighborhoodId?: string;
  currentGroupId?: string | null;
  onPostCreated?: () => void;
}

interface SelectedMedia {
  uri: string;
  mediaType: "image" | "video";
}

export default function PostComposer({
  currentNeighborhoodId,
  currentGroupId,
  onPostCreated,
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const [createPostMutation] = useMutation(CREATE_POST);

  // 1. Pick Media (Detects 'image' vs 'video')
  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const detectedType = asset.type === "video" ? "video" : "image";

      setSelectedMedia({
        uri: asset.uri,
        mediaType: detectedType,
      });
    }
  };

  // 2. Submit Post
  // In PostComposer.tsx - updated handleSubmit
  const handleSubmit = async () => {
    if (!content.trim() && !selectedMedia) return;

    setLoading(true);
    try {
      let extractedCid = null;
      let magnetLink = null;
      let finalMediaUrl = null;
      const currentMediaType = selectedMedia?.mediaType || "image";

      // Upload local file to IPFS if selected
      if (selectedMedia?.uri) {
        const uri = selectedMedia.uri;

        if (uri.startsWith("blob:") || uri.startsWith("file:")) {
          const extension = currentMediaType === "video" ? "mp4" : "jpg";
          const fileName = `post_${Date.now()}.${extension}`;

          // ✅ NEW: Check if it's a large video
          const response = await fetch(uri);
          const blob = await response.blob();
          const isLargeVideo =
            currentMediaType === "video" && blob.size > 10 * 1024 * 1024;

          if (isLargeVideo) {
            // ✅ P2P-ONLY: Seed via WebTorrent, skip Pinata
            console.log(`🎬 Large video (${blob.size} bytes) - P2P only`);
            const seedResult = await webtorrentService.seed(blob, {
              name: fileName,
            });

            magnetLink = seedResult.magnetUri;
            // No CID, no IPFS URL
            extractedCid = null;
            finalMediaUrl = null;
          } else {
            // ✅ Normal upload to Pinata (for small videos and images)
            const uploadResult = await uploadToIPFS(
              uri,
              fileName,
              currentMediaType,
            );

            const slice = uploadResult?.slices?.[0];
            extractedCid = slice?.cid || uploadResult?.cid || null;
            magnetLink = slice?.magnetLink || uploadResult?.magnetLink || null;

            if (extractedCid) {
              finalMediaUrl = `https://ipfs.io/ipfs/${extractedCid}`;
            }
          }
        } else {
          finalMediaUrl = uri;
        }
      }

      // Create the post (same as before)
      await createPostMutation({
        variables: {
          input: {
            content,
            feedType: "neighborhood",
            neighborhoodId: currentNeighborhoodId,
            groupId: currentGroupId || null,
            media:
              finalMediaUrl || magnetLink
                ? [
                    {
                      url: finalMediaUrl,
                      cid: extractedCid,
                      magnetURI: magnetLink,
                      mediaType: currentMediaType,
                    },
                  ]
                : [],
          },
        },
      });

      // Clear state
      setContent("");
      setSelectedMedia(null);
      onPostCreated?.();
    } catch (error) {
      console.error("Failed to create post:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="What's happening on your stream?"
        placeholderTextColor="#888"
        multiline
        value={content}
        onChangeText={setContent}
      />

      {/* Selected Media Preview */}
      {selectedMedia && (
        <View style={styles.previewContainer}>
          {selectedMedia.mediaType === "image" ? (
            <Image
              source={{ uri: selectedMedia.uri }}
              style={styles.previewImage}
            />
          ) : (
            <View style={styles.videoPreviewPlaceholder}>
              <Text style={styles.videoPreviewText}>🎬 Video Selected</Text>
              <Text style={styles.videoUriText} numberOfLines={1}>
                {selectedMedia.uri}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.removeBadge}
            onPress={() => setSelectedMedia(null)}
          >
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Controls Bar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickMedia}>
          <Text style={styles.btnText}>📷 Photo/Video</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.postBtn,
            !content.trim() && !selectedMedia && styles.postBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || (!content.trim() && !selectedMedia)}
        >
          {loading ? (
            <ActivityIndicator color="#130720" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1A0B2E",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  input: {
    color: "#FFFFFF",
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
  },
  previewContainer: {
    position: "relative",
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  videoPreviewPlaceholder: {
    width: "100%",
    height: 120,
    backgroundColor: "rgba(0,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  videoPreviewText: {
    color: "#00FFFF",
    fontWeight: "bold",
    fontSize: 15,
  },
  videoUriText: {
    color: "#8A829E",
    fontSize: 11,
    marginTop: 4,
  },
  removeBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  btnText: {
    color: "#8A829E",
    fontSize: 13,
  },
  postBtn: {
    backgroundColor: "#00FFFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 14,
  },
});
