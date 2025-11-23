// app/camera/stream.tsx - FIXED VERSION
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

const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isChrome = /chrome|chromium|crios/i.test(userAgent);

  return {
    isIOS,
    isSafari,
    isChrome,
    isIOSChrome: isIOS && isChrome,
    isIOSSafari: isIOS && isSafari,
    userAgent,
  };
};

export default function StreamScreen() {
  const [browserInfo, setBrowserInfo] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const [magnetUri, setMagnetUri] = useState<string | null>(null);
  const [webTorrentLoaded, setWebTorrentLoaded] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true); // ADD THIS LINE!

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load WebTorrent on component mount
  useEffect(() => {
    loadWebTorrent();
    checkCameraSupport();
    setBrowserInfo(getBrowserInfo());
  }, []);

  const loadWebTorrent = async () => {
    // Check if already loaded
    if ((window as any).WebTorrent) {
      console.log("✅ WebTorrent already loaded");
      setWebTorrentLoaded(true);
      return;
    }

    try {
      // Try to load from CDN
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
      script.onload = () => {
        console.log("✅ WebTorrent loaded via CDN");
        setWebTorrentLoaded(true);
      };
      script.onerror = () => {
        console.log("❌ Failed to load WebTorrent from CDN");
        Alert.alert("Error", "Failed to load WebTorrent");
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error("Error loading WebTorrent:", error);
    }
  };

  // Update the checkCameraSupport function
  const checkCameraSupport = () => {
    const browser = getBrowserInfo();
    console.log("🌐 Browser detection:", browser);

    if (browser.isIOSChrome) {
      Alert.alert(
        "Use Safari for Camera",
        "iOS Chrome doesn't support camera access. Please use Safari browser to record videos.",
        [{ text: "OK" }]
      );
      setCameraAvailable(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraAvailable(false);
      return;
    }

    setCameraAvailable(true);
  };

  const startRecording = async () => {
    console.log("🎥 Start recording pressed on:", Platform.OS);

    // ADD CAMERA AVAILABLE CHECK
    if (!cameraAvailable) {
      Alert.alert(
        "Camera Not Available",
        "Camera access is not supported in your current browser. Please use Safari on iOS.",
        [{ text: "OK" }]
      );
      return;
    }

    try {
      setRecording(true);

      if (Platform.OS === "web") {
        await startWebRecording();
      } else {
        // For iOS/Android, try the web API first (many mobile browsers support it)
        await startWebRecording();
      }
    } catch (error) {
      console.error("Recording error:", error);
      Alert.alert(
        "Recording Failed",
        `Could not start recording: ${error.message}`
      );
      setRecording(false);
    }
  };

  const startWebRecording = async () => {
    console.log("Starting web recording...");

    try {
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
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log("Recording stopped, creating torrent...");
        try {
          const blob = new Blob(chunks, { type: "video/webm" });
          await createTorrentFromBlob(blob);
        } catch (error) {
          console.error("Torrent creation error:", error);
          Alert.alert("Error", "Failed to create torrent");
        } finally {
          // Clean up
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
          }
          setRecording(false);
        }
      };

      mediaRecorder.start();
      console.log("Recording started");

      // Auto-stop after 10 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          console.log("Auto-stopping recording after 10 seconds");
          mediaRecorder.stop();
        }
      }, 10000);
    } catch (error) {
      console.error("Web recording error:", error);
      throw error;
    }
  };

  const stopRecording = async () => {
    console.log("⏹️ Stop recording pressed");

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setRecording(false);
  };

  const createTorrentFromBlob = async (blob: Blob) => {
    console.log("Creating torrent from blob...");

    if (!webTorrentLoaded) {
      console.log("WebTorrent not loaded, loading now...");
      await loadWebTorrent();
      // Wait a bit for WebTorrent to load
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!(window as any).WebTorrent) {
      throw new Error("WebTorrent still not loaded");
    }

    const client = new (window as any).WebTorrent();

    return new Promise((resolve, reject) => {
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

          resolve(torrent);
        }
      );
    });
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
            📱 {getDeviceInfo().model} • {getDeviceInfo().os} • {Platform.OS}
          </Text>
          <Text style={styles.deviceText}>
            Camera: {cameraAvailable ? "✅ Available" : "❌ Unavailable"}
          </Text>
        </View>
      </View>

      {/* Browser-specific messages */}
      {browserInfo?.isIOSChrome && (
        <View style={styles.browserWarning}>
          <Text style={styles.browserWarningTitle}>📱 Switch to Safari</Text>
          <Text style={styles.browserWarningText}>
            iOS Chrome doesn't support camera access.{"\n"}
            Please open this page in Safari to record videos.
          </Text>
          <TouchableOpacity
            style={styles.browserButton}
            onPress={() => {
              // Try to open in Safari
              const url = window.location.href;
              window.open(url, "_system");
            }}
          >
            <Text style={styles.browserButtonText}>Open in Safari</Text>
          </TouchableOpacity>
        </View>
      )}

      {browserInfo?.isIOSSafari && (
        <View style={styles.browserSuccess}>
          <Text style={styles.browserSuccessText}>
            ✅ Using Safari - Camera should work!
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          recording && styles.recordingButton,
          (!webTorrentLoaded || !cameraAvailable) && styles.disabledButton, // UPDATE THIS LINE
        ]}
        onPress={recording ? stopRecording : startRecording}
        disabled={!webTorrentLoaded || !cameraAvailable} // UPDATE THIS LINE
      >
        <Text style={styles.buttonText}>
          {!webTorrentLoaded
            ? "🔄 Loading WebTorrent..."
            : !cameraAvailable // ADD THIS CONDITION
            ? "❌ Camera Not Available"
            : recording
            ? "⏹️ Recording... (10s)"
            : "🎥 Start Neighborhood Stream"}
        </Text>
      </TouchableOpacity>

      {/* Video playback container */}
      {Platform.OS === "web" && (
        <View id="video-container" style={styles.videoContainer} />
      )}

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

      {/* Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {webTorrentLoaded
            ? "✅ WebTorrent Ready"
            : "🔄 Loading P2P Engine..."}
        </Text>
        <Text style={styles.statusSubtext}>
          Platform: {Platform.OS} | OS: {Device.osName} | Camera:{" "}
          {cameraAvailable ? "✅" : "❌"}
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
  browserWarning: {
    backgroundColor: "#ffebee",
    padding: 15,
    borderRadius: 10,
    margin: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
  },
  browserWarningTitle: {
    color: "#c62828",
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 5,
  },
  browserWarningText: {
    color: "#c62828",
    fontSize: 14,
    lineHeight: 18,
  },
  browserButton: {
    backgroundColor: "#f44336",
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    alignItems: "center",
  },
  browserButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  browserSuccess: {
    backgroundColor: "#e8f5e8",
    padding: 10,
    borderRadius: 10,
    margin: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  browserSuccessText: {
    color: "#2e7d32",
    fontWeight: "bold",
  },
});
