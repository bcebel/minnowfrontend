import React, { useState } from "react";
import { Button, View, Text, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
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
    formData.append("video", {
      uri: videoUri,
      name: "video.mp4",
      type: "video/mp4",
    });

    try {
      const response = await axios.post(
        `BACKEND_URL"/upload"`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      Alert.alert("Upload Successful", `CID: ${response.data.cid}`);
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Upload Failed",
        "An error occurred while uploading the video."
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
