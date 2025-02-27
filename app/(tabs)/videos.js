import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { S3 } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import * as FileSystem from 'expo-file-system';
import { Buffer } from "buffer"; // Import Buffer

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  

export default function App() {
  const [video, setVideo] = useState(null);

  const pickVideo = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 1,
    });

    if (!result.canceled) {
      setVideo(result.assets[0]);
    }
  };

  const uploadVideo = async () => {
    if (!video) return;

    const formData = new FormData();
    formData.append('video', {
      uri: video.uri,
      type: 'video/mp4', // Adjust type as needed
      name: 'video.mp4', // Or generate a unique name
    });

    try {
      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      console.log('Upload successful:', data);
      // Handle the returned IPFS URL and magnet link
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Button title="Pick a video" onPress={pickVideo} />
      {video && <Button title="Upload video" onPress={uploadVideo} />}
      {video && <Text>Video Selected</Text>}
    </View>
  );
}