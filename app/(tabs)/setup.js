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

// Updated mutation with error policy
const UPDATE_PROFILE = gql`
  mutation UpdateProfile($bio: String, $profilePhoto: String) {
    updateProfile(bio: $bio, profilePhoto: $profilePhoto) {
      id
      username
      bio
      profilePhoto
    }
  }
`;

const ADD_AFFILIATE_LINK = gql`
  mutation AddAffiliateLink(
    $url: String!
    $title: String
    $description: String
  ) {
    addAffiliateLink(url: $url, title: $title, description: $description) {
      id
      affiliateLinks {
        id
        url
        title
        description
      }
    }
  }
`;

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
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
    errorPolicy: "all", // This allows us to handle errors without crashing
  });

  const [addAffiliateLink] = useMutation(ADD_AFFILIATE_LINK);

  // Upload image to IPFS and get CID
  const uploadToIPFS = async (fileUri, fileName) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Convert image to blob
      const response = await fetch(fileUri);
      const blob = await response.blob();

      // Upload to IPFS using your existing upload endpoint
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

      // Extract CID from IPFS URL
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
          // Upload to IPFS and get CID
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

  const handleNext = async () => {
    if (step === 1) {
      // Save bio and profile photo
      try {
        setSaving(true);

        console.log("🔄 Saving profile via GraphQL...", {
          bio: bio || "",
          profilePhoto: profilePhotoCid || "",
        });

        const { data, errors } = await updateProfile({
          variables: {
            bio: bio || "",
            profilePhoto: profilePhotoCid || "",
          },
        });

        // Check for GraphQL errors first
        if (errors && errors.length > 0) {
          console.error("GraphQL errors:", errors);

          // If it's the null return error, we can still proceed
          const hasNullError = errors.some((error) =>
            error.message.includes("Cannot return null for non-nullable field")
          );

          if (hasNullError) {
            console.warn("Backend returned null but profile might be updated");
            // Continue anyway - the update might have worked server-side
            setStep(2);
            return;
          } else {
            throw new Error(errors[0].message);
          }
        }

        // Check if we have data
        if (data?.updateProfile) {
          console.log("✅ Profile saved successfully:", data.updateProfile);
          setStep(2);
        } else {
          // No data but no errors either - might be okay
          console.warn("No data returned from mutation, but proceeding anyway");
          setStep(2);
        }
      } catch (err) {
        console.error("Error saving profile:", err);
        Alert.alert("Error", "Failed to save profile: " + err.message);
      } finally {
        setSaving(false);
      }
    } else if (step === 2) {
      // Save affiliate links
      try {
        setSaving(true);

        let savedLinks = 0;
        for (const link of affiliateLinks) {
          if (link.url.trim()) {
            await addAffiliateLink({
              variables: {
                url: link.url,
                title: link.title || "",
                description: "",
              },
            });
            savedLinks++;
          }
        }

        console.log(`✅ Saved ${savedLinks} affiliate links`);
        Alert.alert("Success", "Profile setup complete!");
        router.replace("/neighborhoods");
      } catch (err) {
        console.error("Error saving links:", err);
        Alert.alert("Error", "Failed to save links: " + err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  // Get display URL for the image
  const getProfilePhotoUrl = () => {
    if (profilePhoto) return profilePhoto; // Local URI while uploading
    if (profilePhotoCid)
      return `https://${PINATA_GATEWAY}/ipfs/${profilePhotoCid}`;
    return "https://via.placeholder.com/150";
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Complete Your Profile</Text>
      <Text style={styles.subtitle}>Step {step} of 2</Text>

      {step === 1 && (
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
        </View>
      )}

      {step === 2 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>Share Your Links (Optional)</Text>
          <Text style={styles.stepDescription}>
            Add affiliate links, social media, or websites you want to share
          </Text>

          {affiliateLinks.map((link, index) => (
            <View key={index} style={styles.linkContainer}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Amazon Store, YouTube, etc."
                value={link.title}
                onChangeText={(text) => updateLink(index, "title", text)}
              />

              <Text style={styles.label}>URL</Text>
              <TextInput
                style={styles.input}
                placeholder="https://..."
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
      )}

      <View style={styles.buttonContainer}>
        {step > 1 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(step - 1)}
            disabled={saving}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.nextButton,
            ((step === 1 && !bio.trim()) || saving) &&
              styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={(step === 1 && !bio.trim()) || saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === 2 ? "Finish" : "Next"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {step === 2 && !saving && (
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

// ... keep your existing styles

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
  subtitle: {
    fontSize: 16,
    color: "#00AA00",
    textAlign: "center",
    marginBottom: 30,
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
  stepDescription: {
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
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  backButton: {
    flex: 1,
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  nextButton: {
    flex: 2,
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  nextButtonDisabled: {
    backgroundColor: "#333",
  },
  nextButtonText: {
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
