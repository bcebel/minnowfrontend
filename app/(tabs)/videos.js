import React, { useState } from "react";
import { Platform, View, Text, Button, TextInput } from "react-native";
import { WebView } from "react-native-webview";
import * as DocumentPicker from "expo-document-picker";

const torrentHtml = `
  <video id="torrentVideo" controls style="width: 100%;"></video>
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
  <script>
    window.addEventListener("message", (event) => {
      const magnetLink = event.data.magnetLink;
      if (magnetLink) {
        const client = new WebTorrent();
        client.add(magnetLink, (torrent) => {
          const file = torrent.files.find(f => f.name.endsWith('.mp4'));
          if (file) file.renderTo("#torrentVideo");
        });
      }
    });
  </script>
`;

export default function App() {
  const [magnetLink, setMagnetLink] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const pickVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/*" });
    if (result.type !== "cancel") {
      const uri = result.uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      await uploadVideo(blob);
    }
  };

  const uploadVideo = async (blob) => {
    const token = "your-jwt-here"; // Replace with your auth logic (AsyncStorage?)
    const formData = new FormData();
    formData.append("video", blob, "video.mp4");
    formData.append("title", title || "Untitled Video");
    formData.append("description", description || "");

    try {
      const res = await fetch(
        "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data = await res.json();
      if (res.ok) {
        setMagnetLink(data.magnetLink);
        alert(`Uploaded!\nIPFS: ${data.ipfsUrl}\nMagnet: ${data.magnetLink}`);
      } else throw new Error("Upload failed");
    } catch (error) {
      console.error(error);
      alert("Upload error");
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, textAlign: "center", marginBottom: 10 }}>
        Upload your greatest. Let us bask in it.
      </Text>
      <TextInput
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
        style={{ borderWidth: 1, padding: 5, marginBottom: 10 }}
      />
      <TextInput
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ borderWidth: 1, padding: 5, marginBottom: 10, height: 80 }}
      />
      <Button title="Pick Video" onPress={pickVideo} />
      {magnetLink && (
        <WebView
          source={{ html: torrentHtml }}
          style={{ flex: 1, marginTop: 20 }}
          onLoad={() =>
            this.webview.injectJavaScript(
              `window.postMessage({ magnetLink: "${magnetLink}" }, "*");`
            )
          }
        />
      )}
    </View>
  );
}
