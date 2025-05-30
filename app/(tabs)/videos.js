import React, { useState, useRef } from "react";
import {
  Platform,
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";

const torrentHtml = `<video id="torrentVideo" controls style="width: 100%;"></video>Add commentMore actions
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
  </script>`;

export default function App() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [magnetLink, setMagnetLink] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [facing, setFacing] = useState("back"); // String, not CameraType.back
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Need camera access, punk—grant it.</Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  const startRecording = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) uploadVideo(file);
      };
      input.click();
    } else {
      console.log("Starting recording...");
      if (cameraRef.current && !recording) {
        setRecording(true);
        const video = await cameraRef.current.recordAsync({ maxDuration: 10 });
        console.log("Recorded:", video.uri);
        setRecording(false);
        uploadVideo(video.uri);
      } else {
        console.log("Camera ref missing or already recording");
      }
    }
  };

  const stopRecording = async () => {
    if (cameraRef.current && recording) {
      cameraRef.current.stopRecording();
      setRecording(false);
    }
  };

  const uploadVideo = async (source) => {
    setUploading(true);
    console.log("Starting upload...");
    const token =
      Platform.OS === "web"
        ? localStorage.getItem("token")
        : await AsyncStorage.getItem("token");
    if (!token) {
      console.log("No token");
      alert("Log in first, punk.");
      setUploading(false);
      return;
    }
    console.log("Token:", token.slice(0, 10) + "...");

    let blob;
    if (Platform.OS === "web") {
      blob = source;
      console.log("Web file:", blob.size, blob.type);
    } else {
      try {
        console.log("Fetching URI:", source);
        const response = await fetch(source);
        console.log("Fetch response:", response.ok, response.status);
        blob = await response.blob();
        console.log("Blob:", blob.size, blob.type);
      } catch (e) {
        console.error("Blob fetch failed:", e.message);
        alert("Can’t grab video—file issue.");
        setUploading(false);
        return;
      }
    }

    if (!blob || blob.size === 0) {
      console.log("Blob empty");
      alert("No video data, punk.");
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("video", blob, "video.mp4");
    formData.append("title", title || "Untitled Video");
    formData.append("description", description || "");
    console.log("FormData ready");

    try {
      console.log("Sending to backend...");
      const res = await fetch(
        "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      console.log("Fetch sent—waiting...");
      const text = await res.text();
      console.log("Server response:", res.status, text);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("JSON parse failed:", e.message);
        throw new Error(`Invalid JSON: ${text}`);
      }
      if (res.ok) {
        setMagnetLink(data.magnetLink);
        alert(`Uploaded!\nIPFS: ${data.ipfsUrl}\nMagnet: ${data.magnetLink}`);
      } else {
        throw new Error(data.error || text || "Upload failed—no details");
      }
    } catch (error) {
      console.error("Upload error:", error.message);
      alert(`Failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Record your greatest. Let us bask.</Text>
      {Platform.OS !== "web" && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing} // "back" or "front"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      {Platform.OS === "web" ? (
        <Button
          title={uploading ? "Uploading..." : "Pick & Upload Video"}
          onPress={startRecording}
          disabled={uploading}
        />
      ) : (
        <>
          <Button
            title={recording ? "Recording..." : "Start Recording"}
            onPress={startRecording}
            disabled={uploading || recording}
          />
          <Button
            title="Stop Recording"
            onPress={stopRecording}
            disabled={!recording}
            color="#ff4444"
          />
        </>
      )}
      {magnetLink && (
        <WebView
          source={{ html: torrentHtml }}
          style={styles.webview}
          onLoad={(e) =>
            e.nativeEvent.webView.injectJavaScript(
              `window.postMessage({ magnetLink: "${magnetLink}" }, "*");`
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 20, textAlign: "center", marginBottom: 20 },
  camera: { flex: 1, marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 5 },
  textarea: { height: 80 },
  webview: { flex: 1, marginTop: 20 },
});
