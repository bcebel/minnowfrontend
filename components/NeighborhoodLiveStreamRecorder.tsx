// components/NeighborhoodLiveStreamRecorder.tsx
import React, { useState, useRef, useEffect } from "react";
import { View, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { usePathname } from "expo-router"; // 👈 Use Expo Router's hook instead
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
  const pathname = usePathname(); // Returns current active route (e.g., "/selector" or "/chat")
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  // Video element ref for the live preview
  const videoPreviewRef = useRef(null);

  // Persistent refs across renders
  const rotationRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const headerSentRef = useRef(false);
  const supportedTypeRef = useRef('video/mp4; codecs="mp4a.40.2, avc1.4d4015"');
  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  };

  const isSafari =
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent);

  if (isSafari) {
    supportedTypeRef.current = 'video/mp4;codecs="mp4a.40.2, avc1.42E01E"';
  }

  const currentThumbnailRef = useRef(null);
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);
  const activeSwarms = useRef({});

  // 1. INITIALIZE PREVIEW CAMERA ON MOUNT


  const handleStitchAndShip = async () => {
    try {
      const sessionId = sessionIdRef.current;
      const totalChunks = chunkIndexRef.current;

      const parts = [];
      const header = await warehouse.getChunk(sessionId, -1);
      if (header) {
        parts.push(header);
      } else {
        console.warn("⚠️ Header missing from warehouse");
      }

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

      if (unifiedUpload) {
        await unifiedUpload(
          fileToUpload,
          "video",
          stitchedBlob.size,
          "video/mp4",
        );
      }

      await warehouse.deleteSession(sessionId);
      Alert.alert("Success", "Stream archived!");

      if (onStreamEnd) onStreamEnd();
    } catch (error) {
      console.error("❌ Archive failed:", error);
      Alert.alert("Error", "Could not stitch and ship.");
    }
  };

  const processSeedQueue = async () => {
    if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0)
      return;
    isProcessingQueueRef.current = true;

    const client = await webtorrentService.ensureClient();
    if (!client) {
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
                magnetLink: result?.magnetLink || torrent.magnetLink,
                thumbnailUrl: thumbToSend,
                sessionId: sessionIdRef.current,
                chunkIndex: index,
                mimeType: supportedTypeRef.current,
                rotation: rotationRef.current,
              },
            });

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

  const startStream = async () => {
    try {
      await webtorrentService.ensureClient();

      const { data: streamData } = await createStreamMutation({
        variables: { title: `${username}'s Live`, neighborhoodId },
      });

      if (!streamData?.createStream?.sessionId)
        throw new Error("No Session ID");

      sessionIdRef.current = streamData.createStream.sessionId;

      // Reuse existing preview stream if active, or query new stream
      let stream = streamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
          audio: true,
        });
        streamRef.current = stream;
      }

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        const isPortrait = settings.height > settings.width;
        rotationRef.current = isPortrait ? 90 : 0;

        if (videoTrack.readyState === "live") {
          const imageCapture = new ImageCapture(videoTrack);
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");

          if (rotationRef.current === 90) {
            ctx.translate(320, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(bitmap, 0, 0, 180, 320);
          } else {
            ctx.drawImage(bitmap, 0, 0, 320, 180);
          }

          currentThumbnailRef.current = canvas.toDataURL("image/jpeg", 0.7);
        }
      } catch (e) {
        console.warn("Could not capture thumbnail:", e);
      }

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

      mediaRecorder.start(8000);
      setIsStreaming(true);
    } catch (error) {
      console.error("❌ Fatal Stream Error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

  const stopStream = async () => {
    mediaRecorderRef.current?.stop();
    stopCameraTracks();
    setIsStreaming(false);
    if (onStreamEnd) onStreamEnd();
  };
  const RECORDER_ROUTE = "/livestream/selector";
  
useEffect(() => {
  let activeStream: MediaStream | null = null;
  const isTargetTab = pathname === RECORDER_ROUTE;

  const setupPreview = async () => {
    try {
      if (
        isTargetTab &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices
      ) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
          audio: true,
        });

        activeStream = stream;
        streamRef.current = stream;

        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Could not start camera preview:", err);
    }
  };

  if (isTargetTab) {
    setupPreview();
  } else {
    // 🛑 User switched tabs — turn off hardware tracks
    if (isStreaming) {
      stopStream();
    } else {
      stopCameraTracks();
    }
  }

  return () => {
    if (activeStream) {
      (activeStream as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
    }
    stopCameraTracks();
  };
}, [pathname]);

  return (
    <View style={styles.fullScreenContainer}>
      {/* CAMERA PREVIEW LAYER */}
      <video
        ref={videoPreviewRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 1,
        }}
      />

      {/* OVERLAY CONTROLS LAYER */}
      <View style={styles.overlayControls}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    position: "relative",
  },
  overlayControls: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    zIndex: 10,
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
  startBtn: { backgroundColor: "#ff375f" },
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
    fontSize: 14,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
});
