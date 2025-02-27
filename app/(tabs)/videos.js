import React, { useState } from "react";
import { Button, View, Text, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { S3 } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import * as FileSystem from 'expo-file-system';

const FILEBASE_ACCESS_KEY = process.env.EXPO_PUBLIC_FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.EXPO_PUBLIC_FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.EXPO_PUBLIC_FILEBASE_BUCKET_NAME;

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

    const s3 = new S3({
      endpoint: "https://s3.filebase.com",
      accessKeyId: FILEBASE_ACCESS_KEY,
      secretAccessKey: FILEBASE_SECRET_KEY,
      region: "us-east-1",
    });

    const fileName = uuidv4();
    let fileData;
    if (Platform.OS === "web") {
      fileData = Buffer.from(resultData.base64, "base64");
    } else {
      const fileInfo = await FileSystem.readAsStringAsync(videoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      fileData = Buffer.from(fileInfo, "base64");
    }

    const params = {
      Bucket: FILEBASE_BUCKET_NAME,
      Key: fileName,
      Body: fileData,
      ContentType: resultData.type,
    };

    s3.upload(params, (err, data) => {
      if (err) {
        console.error("S3 upload error:", err);
        Alert.alert("Upload Failed", err.message || "An S3 error occurred.");
      } else {
        console.log("S3 upload successful:", data);
        Alert.alert("Upload Successful", `Location: ${data.Location}`);
      }
    });
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
