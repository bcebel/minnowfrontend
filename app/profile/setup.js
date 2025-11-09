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
} from "react-native";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

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
  const [affiliateLinks, setAffiliateLinks] = useState([
    { url: "", title: "" },
  ]);

  const [updateProfile] = useMutation(UPDATE_PROFILE);
  const [addAffiliateLink] = useMutation(ADD_AFFILIATE_LINK);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfilePhoto(result.assets[0].uri);
      // Here you'd upload to your backend and get a URL
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
        await updateProfile({
          variables: {
            bio,
            profilePhoto: profilePhoto || "", // You'd upload and get real URL
          },
        });
        setStep(2);
      } catch (err) {
        alert("Error saving profile: " + err.message);
      }
    } else if (step === 2) {
      // Save affiliate links
      try {
        for (const link of affiliateLinks) {
          if (link.url.trim()) {
            await addAffiliateLink({
              variables: {
                url: link.url,
                title: link.title || "",
                description: "",
              },
            });
          }
        }
        router.replace("/neighborhoods");
      } catch (err) {
        alert("Error saving links: " + err.message);
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Complete Your Profile</Text>
      <Text style={styles.subtitle}>Step {step} of 2</Text>

      {step === 1 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>About You</Text>

          <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
            <Image
              source={{
                uri: profilePhoto || "https://via.placeholder.com/150",
              }}
              style={styles.avatar}
            />
            <Text style={styles.avatarText}>Tap to add photo</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={styles.bioInput}
            placeholder="Tell everyone about yourself... What are you passionate about? What do you do?"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
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
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.nextButton, !bio.trim() && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={step === 1 && !bio.trim()}
        >
          <Text style={styles.nextButtonText}>
            {step === 2 ? "Finish" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>

      {step === 2 && (
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
    color: "#00FF00",
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
    color: "#00FF00",
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
    borderColor: "#00FF00",
  },
  avatarText: {
    color: "#00AA00",
    fontSize: 14,
  },
  label: {
    fontSize: 16,
    color: "#00FF00",
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
    color: "#00FF00",
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
    color: "#00FF00",
    fontWeight: "bold",
  },
  nextButton: {
    flex: 2,
    backgroundColor: "#00FF00",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
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
