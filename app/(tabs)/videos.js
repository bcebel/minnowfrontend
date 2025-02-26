import React, { useState } from "react";
import { Button, View, Text, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Load the backend URL from environment variables
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
      mediaTypes: ["images", "videos"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
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

    const formData = new FormData();

      const fileInfo = {
        uri: videoUri,
        name: "video.mp4",
        type: "video/mp4",
      };
    
    formData.append("video", fileInfo);
    console.log("Uploading:", fileInfo);
    

    try {
      const response = await fetch(uploadRoute, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          // Don't set Content-Type header manually when sending FormData
        },
      });
console.log("Response status:", response.status);

      if (!response.ok) {
        // Handle non-2xx responses
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      Alert.alert("Upload Successful", `CID: ${data.cid}`);
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Upload Failed",
        error.message || "An error occurred while uploading the video."
      );
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
