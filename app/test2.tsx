// app/camera/stream.tsx - UPDATED
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import * as Device from "expo-device";

export default function StreamScreen() {
  const [recording, setRecording] = useState(false);
  const [magnetUri, setMagnetUri] = useState<string | null>(null);
  const [webTorrentLoaded, setWebTorrentLoaded] = useState(false);

  // Load WebTorrent on component mount
  useEffect(() => {
    loadWebTorrent();
  }, []);

  const loadWebTorrent = async () => {
    // Check if already loaded
    if ((window as any).WebTorrent) {
      console.log("✅ WebTorrent already loaded");
      setWebTorrentLoaded(true);
      return;
    }

    try {
      // Method 1: Try to load from our public loader
      const script = document.createElement("script");
      script.src = "/webtorrent/webtorrent-loader.js";
      script.onload = () => {
        console.log("🌪️ WebTorrent loader script loaded");

        // Listen for the loaded event
        window.addEventListener("webtorrent-loaded", () => {
          setWebTorrentLoaded(true);
        });

        // Fallback: check every 500ms if WebTorrent loaded
        const checkInterval = setInterval(() => {
          if ((window as any).WebTorrent) {
            setWebTorrentLoaded(true);
            clearInterval(checkInterval);
          }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!webTorrentLoaded) {
            clearInterval(checkInterval);
            loadWebTorrentFallback();
          }
        }, 10000);
      };

      script.onerror = () => {
        console.log("❌ Failed to load from public folder, using fallback");
        loadWebTorrentFallback();
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error("Error loading WebTorrent:", error);
      loadWebTorrentFallback();
    }
  };

  const loadWebTorrentFallback = () => {
    // Direct CDN fallback
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
    script.onload = () => {
      console.log("✅ WebTorrent loaded via CDN fallback");
      setWebTorrentLoaded(true);
    };
    script.onerror = () => {
      Alert.alert("Error", "Failed to load WebTorrent");
    };
    document.head.appendChild(script);
  };

const startRecording = async () => {
  // Check if we're on a device that supports camera
  if (!Device.isDevice && Device.osName !== "web") {
    Alert.alert(
      "Not Supported",
      "Camera recording is only supported on real devices"
    );
    return;
  }

  try {
    // FIRST: Check and request permissions on iOS
    if (Device.osName === "iOS") {
      // Check current permission status
      const cameraPermission = await Camera.requestCameraPermissionsAsync();
      const microphonePermission = await Audio.requestPermissionsAsync();

      if (!cameraPermission.granted || !microphonePermission.granted) {
        Alert.alert(
          "Permissions Required",
          "Please allow camera and microphone access to stream to your neighborhood",
          [{ text: "OK" }]
        );
        return;
      }
    }

    // NOW set recording state to true (UI will update to red)
    setRecording(true);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: true,
    });

    const options = {
      mimeType: "video/webm; codecs=vp8,opus",
      videoBitsPerSecond: 2500000,
    };

    const mediaRecorder = new MediaRecorder(stream, options);
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: "video/webm" });

        // Ensure WebTorrent is loaded
        if (!webTorrentLoaded) {
          await loadWebTorrent();
        }

        const client = new (window as any).WebTorrent();

        client.seed(
          blob,
          {
            name: `neighborhood-${Date.now()}.webm`,
            announce: [
              "wss://tracker.openwebtorrent.com",
              "wss://tracker.btorrent.xyz",
              "wss://tracker.files.fm:7073/announce",
            ],
          },
          (torrent: any) => {
            console.log("🌪️ Torrent created:", torrent.magnetURI);
            setMagnetUri(torrent.magnetURI);

            const videoUrl = URL.createObjectURL(blob);
            createVideoPlayback(videoUrl);
            copyToClipboard(torrent.magnetURI);

            Alert.alert(
              "Ready for Neighborhood!",
              "Magnet link copied to clipboard. Share it in your neighborhood chat!",
              [{ text: "OK", style: "default" }]
            );
          }
        );
      } catch (error) {
        console.error("Torrent creation error:", error);
        Alert.alert("Error", "Failed to create torrent");
      } finally {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      }
    };

    mediaRecorder.start();

    // Auto-stop after 10 seconds for neighborhood clips
    setTimeout(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 10000);
  } catch (err) {
    console.error("Recording error:", err);
    Alert.alert(
      "Camera Error",
      "Please allow camera access to stream to your neighborhood"
    );
    setRecording(false); // Reset recording state on error
  }
};

  const createVideoPlayback = (videoUrl: string) => {
    // Remove existing video if any
    const existingVideo = document.getElementById("neighborhood-video");
    if (existingVideo) {
      existingVideo.remove();
    }

    const video = document.createElement("video");
    video.id = "neighborhood-video";
    video.controls = true;
    video.style.width = "100%";
    video.style.maxWidth = "400px";
    video.style.marginTop = "20px";
    video.style.borderRadius = "10px";
    video.style.boxShadow = "0 4px 20px rgba(0, 255, 0, 0.3)";
    video.src = videoUrl;

    const container = document.getElementById("video-container");
    if (container) {
      container.appendChild(video);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log("📋 Magnet copied to clipboard");
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  const getDeviceInfo = () => {
    return {
      isDevice: Device.isDevice,
      deviceName: Device.deviceName,
      model: Device.modelName,
      os: Device.osName,
      platform: Device.platformApiLevel === null ? "web" : "android",
    };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎥 Neighborhood Live Stream</Text>
        <Text style={styles.subtitle}>
          Record and share videos instantly via P2P
        </Text>

        {/* Device info */}
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceText}>
            📱 {getDeviceInfo().model} • {getDeviceInfo().os}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          recording && styles.recordingButton,
          !webTorrentLoaded && styles.disabledButton,
        ]}
        onPress={startRecording}
        disabled={recording || !webTorrentLoaded}
      >
        <Text style={styles.buttonText}>
          {!webTorrentLoaded
            ? "🔄 Loading..."
            : recording
            ? "⏹️ Recording... (10s)"
            : "🎥 Start Neighborhood Stream"}
        </Text>
      </TouchableOpacity>

      {/* Video playback container */}
      <View id="video-container" style={styles.videoContainer} />

      {magnetUri && (
        <View style={styles.magnetContainer}>
          <Text style={styles.magnetLabel}>
            🚀 Ready for your neighborhood!
          </Text>
          <Text style={styles.magnetDescription}>
            Share this magnet link in your neighborhood chat. Anyone with the
            link can watch and help seed the video.
          </Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => copyToClipboard(magnetUri)}
          >
            <Text style={styles.copyButtonText}>📋 Copy Magnet Link</Text>
          </TouchableOpacity>
          <Text style={styles.magnetText} selectable={true}>
            {magnetUri}
          </Text>
        </View>
      )}

      {/* P2P Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {webTorrentLoaded
            ? "✅ WebTorrent Ready"
            : "🔄 Loading P2P Engine..."}
        </Text>
        <Text style={styles.statusSubtext}>
          Powered by decentralized WebTorrent technology
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#000",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    color: "#00ff00",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 16,
  },
  deviceInfo: {
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  deviceText: {
    color: "#888",
    fontSize: 12,
  },
  button: {
    backgroundColor: "rgba(0, 255, 0, 0.8)",
    paddingHorizontal: 30,
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 20,
  },
  recordingButton: {
    backgroundColor: "rgba(255, 0, 0, 0.8)",
  },
  disabledButton: {
    backgroundColor: "rgba(100, 100, 100, 0.6)",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  videoContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  magnetContainer: {
    backgroundColor: "#111",
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#00ff00",
    marginBottom: 20,
  },
  magnetLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ff00",
    marginBottom: 8,
    textAlign: "center",
  },
  magnetDescription: {
    color: "#ccc",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#00ff00",
  },
  copyButtonText: {
    color: "#00ff00",
    fontWeight: "bold",
    fontSize: 16,
  },
  magnetText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 8,
    fontFamily: "monospace",
  },
  statusContainer: {
    alignItems: "center",
    marginTop: "auto",
    paddingVertical: 20,
  },
  statusText: {
    color: "#00ff00",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  statusSubtext: {
    color: "#666",
    fontSize: 12,
  },
});
