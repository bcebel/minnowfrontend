import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery, gql } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Environment Variables ---
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- GraphQL Definitions (Unchanged) ---
const UPDATE_PROFILE = gql`
  mutation UpdateProfile(
    $bio: String
    $profilePhoto: String
    $affiliateLinks: [AffiliateLinkInput]
  ) {
    updateProfile(
      bio: $bio
      profilePhoto: $profilePhoto
      affiliateLinks: $affiliateLinks
    ) {
      id
      username
      bio
      profilePhoto
      affiliateLinks {
        id
        url
        title
        clicks
        imageUrl
      }
    }
  }
`;

const GET_PROFILE = gql`
  query GetProfile {
    me {
      id
      bio
      profilePhoto
      affiliateLinks {
        id
        url
        title
        description
        imageUrl
        clicks
      }
    }
  }
`;

// --- Utility: Get Full Image URL (Unchanged) ---
const getProfilePhotoUrl = (cid) => {
  if (cid) return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  return null;
};

export default function ProfileSetupScreen() {
  const router = useRouter();

  // State for Form Inputs: 'rawHtml' is the key for the single input field
  const [bio, setBio] = useState("");
  const [profilePhotoCid, setProfilePhotoCid] = useState(null);
  const [affiliateLinks, setAffiliateLinks] = useState([
    { rawHtml: "" }, // <-- Single field for raw HTML snippet
  ]);

  // State for UI/Loading
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- FETCH CURRENT DATA ---
  const {
    loading: loadingProfile,
    data: profileData,
    refetch: refetchProfile,
    error: profileError,
  } = useQuery(GET_PROFILE, {
    fetchPolicy: "network-and-cache",
  });

  const [updateProfile] = useMutation(UPDATE_PROFILE, {
    errorPolicy: "all",
  });

  // --- POPULATE STATE FROM QUERY RESULT (FIXED) ---
useEffect(() => {
  if (profileData?.me) {
    const { bio, profilePhoto, affiliateLinks: incomingLinks } = profileData.me;

    // 1. Photo and Bio
    setBio(bio || "");
    setProfilePhotoCid(profilePhoto || null);

    // 2. Affiliate Links: Use description field for raw HTML
    if (incomingLinks && incomingLinks.length > 0) {
      setAffiliateLinks(
        incomingLinks.map((link) => ({
          // Use description field which contains the raw HTML
          rawHtml: link.description || link.url || "",
        }))
      );
    } else {
      setAffiliateLinks([{ rawHtml: "" }]);
    }
  }
}, [profileData]);

  // --- IMAGE UPLOAD LOGIC (Unchanged, but included for completeness) ---

  const uploadToIPFS = async (fileUri, fileName) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(fileUri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("video", blob, fileName || "profile-photo.jpg");
      formData.append("title", "Profile Photo");
      formData.append("description", "User profile photo");

      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      const ipfsUrl = result.ipfsUrl;
      const cid = ipfsUrl.split("/ipfs/")[1];

      if (!cid) {
        throw new Error("Could not extract CID from IPFS URL");
      }

      return cid;
    } catch (error) {
      console.error("❌ IPFS upload error:", error);
      throw error;
    }
  };

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Photo library access required");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setUploading(true);

        try {
          const cid = await uploadToIPFS(asset.uri, "profile-photo.jpg");
          setProfilePhotoCid(cid);
          Alert.alert("Upload Successful", "Photo uploaded and ready to save.");
        } catch (error) {
          Alert.alert(
            "Upload Failed",
            "Could not upload profile photo to IPFS."
          );
          setProfilePhotoCid(null);
        } finally {
          setUploading(false);
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick image");
      setUploading(false);
    }
  };

  // --- AFFILIATE LINK LOGIC (FIXED) ---
  const addLinkField = () => {
    setAffiliateLinks([...affiliateLinks, { rawHtml: "" }]);
  };

  // Simplified handler for the single rawHtml input
  const updateLink = (index, value) => {
    const updated = [...affiliateLinks];
    updated[index].rawHtml = value;
    setAffiliateLinks(updated);
  };

  // --- SAVE LOGIC (FIXED) ---
const handleSave = async () => {
  try {
    setSaving(true);

    // Format links as the old working code did
    const validLinks = affiliateLinks
      .filter((link) => link.rawHtml && link.rawHtml.trim())
      .map((link) => ({
        url: link.rawHtml, // Send raw HTML as url
        title: "", // Empty title - backend will extract
      }));

    console.log("Sending to backend:", validLinks);

    const { data, errors } = await updateProfile({
      variables: {
        bio: bio || "",
        profilePhoto: profilePhotoCid || "",
        affiliateLinks: validLinks,
      },
    });

    if (errors && errors.length > 0) {
      throw new Error(errors[0].message);
    }

    if (data?.updateProfile) {
      Alert.alert("Success", "Profile saved successfully!");
      refetchProfile();
    }
  } catch (err) {
    Alert.alert("Error", err.message);
  } finally {
    setSaving(false);
  }
};
  // --- RENDER LOGIC (Minor Fixes) ---

  if (loadingProfile) {
    return (
      <View style={[styles.container, styles.loadingOverlay]}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={[styles.container, styles.loadingOverlay]}>
        <Text style={styles.errorText}>
          Error loading profile: {profileError.message}
        </Text>
        <TouchableOpacity style={styles.refetchButton} onPress={refetchProfile}>
          <Text style={styles.refetchButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photoUrl = getProfilePhotoUrl(profilePhotoCid);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Your Profile Setup</Text>

      {/* 🚀 CURRENT SETUP DISPLAY 🚀 */}
      <View style={styles.currentSection}>
        <Text style={styles.sectionTitle}>Current Live Setup</Text>

        {/* Profile Photo Display (Uses bio and profilePhotoCid) */}
        <View style={styles.photoDisplaySection}>
          <Text style={styles.label}>Profile Photo:</Text>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.profileImage} />
          ) : (
            <View style={styles.noPhoto}>
              <Text style={styles.noPhotoText}>No Profile Photo</Text>
            </View>
          )}
          {profilePhotoCid && (
            <Text style={styles.cidText}>
              CID: {profilePhotoCid.substring(0, 15)}...
            </Text>
          )}
        </View>

        {/* Bio Display (Uses bio) */}
        <View style={styles.bioSection}>
          <Text style={styles.label}>Bio:</Text>
          {bio ? (
            <Text style={styles.currentBio}>{bio}</Text>
          ) : (
            <Text style={styles.noData}>No bio set</Text>
          )}
        </View>

        {/* Affiliate Links Display (FIXED filter) */}
        <View style={styles.linksSection}>
          <Text style={styles.label}>Affiliate Links:</Text>
          {/* We now check if the link has content by reading the 'rawHtml' field, 
              which contains the data loaded from the database's 'url' field. */}
          {affiliateLinks.filter((l) => l.rawHtml && l.rawHtml.trim()).length >
          0 ? (
            affiliateLinks
              .filter((l) => l.rawHtml && l.rawHtml.trim())
              .map((link, index) => {
                // Extract preview info
                let previewText = "HTML Link Snippet";
                let hasImage = link.rawHtml.includes("<img");

                return (
                  <View key={index} style={styles.linkItem}>
                    <Text style={styles.linkTitle}>
                      {hasImage ? "🖼️ Image Link" : "🔗 Text Link"}
                    </Text>
                    <Text style={styles.linkUrl}>
                      {link.rawHtml.substring(0, 60)}...
                    </Text>
                    <View style={{ flexDirection: "row", marginTop: 5 }}>
                      <View
                        style={{
                          backgroundColor: link.rawHtml.includes("href=")
                            ? "#00AA00"
                            : "#FF9900",
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 4,
                          marginRight: 5,
                        }}
                      >
                        <Text style={{ color: "#FFF", fontSize: 10 }}>
                          {link.rawHtml.includes("href=")
                            ? "Valid Link"
                            : "No HREF"}
                        </Text>
                      </View>
                      {hasImage && (
                        <View
                          style={{
                            backgroundColor: "#0077CC",
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Text style={{ color: "#FFF", fontSize: 10 }}>
                            Has Image
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
          ) : (
            <Text style={styles.noData}>No affiliate links set</Text>
          )}{" "}
        </View>
      </View>

      {/* 🛠️ UPDATE FORM (Editable Inputs) 🛠️ */}
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Update Profile Settings</Text>
        {/* Photo Upload Button */}
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickImage}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.uploadButtonText}>
              {profilePhotoCid
                ? "Change Profile Photo"
                : "Upload Profile Photo"}
            </Text>
          )}
        </TouchableOpacity>
        {/* Bio Input */}
        <TextInput
          style={styles.bioInput}
          placeholder="Update your bio..."
          placeholderTextColor="#666"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.charCount}>{bio.length}/500</Text>

        {/* Affiliate Links Input (SINGLE INPUT RESTORED) */}
        <Text style={styles.label}>Paste Affiliate HTML Code Snippet:</Text>
        {affiliateLinks.map((link, index) => (
          <View key={index} style={styles.linkInputGroup}>
            <TextInput
              style={[styles.linkInput, { height: 100 }]}
              placeholder="Paste your full affiliate HTML code snippet here (e.g., <a href=...)"
              placeholderTextColor="#666"
              value={link.rawHtml}
              onChangeText={(text) => updateLink(index, text)}
              multiline
              autoCapitalize="none"
              textAlignVertical="top"
            />
          </View>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={addLinkField}>
          <Text style={styles.addButtonText}>+ Add Another Link Field</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || uploading}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>SAVE & REFRESH PROFILE</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// --- STYLES (Unchanged) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 20,
    fontSize: 18,
  },
  errorText: {
    color: "#ff0000",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 15,
  },
  refetchButton: {
    backgroundColor: "#222",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff0000",
  },
  refetchButtonText: {
    color: "#ff0000",
    fontWeight: "bold",
  },
  title: {
    fontSize: 32,
    color: "#00ffff",
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 30,
    textShadowColor: "#00ffff66",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  currentSection: {
    backgroundColor: "#0A0A0A",
    padding: 20,
    borderRadius: 12,
    marginBottom: 40,
    borderWidth: 2,
    borderColor: "#00AA00", // Green border for 'Current'
    shadowColor: "#00AA00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  formSection: {
    backgroundColor: "#0A0A0A",
    padding: 20,
    borderRadius: 12,
    marginBottom: 40,
    borderWidth: 2,
    borderColor: "#00ffff", // Cyan border for 'Update'
    shadowColor: "#00ffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 22,
    color: "#FFF",
    fontWeight: "700",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    paddingBottom: 10,
  },
  photoDisplaySection: {
    alignItems: "center",
    marginBottom: 30,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#00ffff",
    marginTop: 10,
  },
  noPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 10,
  },
  noPhotoText: {
    color: "#666",
  },
  cidText: {
    fontSize: 10,
    color: "#00AA00",
    marginTop: 8,
    fontFamily: "monospace",
  },
  bioSection: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    color: "#00AA00",
    marginBottom: 10,
    fontWeight: "600",
  },
  currentBio: {
    fontSize: 14,
    color: "#E0E0E0",
    lineHeight: 20,
    backgroundColor: "#1A1A1A",
    padding: 15,
    borderRadius: 8,
    minHeight: 80,
    borderColor: "#333",
    borderLeftWidth: 3,
  },
  noData: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    backgroundColor: "#1A1A1A",
    padding: 15,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: "center",
  },
  linksSection: {
    marginBottom: 10,
  },
  linkItem: {
    backgroundColor: "#1A1A1A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderColor: "#00AA00",
  },
  linkTitle: {
    fontSize: 14,
    color: "#FFF",
    fontWeight: "500",
  },
  linkUrl: {
    fontSize: 12,
    color: "#66ff66",
    marginTop: 4,
  },
  uploadButton: {
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 25,
  },
  uploadButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
  bioInput: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    padding: 15,
    color: "#FFF",
    fontSize: 16,
    minHeight: 100,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  charCount: {
    color: "#00AA00",
    fontSize: 12,
    textAlign: "right",
    marginBottom: 20,
  },
  linkInputGroup: {
    marginBottom: 15,
    borderLeftWidth: 3,
    borderColor: "#00ffff50",
    paddingLeft: 10,
  },
  linkInput: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    padding: 15,
    color: "#FFF",
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  addButton: {
    backgroundColor: "#222",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#00AA00",
  },
  addButtonText: {
    color: "#00AA00",
    fontSize: 16,
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: "#00ffff",
    padding: 18,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#333",
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "bold",
  },
});
