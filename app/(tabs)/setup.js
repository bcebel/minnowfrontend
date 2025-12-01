// app/profile/setup.js
import React, { useState } from "react";
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
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Updated mutation with affiliateLinks
// In your setup.js - Update the UPDATE_PROFILE mutation
const UPDATE_PROFILE = gql`
  mutation UpdateProfile(
    $bio: String, 
    $profilePhoto: String, 
    $affiliateLinks: [AffiliateLinkInput]  # Add this
  ) {
    updateProfile(
      bio: $bio, 
      profilePhoto: $profilePhoto, 
      affiliateLinks: $affiliateLinks  # Add this
    ) {
      id
      username
      bio
      profilePhoto
      affiliateLinks {
        id
        url
        title  # Make sure title is included here
        clicks
      }
    }
  }
`;

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoCid, setProfilePhotoCid] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [affiliateLinks, setAffiliateLinks] = useState([
    { url: "", title: "" },
  ]);

  // Mutation with error policy to handle null responses
  const [updateProfile] = useMutation(UPDATE_PROFILE, {
    errorPolicy: "all",
  });

  // Upload image to IPFS and get CID
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

      console.log("🔄 Uploading profile photo to IPFS...");

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
      console.log("✅ Profile photo uploaded:", result);

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
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setProfilePhoto(asset.uri);
        setUploading(true);

        try {
          const cid = await uploadToIPFS(asset.uri, "profile-photo.jpg");
          setProfilePhotoCid(cid);
          console.log("✅ Profile photo CID:", cid);
        } catch (error) {
          Alert.alert(
            "Upload Failed",
            "Could not upload profile photo to IPFS"
          );
          setProfilePhoto(null);
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

  const addLinkField = () => {
    setAffiliateLinks([...affiliateLinks, { url: "", title: "" }]);
  };

  const updateLink = (index, field, value) => {
    const updated = [...affiliateLinks];
    updated[index][field] = value;
    setAffiliateLinks(updated);
  };

const handleSave = async () => {
  try {
    setSaving(true);

    // Filter out empty links and ensure both URL and Title are handled
    const validLinks = affiliateLinks
      .filter((link) => link.url.trim()) // Only links with URLs
      .map((link) => ({
        url: link.url,
        title: link.title || "My Affiliate Link", // Default title if empty
      }));

    console.log("🔄 Saving profile with links:", {
      bio: bio || "",
      profilePhoto: profilePhotoCid || "",
      affiliateLinks: validLinks,
    });

    const { data, errors } = await updateProfile({
      variables: {
        bio: bio || "",
        profilePhoto: profilePhotoCid || "",
        affiliateLinks: validLinks,
      },
    });

    // Handle response
    if (errors && errors.length > 0) {
      console.error("GraphQL errors:", errors);
      throw new Error(errors[0].message);
    }

    if (data?.updateProfile) {
      console.log(
        "✅ Profile saved successfully with links:",
        data.updateProfile
      );
      Alert.alert("Success", "Profile setup complete!");
      router.replace("/neighborhoods");
    }
  } catch (err) {
    console.error("Error saving profile:", err);
    Alert.alert("Error", "Failed to save profile: " + err.message);
  } finally {
    setSaving(false);
  }
};

  // Get display URL for the image
  const getProfilePhotoUrl = () => {
    if (profilePhoto) return profilePhoto;
    if (profilePhotoCid)
      return `https://${PINATA_GATEWAY}/ipfs/${profilePhotoCid}`;
    return "https://via.placeholder.com/150";
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Complete Your Profile</Text>

      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>About You</Text>

        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={pickImage}
          disabled={uploading}
        >
          {uploading ? (
            <View style={[styles.avatar, styles.uploadingAvatar]}>
              <ActivityIndicator size="large" color="#00ffff" />
              <Text style={styles.uploadingText}>Uploading to IPFS...</Text>
            </View>
          ) : (
            <>
              <Image
                source={{ uri: getProfilePhotoUrl() }}
                style={styles.avatar}
              />
              <Text style={styles.avatarText}>
                {profilePhotoCid
                  ? "✅ Photo saved to IPFS"
                  : "Tap to add photo"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {profilePhotoCid && (
          <Text style={styles.cidText}>
            IPFS CID: {profilePhotoCid.substring(0, 20)}...
          </Text>
        )}

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={styles.bioInput}
          placeholder="Tell everyone about yourself... What are you passionate about? What do you do?"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.charCount}>{bio.length}/500</Text>

        {/* Affiliate Links Section */}
        <Text style={styles.sectionTitle}>Your Affiliate Links (Optional)</Text>
        <Text style={styles.sectionDescription}>
          Add affiliate links from CJ.com, Impact.com, Rakuten.com, etc.
        </Text>

        {affiliateLinks.map((link, index) => (
          <View key={index} style={styles.linkContainer}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Run your ad from CJ.Com Here"
              value={link.title}
              onChangeText={(text) => updateLink(index, "title", text)}
            />

            <Text style={styles.label}>URL</Text>
            <TextInput
              style={styles.input}
              placeholder="a href="
              value={link.url}
              onChangeText={(text) => updateLink(index, "url", text)}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addLinkField}>
          <Text style={styles.addButtonText}>+ Add Another Link</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!bio.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!bio.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>Complete Profile</Text>
          )}
        </TouchableOpacity>
      </View>

      {!saving && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => router.replace("/neighborhoods")}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ffff",
    textAlign: "center",
    marginBottom: 8,
  },
  stepContainer: {
    marginBottom: 30,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    marginTop: 30,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#CCC",
    marginBottom: 20,
    lineHeight: 20,
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 25,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: "#00ffff",
  },
  uploadingAvatar: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  avatarText: {
    color: "#00AA00",
    fontSize: 14,
  },
  uploadingText: {
    color: "#00ffff",
    marginTop: 10,
    fontSize: 12,
  },
  cidText: {
    fontSize: 10,
    color: "#00AA00",
    textAlign: "center",
    fontFamily: "monospace",
    marginTop: -10,
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    color: "#00ffff",
    marginBottom: 8,
    marginTop: 15,
  },
  bioInput: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 15,
    color: "#FFF",
    fontSize: 16,
    minHeight: 120,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 15,
    color: "#FFF",
    fontSize: 16,
    marginBottom: 10,
  },
  charCount: {
    fontSize: 12,
    color: "#00AA00",
    textAlign: "right",
    marginTop: 5,
  },
  linkContainer: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#333",
  },
  addButton: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00AA00",
  },
  addButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  buttonContainer: {
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  saveButtonDisabled: {
    backgroundColor: "#333",
  },
  saveButtonText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 16,
  },
  skipButton: {
    padding: 15,
    alignItems: "center",
  },
  skipButtonText: {
    color: "#00AA00",
    fontSize: 14,
  },
});
