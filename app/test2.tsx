// app/camera/stream.tsx - PLATFORM-SPECIFIC
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import * as Device from "expo-device";
import * as MediaLibrary from "expo-media-library";

// Conditionally import expo-camera only on native
let CameraView: any = null;
let useCameraPermissions: any = () => [{ granted: false }, () => {}];
if (Platform.OS !== "web") {
  try {
    const cameraModule = require("expo-camera");
    CameraView = cameraModule.CameraView;
    useCameraPermissions = cameraModule.useCameraPermissions;
  } catch (error) {
    console.log("Expo Camera not available on web");
  }
}

export default function StreamScreen() {
  const [recording, setRecording] = useState(false);
  const [magnetUri, setMagnetUri] = useState<string | null>(null);
  const [webTorrentLoaded, setWebTorrentLoaded] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();

  const cameraRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load WebTorrent on component mount
  useEffect(() => {
    loadWebTorrent();
  }, []);

  // Request permissions on native
  useEffect(() => {
    if (Platform.OS !== "web" && !permission?.granted) {
      requestPermission();
    }
    if (Platform.OS !== "web" && !mediaPermission?.granted) {
      requestMediaPermission();
    }
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

  const startNativeRecording = async () => {
    if (!permission?.granted) {
      Alert.alert("Camera Permission Required", "Please allow camera access");
      return;
    }

    try {
      setRecording(true);

      if (cameraRef.current) {
        const videoRecordOptions = {
          maxDuration: 10,
          quality: "720p" as const,
        };

        const videoRecording = await cameraRef.current.recordAsync(
          videoRecordOptions
        );
        await createTorrentFromVideo(videoRecording.uri);
      }
    } catch (err) {
      console.error("Native recording error:", err);
      Alert.alert("Recording Failed", "Could not start camera recording");
      setRecording(false);
    }
  };

  // 🌐 WEB RECORDING (Laptop/Browser)
  const startWebRecording = async () => {
    try {
      setRecording(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      const options = {
        mimeType: "video/webm; codecs=vp8,opus",
        videoBitsPerSecond: 2500000,
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "video/webm" });
          await createTorrentFromBlob(blob);
        } catch (error) {
          console.error("Torrent creation error:", error);
          Alert.alert("Error", "Failed to create torrent");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          setRecording(false);
        }
      };

      mediaRecorder.start();

      // Auto-stop after 10 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 10000);
    } catch (err) {
      console.error("Web recording error:", err);
      Alert.alert("Camera Error", "Please allow camera access");
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    if (Platform.OS === "web") {
      // Stop web recording
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    } else {
      // Stop native recording
      if (cameraRef.current) {
        await cameraRef.current.stopRecording();
      }
    }
  };

  const createTorrentFromBlob = async (blob: Blob) => {
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
        copyToClipboard(torrent.magnetURI);

        Alert.alert(
          "Ready for Neighborhood!",
          "Magnet link copied to clipboard. Share it in your neighborhood chat!",
          [{ text: "OK", style: "default" }]
        );
        setRecording(false);
      }
    );
  };

  const createTorrentFromVideo = async (videoUri: string) => {
    try {
      const response = await fetch(videoUri);
      const blob = await response.blob();
      await createTorrentFromBlob(blob);
    } catch (error) {
      console.error("Torrent creation error:", error);
      Alert.alert("Error", "Failed to create torrent from recording");
      setRecording(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log("📋 Magnet copied to clipboard");
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  // Choose the right recording function based on platform
  const startRecording =
    Platform.OS === "web" ? startWebRecording : startNativeRecording;

  // Render different UI based on platform
  const renderCameraSection = () => {
    if (Platform.OS === "web") {
      // Web: Simple button approach (no camera preview)
      return (
        <View style={styles.webContainer}>
          <Text style={styles.webCameraText}>📹 Web Camera Ready</Text>
          <Text style={styles.webInstructions}>
            Press record to start 10-second neighborhood stream
          </Text>
        </View>
      );
    } else {
      // Native: Expo Camera with preview
      if (!permission) {
        return (
          <Text style={styles.loadingText}>
            Requesting camera permissions...
          </Text>
        );
      }

      if (!permission.granted) {
        return (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>
              We need your permission to access the camera
            </Text>
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          mode="video"
        >
          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              style={[styles.recordButton, recording && styles.recordingButton]}
              onPress={recording ? stopRecording : startRecording}
              disabled={!webTorrentLoaded}
            >
              <Text style={styles.recordButtonText}>
                {recording ? "⏹️" : "🎥"}
              </Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎥 Neighborhood Live Stream</Text>
        <Text style={styles.subtitle}>
          Record and share videos instantly via P2P
        </Text>
        <Text style={styles.platformText}>
          Platform: {Platform.OS === "web" ? "🌐 Web" : "📱 Native"}
        </Text>
      </View>

      {/* Camera Section - Different per platform */}
      {renderCameraSection()}

      {/* Single Control Button */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.button,
            recording && styles.recordingButton,
            !webTorrentLoaded && styles.disabledButton,
          ]}
          onPress={recording ? stopRecording : startRecording}
          disabled={!webTorrentLoaded}
        >
          <Text style={styles.buttonText}>
            {!webTorrentLoaded
              ? "🔄 Loading WebTorrent..."
              : recording
              ? "⏹️ Stop Recording (10s)"
              : "🎥 Start Neighborhood Stream"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Video playback container for web */}
      {Platform.OS === "web" && (
        <View id="video-container" style={styles.videoContainer} />
      )}

      {magnetUri && (
        <View style={styles.magnetContainer}>
          <Text style={styles.magnetLabel}>
            🚀 Ready for your neighborhood!
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

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {webTorrentLoaded
            ? "✅ WebTorrent Ready"
            : "🔄 Loading P2P Engine..."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
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
    marginBottom: 8,
  },
  platformText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  webContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#111",
    margin: 20,
    borderRadius: 10,
  },
  webCameraText: {
    fontSize: 18,
    color: "#00ff00",
    marginBottom: 8,
  },
  webInstructions: {
    fontSize: 14,
    color: "#ccc",
    textAlign: "center",
  },
  permissionContainer: {
    alignItems: "center",
    padding: 20,
  },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    margin: 20,
    fontSize: 16,
  },
  loadingText: {
    color: "#fff",
    textAlign: "center",
    padding: 40,
  },
  camera: {
    flex: 1,
    width: "100%",
    minHeight: 400,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 30,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 255, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingButton: {
    backgroundColor: "rgba(255, 0, 0, 0.8)",
  },
  recordButtonText: {
    fontSize: 24,
  },
  controls: {
    padding: 20,
  },
  button: {
    backgroundColor: "rgba(0, 255, 0, 0.8)",
    paddingHorizontal: 30,
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: "center",
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
    margin: 20,
  },
  magnetLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ff00",
    marginBottom: 8,
    textAlign: "center",
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
    paddingVertical: 20,
  },
  statusText: {
    color: "#00ff00",
    fontSize: 14,
    fontWeight: "bold",
  },
});
