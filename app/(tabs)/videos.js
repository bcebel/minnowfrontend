import React, { useState } from "react";
import { Button, View, Text, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system"; // Import FileSystem

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL.replace(/[\/;]$/, "");
const uploadRoute = `${BACKEND_URL}/upload`;

export default function App() {
  const [videoUri, setVideoUri] = useState(null);

  const pickVideo = async () => {
    // ... (permission request code) ...

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

  const uploadVideo = async () => {
    if (!videoUri) {
      Alert.alert("No Video Selected", "Please select a video first.");
      return;
    }

    const formData = new FormData();
    const asset = await FileSystem.readAsStringAsync(videoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileType = result.assets[0].type;
    const fileName = videoUri.split("/").pop();

    formData.append("video", {
      uri: videoUri,
      name: fileName,
      type: fileType,
    });

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
