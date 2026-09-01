import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// ✅ FIX: Correct parameter order: (fileUri, fileName, type, neighborhoodId)
export const uploadToIPFS = async (fileUri, fileName, type, neighborhoodId) => {
  const token = await AsyncStorage.getItem("token");
  if (!token) throw new Error("No authentication token found");

  if (Platform.OS === "web") {
    const formData = new FormData();
    const response = await fetch(fileUri);
    const blob = await response.blob();

    formData.append("video", blob, fileName);
    formData.append("title", fileName);
    formData.append("description", `Uploaded ${type} - ${fileName}`);

    // ✅ FIX: Only append if it actually exists
    if (neighborhoodId) {
      formData.append("neighborhoodId", neighborhoodId);
    }

    const res = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`IPFS upload failed: ${res.status} - ${errorText}`);
    }

    const result = await res.json();
    return result;
  } else {
    // Native React Native fallback
    const uploadResponse = await FileSystem.uploadAsync(
      `${BACKEND_URL}/upload`,
      fileUri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "video",
        parameters: {
          title: fileName,
          description: `Uploaded ${type} - ${fileName}`,
          neighborhoodId: neighborhoodId || "",
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
      throw new Error(
        `IPFS upload failed: ${uploadResponse.status} - ${uploadResponse.body}`,
      );
    }

    return JSON.parse(uploadResponse.body);
  }
};
