import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

// Load the backend URL from environment variables
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL.replace(/[\/;]$/, "");
const uploadRoute = `${BACKEND_URL}/upload`;

export default function App() {
  const [videoUri, setVideoUri] = useState(null);
  const [resultData, setResultData] = useState(null);

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
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      videoMaxDuration: 600,
      base64: Platform.OS === "web", // Enable base64 only for web
    });

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
      setResultData(result.assets[0]);
    }
  };

  // Function to upload the selected video to the backend
  const uploadVideo = async () => {
    if (!videoUri) {
      Alert.alert("No Video Selected", "Please select a video first.");
      return;
    }

    const formData = new FormData();
    const fileType = resultData.type || "video/mp4"; // Default to 'video/mp4' if type is missing
    const fileName = videoUri.split("/").pop() || "video.mp4"; // Default to 'video.mp4' if name is missing

    if (Platform.OS === "web") {
      // Handle web upload
      const base64Data = resultData.base64.split(",")[1]; // Extract base64 data
      const blob = base64ToBlob(resultData.base64, fileType); // Convert base64 to Blob
      formData.append("video", blob, fileName); // Append Blob with file name
    } else {
      // Handle native upload
      formData.append("video", {
        uri: videoUri,
        name: fileName,
        type: fileType,
      });
    }

    console.log("Uploading:", {
      uri: videoUri,
      name: fileName,
      type: fileType,
    });

    try {
      const response = await fetch(uploadRoute, {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      Alert.alert("Upload Successful", `CID: ${data.cid}`);
    } catch (error) {
      console.error(error);
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

// Utility function to convert base64 to Blob
function base64ToBlob(base64, mimeType) {
  const byteString = atob(base64.split(",")[1]); // Decode base64 string
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: mimeType });
}
