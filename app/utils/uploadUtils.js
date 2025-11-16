// utils/uploadUtils.js
import { File, Directory, Paths } from "expo-file-system";
import { fetch } from "expo/fetch";

export const uploadToIPFS = async (fileUri, fileName, fileType, token) => {
  try {
    console.log("📤 Starting upload with Expo FileSystem:", {
      fileUri,
      fileName,
      fileType,
    });

    // Create a File instance from the URI
    const file = new File(fileUri);

    // Verify file exists and get info
    const fileInfo = await file.info();
    console.log("📄 File info:", fileInfo);

    if (!fileInfo.exists) {
      throw new Error("File does not exist or cannot be accessed");
    }

    // Create FormData using the File instance directly
    const formData = new FormData();
    formData.append("video", file); // Backend expects 'video' field
    formData.append("title", fileName || `Uploaded ${fileType}`);
    formData.append("description", `Shared from app`);

    console.log("🚀 Sending to backend...");

    const response = await fetch(
      "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Let fetch set Content-Type automatically for FormData
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Upload failed:", response.status, errorText);
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("✅ Upload successful:", result);

    // Wait for IPFS processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return result.ipfsUrl;
  } catch (error) {
    console.error("❌ Upload error:", error);
    throw error;
  }
};
