// components/NeighborhoodLiveStreamRecorder.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { useMutation, gql } from "@apollo/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { warehouse } from "./StreamWearhouse.js";
import webtorrentService from "../utils/webtorrentService.js";

const SEND_MESSAGE = gql`
  mutation SendNeighborhoodMessage(
    $content: String!
    $neighborhoodId: ID!
    $fileName: String
    $fileType: String
    $imageUrl: String
    $videoUrl: String
    $fileUrl: String
    $magnetLink: String
    $mimeType: String
    $thumbnailUrl: String
    $sessionId: String
    $chunkIndex: Int
    $totalChunks: Int
    $rotation: Int
  ) {
    sendMessage(
      content: $content
      neighborhoodId: $neighborhoodId
      room: "neighborhood"
      fileName: $fileName
      fileType: $fileType
      imageUrl: $imageUrl
      videoUrl: $videoUrl
      fileUrl: $fileUrl
      magnetLink: $magnetLink
      mimeType: $mimeType
      thumbnailUrl: $thumbnailUrl
      sessionId: $sessionId
      chunkIndex: $chunkIndex
      totalChunks: $totalChunks
      rotation: $rotation
    ) {
      id
    }
  }
`;

const CREATE_STREAM = gql`
  mutation CreateStream($title: String!, $neighborhoodId: ID!) {
    createStream(title: $title, neighborhoodId: $neighborhoodId) {
      id
      sessionId
      title
    }
  }
`;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function NeighborhoodLiveStreamRecorder({
  neighborhoodId,
  username,
  unifiedUpload,
  onStreamEnd,
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef(null);
  const previewRef = useRef(null); // For raw <video> on web
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null); // Store the main stream
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const headerSentRef = useRef(false);
  const activeSwarms = useRef({});
  const currentThumbnailRef = useRef(null);
  const rotationRef = useRef(0);
  const supportedTypeRef = useRef('video/mp4; codecs="mp4a.40.2, avc1.4d4015"');

  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);

  // ✅ 1. PRE-LOAD CAMERA (Makeup Check)
  useEffect(() => {
    const loadCamera = async () => {
      try {
        // Request permission
        if (Platform.OS === "web") {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 } },
            audio: true,
          });
          streamRef.current = stream;

          // Makeup check preview using raw <video>
          if (previewRef.current) {
            const videoEl = document.createElement("video");
            videoEl.srcObject = stream;
            videoEl.muted = true;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.style.cssText = "width:100%;height:100%;object-fit:cover;";

            previewRef.current.innerHTML = "";
            previewRef.current.appendChild(videoEl);
          }
        } else {
          // Native just uses CameraView (permission handled there)
          if (!permission?.granted) {
            await requestPermission();
          }
        }
      } catch (error) {
        console.error("❌ Camera Permission Denied:", error);
        Alert.alert("Camera Error", "Please allow camera access to continue.");
      }
    };

    loadCamera();
  }, []);

  function toggleCameraFacing() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  // ✅ 2. START STREAM
  const startStream = async () => {
    try {
      console.log("🚀 [1] Starting stream...");

      // Use pre-loaded stream on web
      if (Platform.OS === "web") {
        if (!streamRef.current) {
          throw new Error("Camera not loaded yet.");
        }
      } else {
        if (!permission?.granted) {
          await requestPermission();
          if (!permission?.granted) {
            throw new Error("Camera permission required.");
          }
        }
      }

      setIsStreaming(true);

      const { data: streamData } = await createStreamMutation({
        variables: { title: `${username}'s Live`, neighborhoodId },
      });

      if (!streamData?.createStream?.sessionId)
        throw new Error("No Session ID");
      sessionIdRef.current = streamData.createStream.sessionId;

      // Web: Start MediaRecorder using the same stream
      if (Platform.OS === "web") {
        const stream = streamRef.current;
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: supportedTypeRef.current,
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunkQueueRef.current.push(e.data);
            processSeedQueue();
          }
        };

        mediaRecorder.start(8000); // 8 second chunks
      } else {
        // Native: Use CameraView recordAsync
        await cameraRef.current.recordAsync();
      }

      console.log("✅ Stream started successfully!");
    } catch (error) {
      console.error("❌ Fatal Stream Error:", error);
      setIsStreaming(false); // Keep buttons working
    }
  };

  // ✅ 3. STOP STREAM
  const stopStream = async () => {
    try {
      // Web: Stop MediaRecorder
      if (Platform.OS === "web") {
        mediaRecorderRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } else {
        // Native: Stop recordAsync
        const video = await cameraRef.current.stopRecording();
        if (video?.uri) {
          const response = await fetch(video.uri);
          const blob = await response.blob();
          const chunkIndex = chunkIndexRef.current++;

          await warehouse.saveChunk(sessionIdRef.current, chunkIndex, blob);

          const client = await webtorrentService.ensureClient();
          if (client) {
            const torrent = await new Promise((resolve) => {
              client.seed(
                blob,
                { name: `live_${sessionIdRef.current}_${chunkIndex}` },
                (t) => resolve(t),
              );
            });

            await sendMessage({
              variables: {
                content: `Live Chunk ${chunkIndex}`,
                neighborhoodId,
                magnetLink: torrent.magnetURI,
                sessionId: sessionIdRef.current,
                chunkIndex: chunkIndex,
              },
            });
          }
        }
      }

      setIsStreaming(false);
      if (onStreamEnd) onStreamEnd();
    } catch (error) {
      console.error("❌ Error stopping stream:", error);
      setIsStreaming(false);
    }
  };

  // ✅ PROCESS SEED QUEUE
  const processSeedQueue = async () => {
    if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0)
      return;
    isProcessingQueueRef.current = true;

    const client = await webtorrentService.ensureClient();
    if (!client) {
      console.error("❌ No Global WebTorrent Client found!");
      isProcessingQueueRef.current = false;
      return;
    }

    const seedAndSend = (chunkData, index) => {
      return new Promise(async (resolve) => {
        const isHeader = index === -1;
        const thumbToSend = isHeader ? currentThumbnailRef.current : null;
        const fileName = isHeader
          ? `h_${sessionIdRef.current}.mp4`
          : `c_${index}.mp4`;

        client.seed(
          chunkData,
          {
            name: fileName,
            announce: ["wss://tracker-0ad4cca9fd92.herokuapp.com"],
          },
          async (torrent) => {
            const uploadToBackend = async (retry = 0) => {
              try {
                const formData = new FormData();
                formData.append(
                  "chunk",
                  new Blob([chunkData], { type: supportedTypeRef.current }),
                );
                formData.append("sessionId", sessionIdRef.current);
                formData.append("chunkIndex", index.toString());
                formData.append("rotation", rotationRef.current.toString());

                const token = await AsyncStorage.getItem("token");
                const res = await fetch(`${BACKEND_URL}/api/live-chunk`, {
                  method: "POST",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                  body: formData,
                });
                return await res.json();
              } catch (e) {
                if (isHeader && retry < 2) return uploadToBackend(retry + 1);
                return null;
              }
            };

            const result = await uploadToBackend();

            await sendMessage({
              variables: {
                content: isHeader ? "STREAM_HEADER" : "",
                neighborhoodId,
                magnetLink: result?.magnetUri || torrent.magnetURI,
                thumbnailUrl: thumbToSend,
                sessionId: sessionIdRef.current,
                chunkIndex: index,
                mimeType: supportedTypeRef.current,
                rotation: rotationRef.current,
              },
            });
            console.log(`📤 Sent rotation: ${rotationRef.current}°`);
            if (!isHeader) setChunkCount((prev) => prev + 1);
            else headerSentRef.current = true;

            resolve();
          },
        );
      });
    };

    while (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      const currentIndex = headerSentRef.current ? chunkIndexRef.current++ : -1;
      await seedAndSend(chunk, currentIndex);
    }
    isProcessingQueueRef.current = false;
  };

  // ✅ STITCH AND SHIP
  const handleStitchAndShip = async () => {
    try {
      const sessionId = sessionIdRef.current;
      const totalChunks = chunkIndexRef.current;

      const parts = [];
      const header = await warehouse.getChunk(sessionId, -1);
      if (header) parts.push(header);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = await warehouse.getChunk(sessionId, i);
        if (chunk) parts.push(chunk);
      }

      if (parts.length === 0) {
        Alert.alert("Error", "No data found to archive.");
        return;
      }

      const stitchedBlob = new Blob(parts, { type: "video/mp4" });

      const fileToUpload = {
        uri: URL.createObjectURL(stitchedBlob),
        name: `archive_${sessionId}.mp4`,
        type: "video/mp4",
        size: stitchedBlob.size,
      };

      await unifiedUpload(
        fileToUpload,
        "video",
        stitchedBlob.size,
        "video/mp4",
      );

      await warehouse.deleteSession(sessionId);
      Alert.alert("Success", "Stream archived to Gallery!");
      if (onStreamEnd) onStreamEnd();
    } catch (error) {
      console.error("❌ Archive failed:", error);
      Alert.alert("Error", "Could not stitch and ship.");
    }
  };

  // ✅ RENDER
  return (
    <View style={styles.recorderContainer}>
      {/* CAMERA PREVIEW */}
      {Platform.OS === "web" ? (
        // ✅ WEB: Raw <video> for continuous preview (makeup check + streaming)
        <View
          ref={previewRef}
          style={{
            width: "100%",
            height: 250,
            backgroundColor: "#000",
            marginBottom: 10,
            overflow: "hidden",
            borderRadius: 12,
          }}
        />
      ) : (
        // ✅ NATIVE: CameraView for continuous preview
        <View style={styles.cameraContainer}>
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.button}
                  onPress={toggleCameraFacing}
                >
                  <Text style={styles.text}>Flip Camera</Text>
                </TouchableOpacity>
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionContainer}>
              <Text style={styles.permissionText}>
                Camera permission needed
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                style={styles.permissionButton}
              >
                <Text style={styles.permissionButtonText}>
                  Grant Permission
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* START BUTTON OR LIVE CONTROLS */}
      {!isStreaming ? (
        <TouchableOpacity
          onPress={startStream}
          style={[styles.button, styles.startBtn]}
        >
          <Text style={styles.buttonText}>🔴 START LIVE STREAM</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={stopStream}
            style={[styles.button, styles.stopBtn]}
          >
            <Text style={styles.buttonText}>⏹️ STOP (DELETE)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              stopStream();
              handleStitchAndShip();
            }}
            style={[styles.button, styles.archiveBtn]}
          >
            <Text style={styles.buttonText}>📁 STOP & ARCHIVE</Text>
          </TouchableOpacity>
        </View>
      )}

      {isStreaming && (
        <Text style={styles.chunkCountText}>
          📡 Streaming: {chunkCount} chunks broadcasted
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recorderContainer: {
    padding: 10,
    width: "100%",
  },
  cameraContainer: {
    width: "100%",
    height: 250,
    backgroundColor: "#000",
    marginBottom: 10,
    overflow: "hidden",
    borderRadius: 12,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "transparent",
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: "flex-end",
    alignItems: "center",
  },
  text: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionText: {
    color: "#fff",
    marginBottom: 10,
  },
  permissionButton: {
    backgroundColor: "#00ffff",
    padding: 10,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#130720",
    fontWeight: "bold",
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  startBtn: { backgroundColor: "#0066cc" },
  stopBtn: { backgroundColor: "#444" },
  archiveBtn: { backgroundColor: "#2ecc71" },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  chunkCountText: {
    color: "#00ffff",
    textAlign: "center",
    marginTop: 10,
    fontSize: 12,
    fontWeight: "bold",
  },
});
