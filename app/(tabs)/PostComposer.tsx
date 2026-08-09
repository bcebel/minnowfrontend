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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CREATE_POST } from "../graphql/queries"; // Adjust path to match your project
import { uploadToIPFS } from "../utils/uploadHelper"; // Adjust path to match your project
import  webtorrentService from "../../utils/webtorrentService"; // Adjust path to match 
// your project

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

  // In PostComposer.tsx
  const [createPostMutation] = useMutation(CREATE_POST, {
    // ✅ Ensure token is passed on every mutation
    context: async () => {
      const token = await AsyncStorage.getItem("token");
      return {
        headers: {
          authorization: token ? `Bearer ${token}` : "",
        },
      };
    },
  });
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
    const token = await AsyncStorage.getItem("token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    let extractedCid = null;
    let magnetLink = null;
    let finalMediaUrl = null;
    const currentMediaType = selectedMedia?.mediaType || "image";
    const fileName = selectedMedia?.uri
      ? `post_${Date.now()}.${currentMediaType === "video" ? "mp4" : "jpg"}`
      : null;

    if (selectedMedia?.uri) {
      const uri = selectedMedia.uri;

      if (uri.startsWith("blob:") || uri.startsWith("file:")) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const isLargeVideo =
          currentMediaType === "video" && blob.size > 10 * 1024 * 1024;

        // In PostComposer.tsx - MODIFIED
        // In PostComposer.tsx - update the isLargeVideo section
        if (isLargeVideo) {
          try {
     const response = await fetch(uri);
     const blob = await response.blob();

     // 2. Seed with the blob (same as chat)
     const browserSeed = await webtorrentService.seed(blob, {
       name: fileName,
     });

     const magnetLink = browserSeed.magnetUri;

     // ✅ 3. VERIFY the seed has a file
     setTimeout(() => {
       const client = window.globalWebTorrentClient;
       const torrent = client?.torrents?.find(
         (t) => t.magnetURI === magnetLink,
       );
       if (torrent) {
         console.log("📁 Post seed files:", torrent.files.length);
         if (torrent.files.length === 0) {
           console.error("❌ No files! Re-seeding failed!");
         } else {
           console.log("✅ Post seed working!");
         }
       }
     }, 3000);

            // ✅ Store the RAW file data (NOT a blob URL!)
            await webtorrentService.storeSeedData(magnetLink, blob, {
              fileName: fileName,
              fileType: "video",
              size: blob.size,
            });

            console.log(
              `✅ Browser seed active: ${magnetLink.substring(0, 50)}...`,
            );
            // 2️⃣ Send metadata to backend (NO FILE)
            console.log(`📤 Sending metadata to backend...`);
            await fetch(`${BACKEND_URL}/api/seed-register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                magnetLink: magnetLink,
                neighborhoodId: currentNeighborhoodId,
                content: content,
                fileName: fileName,
                fileSize: blob.size,
                mediaType: "video",
              }),
            }).catch(() => {
              console.log(
                "⚠️ Backend registration failed, but browser seed is active",
              );
            });

            // 3️⃣ Create post with magnet link
            await createPostMutation({
              variables: {
                input: {
                  content,
                  feedType: "neighborhood",
                  neighborhoodId: currentNeighborhoodId,
                  media: [
                    {
                      magnetURI: magnetLink,
                      mediaType: "video",
                    },
                  ],
                },
              },
              context: {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            });

            console.log("✅ Post created with P2P seeding");
          } catch (error) {
            console.error("❌ P2P seeding failed:", error);
            // Fallback to IPFS
            const uploadResult = await uploadToIPFS(
              uri,
              fileName ||
                `post_${Date.now()}.${currentMediaType === "video" ? "mp4" : "jpg"}`,
              currentMediaType,
            );
            const slice = uploadResult?.slices?.[0];
            extractedCid = slice?.cid || uploadResult?.cid || null;
            magnetLink = slice?.magnetLink || uploadResult?.magnetLink || null;
            if (extractedCid) {
              finalMediaUrl = `https://ipfs.io/ipfs/${extractedCid}`;
            }
            // Create post with IPFS fallback
            await createPostMutation({
              variables: {
                input: {
                  content,
                  feedType: "neighborhood",
                  neighborhoodId: currentNeighborhoodId,
                  groupId: currentGroupId || null,
                  media: finalMediaUrl
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
              context: {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            });
          }
        } else {
          // ✅ SMALL VIDEO/IMAGE - Upload to IPFS
          const uploadResult = await uploadToIPFS(
            uri,
            fileName ||
              `post_${Date.now()}.${currentMediaType === "video" ? "mp4" : "jpg"}`,
            currentMediaType,
          );

          const slice = uploadResult?.slices?.[0];
          extractedCid = slice?.cid || uploadResult?.cid || null;
          magnetLink = slice?.magnetLink || uploadResult?.magnetLink || null;

          if (extractedCid) {
            finalMediaUrl = `https://ipfs.io/ipfs/${extractedCid}`;
          }

          // ✅ Create post (NO fileName in media)
          await createPostMutation({
            variables: {
              input: {
                content,
                feedType: "neighborhood",
                neighborhoodId: currentNeighborhoodId,
                groupId: currentGroupId || null,
                media: finalMediaUrl
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
            context: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          });
        }
      }
    }

    // No media case
    if (!selectedMedia) {
      await createPostMutation({
        variables: {
          input: {
            content,
            feedType: "neighborhood",
            neighborhoodId: currentNeighborhoodId,
            groupId: currentGroupId || null,
            media: [],
          },
        },
        context: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }

    setContent("");
    setSelectedMedia(null);
    onPostCreated?.();
  } catch (error) {
    console.error("❌ Failed to create post:", error);
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
