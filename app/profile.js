// app/profile/edit.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";

const UPDATE_PROFILE = gql`
  mutation UpdateProfile($bio: String!) {
    updateProfile(bio: $bio) {
      id
      username
      bio
    }
  }
`;

export default function EditProfileScreen() {
  const [bio, setBio] = useState("");
  const [updateProfile] = useMutation(UPDATE_PROFILE);

  const handleSave = async () => {
    try {
      await updateProfile({ variables: { bio } });
      alert("Profile updated!");
    } catch (err) {
      alert("Error updating profile: " + err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Edit Your Profile</Text>
      <TextInput
        style={styles.bioInput}
        placeholder="Tell everyone about yourself..."
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={4}
      />
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Bio</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#130720",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 30,
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
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#00ffff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  saveButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
});
