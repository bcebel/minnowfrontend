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

interface PostComposerProps {
  currentNeighborhoodId?: string;
  currentGroupId?: string | null;
  onPostCreated?: () => void;
}

export default function PostComposer({
  currentNeighborhoodId,
  currentGroupId,
  onPostCreated,
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<{ uri: string } | null>(null);
  const [showAffiliateOption, setShowAffiliateOption] = useState(false);
  const [affiliateInput, setAffiliateInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [createPostMutation] = useMutation(CREATE_POST);

  // 1. Pick Media from Device
  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage({ uri: result.assets[0].uri });
    }
  };

  // 2. Submit Post (Upload to IPFS first -> Fire GraphQL mutation)
 const handleSubmit = async () => {
   if (!content.trim() && !selectedImage) return;

   setLoading(true);
   try {
     let extractedCid = null;
     let magnetLink = null;
     let finalMediaUrl = null;

     // 1. Upload to IPFS if an image was picked
     if (selectedImage?.uri) {
       const uri = selectedImage.uri;

       if (uri.startsWith("blob:") || uri.startsWith("file:")) {
         const uploadResult = await uploadToIPFS(
           uri,
           `post_${Date.now()}.jpg`,
           "image",
         );

         // Match your backend's actual response structure:
         const slice = uploadResult?.slices?.[0];
         extractedCid = slice?.cid || uploadResult?.cid || null;
         magnetLink = slice?.magnetLink || uploadResult?.magnetLink || null;

         // Construct permanent URL using IPFS CID
         if (extractedCid) {
           finalMediaUrl = `https://ipfs.io/ipfs/${extractedCid}`;
         }
       } else {
         finalMediaUrl = uri;
       }
     }

     // 2. Wrap variables in `input: { ... }` for GraphQL
     await createPostMutation({
       variables: {
         input: {
           content,
           feedType: "universal",
           neighborhoodId: currentNeighborhoodId,
           groupId: currentGroupId,
           media: finalMediaUrl
             ? [
                 {
                   url: finalMediaUrl,
                   cid: extractedCid,
                   magnetURI: magnetLink,
                   mediaType: "image",
                 },
               ]
             : [],
           affiliate: affiliateInput ? { rawHtml: affiliateInput } : null,
         },
       },
     });

     // 3. Reset local form state
     setContent("");
     setSelectedImage(null);
     setAffiliateInput("");
     setShowAffiliateOption(false);

     if (onPostCreated) {
       onPostCreated();
     }
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
  affiliateInput: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 6,
    fontSize: 13,
    minHeight: 40,
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
  leftTools: {
    flexDirection: "row",
    gap: 8,
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