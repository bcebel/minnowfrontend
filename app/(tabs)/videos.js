import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { v4 as uuidv4 } from "uuid";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL.replace(/[\/;]$/, "");
const uploadRoute = `${BACKEND_URL}/upload`;

export default function App() {
  const [videoUri, setVideoUri] = useState(null);
  const [resultData, setResultData] = useState(null);

  const pickVideo = async () => {
    // ... (permission request code) ...

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
      setResultData(result.assets[0]);
    }
  };

  const uploadVideo = async () => {
    if (!videoUri) {
      Alert.alert("No Video Selected", "Please select a video first.");
      return;
    }

    const formData = new FormData();
    const fileType = resultData.type;
    const fileName = uuidv4();

    if (Platform.OS === "web") {
      //web code
      formData.append("video", resultData.base64);
      formData.append("name", fileName);
      formData.append("type", fileType);
    } else {
      //native code
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
