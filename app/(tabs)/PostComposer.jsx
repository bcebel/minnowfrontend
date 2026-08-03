
import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation } from "@apollo/client";
import { CREATE_POST } from "../../app/graphql/queries";
import { GET_POSTS } from "../../app/graphql/queries"; // Your feed query

export default function PostComposer({
  currentNeighborhoodId = null,
  currentGroupId = null,
}) {
  const [content, setContent] = useState("");
  const [affiliateInput, setAffiliateInput] = useState("");
  const [showAffiliateOption, setShowAffiliateOption] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const defaultFeedType = currentNeighborhoodId
    ? "neighborhood"
    : currentGroupId
      ? "group"
      : "universal";

  const [createPost, { loading }] = useMutation(CREATE_POST, {
    update(cache, { data: { createPost: newPost } }) {
      try {
        const existingData = cache.readQuery({
          query: GET_POSTS,
          variables: { feedType: defaultFeedType },
        });

        if (existingData?.posts) {
          cache.writeQuery({
            query: GET_POSTS,
            variables: { feedType: defaultFeedType },
            data: { posts: [newPost, ...existingData.posts] },
          });
        }
      } catch (e) {
        // Cache miss fallback
      }
    },
  });

  // Pick Image/Video from native device library
  const pickMedia = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        "Permission Required",
        "You need to allow access to your photos to attach media.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0]);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !selectedImage) return;

    try {
      // 1. Process media array (using local uri or upload URL if processed)
      const media = selectedImage
        ? [{ url: selectedImage.uri, mediaType: selectedImage.type || "image" }]
        : null;

      // 2. Process affiliate input
      const isHtml =
        affiliateInput.trim().startsWith("<") || affiliateInput.includes("<a ");
      const affiliateHtml = isHtml ? affiliateInput : null;
      const affiliateUrl =
        !isHtml && affiliateInput.trim() ? affiliateInput : null;

      // 3. Dispatch Mutation
      await createPost({
        variables: {
          input: {
            content,
            feedType: defaultFeedType,
            neighborhoodId: currentNeighborhoodId,
            groupId: currentGroupId,
            media,
            affiliateHtml,
            affiliateUrl,
          },
        },
      });

      // Reset
      setContent("");
      setAffiliateInput("");
      setSelectedImage(null);
      setShowAffiliateOption(false);
    } catch (err) {
      console.error("Error creating post:", err);
      Alert.alert("Post Failed", err.message);
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

      {/* Selected Image Preview */}
      {selectedImage && (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: selectedImage.uri }}
            style={styles.previewImage}
          />
          <TouchableOpacity
            style={styles.removeBadge}
            onPress={() => setSelectedImage(null)}
          >
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Affiliate Snippet / Link Drawer */}
      {showAffiliateOption && (
        <TextInput
          style={[styles.input, styles.affiliateInput]}
          placeholder="Paste raw affiliate HTML snippet OR direct affiliate link..."
          placeholderTextColor="#888"
          multiline
          value={affiliateInput}
          onChangeText={setAffiliateInput}
        />
      )}

      {/* Controls Bar */}
      <View style={styles.toolbar}>
        <View style={styles.leftTools}>
          <TouchableOpacity style={styles.iconBtn} onPress={pickMedia}>
            <Text style={styles.btnText}>📷 Photo/Video</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowAffiliateOption(!showAffiliateOption)}
          >
            <Text style={styles.btnText}>🔗 Link</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.postBtn,
            !content.trim() && !selectedImage && styles.postBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || (!content.trim() && !selectedImage)}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
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
    backgroundColor: "#1E1035",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#331B58",
  },
  input: {
    color: "#FFF",
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: "top",
  },
  affiliateInput: {
    backgroundColor: "#130720",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    fontFamily: "Courier",
    marginTop: 8,
    marginBottom: 12,
  },
  previewContainer: {
    position: "relative",
    marginVertical: 10,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
  },
  removeBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: { color: "#FFF", fontWeight: "bold" },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2A1647",
  },
  leftTools: { flexDirection: "row", gap: 8 },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#2A1647",
    borderRadius: 6,
  },
  btnText: { color: "#00FFFF", fontSize: 13 },
  postBtn: {
    backgroundColor: "#8A2BE2",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: "#FFF", fontWeight: "bold" },
});