export const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Now";
  }
};

export const handleFilePress = (message) => {
  if (message.fileUrl) {
    const url = message.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);
    Alert.alert(message.fileName || "File", "What would you like to do?", [
      {
        text: "Open",
        onPress: () =>
          Linking.openURL(url).catch((err) =>
            Alert.alert("Error", "Could not open file")
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }
};

export const uploadToIPFS = async (fileUri, fileName, fileType, token) => {
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append("video", blob, fileName);
    formData.append("title", fileName || `Uploaded ${fileType}`);
    formData.append("description", `Shared in neighborhood chat`);

    const res = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${res.status} - ${errorText}`);
    }

    const result = await res.json();
    return result.ipfsUrl;
  } catch (error) {
    console.error("❌ Upload error:", error);
    throw error;
  }
};
