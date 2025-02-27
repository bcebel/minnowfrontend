import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ObjectManager } from "@filebase/sdk";
import { v4 as uuidv4 } from "uuid";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";

const FILEBASE_ACCESS_KEY = process.env.EXPO_PUBLIC_FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.EXPO_PUBLIC_FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.EXPO_PUBLIC_FILEBASE_BUCKET_NAME;

export default function App() {
  // ... (pickVideo, useState, etc.) ...

  const uploadVideo = async () => {
    // ... (videoUri check, fileName, fileData) ...

    const objectManager = new ObjectManager(
      FILEBASE_ACCESS_KEY,
      FILEBASE_SECRET_KEY,
      {
        bucket: FILEBASE_BUCKET_NAME,
      }
    );

    try {
      const uploadedObject = await objectManager.upload(fileName, fileData, {
        contentType: resultData.type,
      });
      console.log("Filebase upload successful:", uploadedObject);
      Alert.alert("Upload Successful", `Location: ${uploadedObject.Location}`);
    } catch (err) {
      console.error("Filebase upload error:", err);
      Alert.alert("Upload Failed", err.message || "An error occurred.");
    }
  };
  // ... (rest of your component) ...

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Button title="Pick a Video" onPress={pickVideo} />
      {videoUri && <Text style={{ marginVertical: 20 }}>Video Selected!</Text>}
      <Button title="Upload Video" onPress={uploadVideo} disabled={!videoUri} />
    </View>
  );
}
