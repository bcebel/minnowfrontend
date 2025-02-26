import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL.replace(/[\/;]$/, "");
const uploadRoute = `${BACKEND_URL}/upload`;

export default function App() {
  const [videoUri, setVideoUri] = useState(null);

  // Function to pick a video from the device
  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Sorry, we need camera roll permissions to make this work!"
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 600,
    });

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
    }
  };

  // Function to upload the selected video to the backend
  const uploadVideo = async () => {
    if (!videoUri) {
      Alert.alert("No Video Selected", "Please select a video first.");
      return;
    }

    const fileName = videoUri.split("/").pop();
    const fileType = "video/mp4"; // Assuming MP4 format

    const formData = new FormData();
    formData.append("video", {
      uri: videoUri,
      name: fileName,
      type: fileType,
    });

    try {
      const response = await fetch(uploadRoute, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      Alert.alert("Upload Successful", `File Key: ${data.fileKey}`);
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload Failed", error.message || "An error occurred.");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Button title="Pick a Video" onPress={pickVideo} />
      {videoUri && <Text style={{ marginVertical: 20 }}>Video Selected!</Text>}
      <Button title="Upload Video" onPress={uploadVideo} disabled={!videoUri} />
    </View>
  );
}
