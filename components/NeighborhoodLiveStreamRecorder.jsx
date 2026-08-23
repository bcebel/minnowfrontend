

// components/NeighborhoodLiveStreamRecorder.jsx
import React, { useState, useRef } from "react";
import { View, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { useMutation, gql } from "@apollo/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { warehouse } from "./StreamWearhouse.js";
import { unifiedUpload } from "../app/(tabs)/neighborhoods/bubbles/neighborhood-chat.js";
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

const SEND_CHUNK = gql`
  mutation SendStreamChunk(
    $sessionId: String!
    $chunkIndex: Int!
    $magnetLink: String!
    $thumbnailUrl: String
  ) {
    sendStreamChunk(
      sessionId: $sessionId
      chunkIndex: $chunkIndex
      magnetLink: $magnetLink
      thumbnailUrl: $thumbnailUrl
    ) {
      id
      thumbnailUrl
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

  // Refs for persistent state across renders
  const rotationRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const headerSentRef = useRef(false);
  const supportedTypeRef = useRef('video/mp4; codecs="mp4a.40.2, avc1.4d4015"');
  const isSafari =
    /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  if (isSafari) {
    // ✅ Force Baseline Profile for all Safari
    supportedTypeRef.current = 'video/mp4;codecs="avc1.42E01E, mp4a.40.2"';
  }
  const currentThumbnailRef = useRef(null);
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);
  const activeSwarms = useRef({});

  const handleStitchAndShip = async () => {
    try {
      const sessionId = sessionIdRef.current;
      const totalChunks = chunkIndexRef.current;

      // 1. STITCH: Gather parts in strict order
      const parts = [];

      // Get the critical Header (-1)
      const header = await warehouse.getChunk(sessionId, -1);
      if (header) {
        parts.push(header);
      } else {
        console.warn(
          "⚠️ Header missing from warehouse, archive might be unplayable",
        );
      }

      // Get every recorded chunk
      for (let i = 0; i < totalChunks; i++) {
        const chunk = await warehouse.getChunk(sessionId, i);
        if (chunk) parts.push(chunk);
      }

      if (parts.length === 0) {
        Alert.alert("Error", "No data found to archive.");
        return;
      }

      // 2. CREATE THE BLOB
      // Use the specific type the browser expects
      const stitchedBlob = new Blob(parts, { type: "video/mp4" });

      // 3. SHIP: Use the unifiedUpload
      // This function usually handles the IPFS upload and the final GraphQL sendMessage
      // Ensure you pass it as a single "video" file, NOT as chunks.
      const fileToUpload = {
        uri: URL.createObjectURL(stitchedBlob),
        name: `archive_${sessionId}.mp4`,
        type: "video/mp4",
        size: stitchedBlob.size,
      };

      console.log("📤 Sending stitched archive to IPFS...", fileToUpload.size);

      // IMPORTANT: Make sure your unifiedUpload in neighborhood-chat.js
      // sends this with isChunked: false or simply as a standard video.
      await unifiedUpload(
        fileToUpload,
        "video",
        stitchedBlob.size,
        "video/mp4",
      );

      // 4. CLEANUP
      await warehouse.deleteSession(sessionId);
      Alert.alert("Success", "Stream archived to Gallery!");

      if (onStreamEnd) onStreamEnd();
    } catch (error) {
      console.error("❌ Archive failed:", error);
      Alert.alert("Error", "Could not stitch and ship.");
    }
  };

  const ensureWebTorrent = () => {
    return new Promise((resolve, reject) => {
      // 1. If it's already there, just return the client
      if (window.WebTorrent && window.globalWebTorrentClient) {
        return resolve(window.globalWebTorrentClient);
      }

      // 2. If the script isn't even in the doc, inject it
      if (!window.WebTorrent) {
        console.log("🛠 Injecting WebTorrent Engine...");
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        script.onload = () => {
          window.globalWebTorrentClient = new window.WebTorrent({
            tracker: { announce: ["wss://tracker-0ad4cca9fd92.herokuapp.com"] },
          });
          resolve(window.globalWebTorrentClient);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      } else {
        // Script is there, but client isn't built yet
        window.globalWebTorrentClient = new window.WebTorrent({
          tracker: { announce: ["wss://tracker-0ad4cca9fd92.herokuapp.com"] },
        });
        resolve(window.globalWebTorrentClient);
      }
    });
  };

  const seedChunk = (chunkIndex, buffer) => {
    // Every time you finish seeding a new chunk
    const keepAfter = chunkIndex - 5; // Keep the last 5 chunks for the P2P swarm
    if (keepAfter > 0) {
      warehouse.deleteOldChunks(sessionIdRef.current, keepAfter);
    }

    // Use the service to seed
    webtorrentService
      .seed(buffer, {
        name: `stream_${sessionIdRef.current}_chunk_${chunkIndex}`,
      })
      .then((torrent) => {
        activeSwarms.current[chunkIndex] = torrent;

        // --- THE JANITOR ---
        // Keep only the last 5 chunks seeding
        const keys = Object.keys(activeSwarms.current).map(Number);
        if (keys.length > 5) {
          const oldestIndex = Math.min(...keys);
          const oldTorrent = activeSwarms.current[oldestIndex];

          if (oldTorrent) {
            console.log(`🧹 Killing swarm for chunk ${oldestIndex}`);
            oldTorrent.destroy(); // Stops seeding and closes trackers
            delete activeSwarms.current[oldestIndex];
          }
        }
      })
      .catch((error) => {
        console.error(`❌ Failed to seed chunk ${chunkIndex}:`, error);
      });
  };

  // --- THE WORKER: SEEDS P2P & UPLOADS TO BACKEND ---
  const processSeedQueue = async () => {
    if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0)
      return;
    isProcessingQueueRef.current = true;

    // Use the service to get the client
    const client = await webtorrentService.ensureClient();
    if (!client) {
      console.error("❌ No Global WebTorrent Client found!");
      isProcessingQueueRef.current = false;
      return;
    }

    const seedAndSend = (chunkData, index) => {
      return new Promise(async (resolve) => {
        const isHeader = index === -1;

        // Use the thumb we already captured during startStream
        const thumbToSend = isHeader ? currentThumbnailRef.current : null;

        const fileName = isHeader
          ? `h_${sessionIdRef.current}.mp4`
          : `c_${index}.mp4`;

        // 2. SEED & UPLOAD
        client.seed(chunkData, { name: fileName }, async (torrent) => {
          const uploadToBackend = async (retry = 0) => {
            try {
              const formData = new FormData();
              formData.append(
                "chunk",
                new Blob([chunkData], { type: supportedTypeRef.current }),
              );
              formData.append("sessionId", sessionIdRef.current);
              formData.append("chunkIndex", index.toString());
              formData.append("rotation", rotationRef.current.toString()); // ✅ Add this!

              // We still send the thumb to the backend as a backup,
              // but we don't wait for it to "work" for the player to start
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

          // 3. GRAPHQL NOTIFY
          // This is what the player listens for!
          await sendMessage({
            variables: {
              content: isHeader ? "STREAM_HEADER" : "",
              neighborhoodId,
              magnetLink: result?.magnetUri || torrent.magnetURI,
              thumbnailUrl: thumbToSend, // Using our successful Base64 ref
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
        });
      });
    };

    while (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      const currentIndex = headerSentRef.current ? chunkIndexRef.current++ : -1;
      await seedAndSend(chunk, currentIndex);
    }
    isProcessingQueueRef.current = false;
  };

  // --- START THE ENGINE ---
  const startStream = async () => {
    try {
      // 1. Use the service to ensure WebTorrent is ready
      const client = await webtorrentService.ensureClient();
      console.log("✅ Engine Engaged via Service:", client);

      // 2. CREATE SESSION
      const { data: streamData } = await createStreamMutation({
        variables: { title: `${username}'s Live`, neighborhoodId },
      });

      if (!streamData?.createStream?.sessionId)
        throw new Error("No Session ID");
      sessionIdRef.current = streamData.createStream.sessionId;
      // 3. CAMERA & MEDIA RECORDER
      // In startStream(), after getting the stream
      const stream = await navigator.mediaDevices.getUserMedia({
        //     width: { ideal: 720 },
        //   height: { ideal: 1280 },
        video: { width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
        aspectRatio: { ideal: 1 },
      });
      streamRef.current = stream;

      // ✅ Wait a moment for the video track to stabilize
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then capture thumbnail
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        const isPortrait = settings.height > settings.width;
        rotationRef.current = isPortrait ? 90 : 0;

        // ✅ Only capture if video is ready
        if (videoTrack.readyState === "live") {
          const imageCapture = new ImageCapture(videoTrack);
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");

          // ✅ Apply rotation to the thumbnail
          if (rotationRef.current === 90) {
            ctx.translate(320, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(bitmap, 0, 0, 180, 320);
          } else {
            ctx.drawImage(bitmap, 0, 0, 320, 180);
          }

          currentThumbnailRef.current = canvas.toDataURL("image/jpeg", 0.7);
          console.log("📸 Thumbnail captured with rotation!");
        }
      } catch (e) {
        console.warn("Could not capture thumbnail:", e);
      }
      streamRef.current = stream;

      try {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
      let rotation = 0;
      if (settings.height > settings.width) {
        rotation = 90; // Portrait
      } else if (window.screen?.orientation?.type?.startsWith("portrait")) {
        rotation = 90;
      }

      rotationRef.current = rotation;
      console.log(`🔄 Detected rotation: ${rotation}°`);
        const imageCapture = new ImageCapture(videoTrack);
        const bitmap = await imageCapture.grabFrame();
        const canvas = document.createElement("canvas");

        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, 320, 180);
        currentThumbnailRef.current = canvas.toDataURL("image/jpeg", 0.7); // 0.7 quality to keep string small
        console.log("📸 Thumbnail captured!");
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

      mediaRecorder.start(8000); // 8 second chunks
      setIsStreaming(true);
    } catch (error) {
      console.error("❌ Fatal Stream Error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

  const stopStream = async () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsStreaming(false);
    if (onStreamEnd) onStreamEnd();
  };

  async function stitchAndShip(sessionId, totalChunks) {
    this.addLog("🧵 Stitching archive...");
    const blobParts = [];

    // 1. Collect all chunks from IndexedDB (Warehouse)
    for (let i = -1; i <= totalChunks; i++) {
      // Start at -1 to include the Header!
      const chunk = await warehouse.getChunk(sessionId, i);
      if (chunk) blobParts.push(chunk);
    }

    // 2. Create the unified file and send to your existing upload function
    const finalFile = new File(
      blobParts,
      `neighborhood_live_${sessionId}.mp4`,
      { type: "video/mp4" },
    );

    // 3. This calls your existing IPFS upload logic
    return await this.uploadToIPFS(
      URL.createObjectURL(finalFile),
      finalFile.name,
      "video",
    );
  }

  return (
    <View style={styles.recorderContainer}>
      {!isStreaming ? (
        // 1. Initial State: Just the Start Button
        <TouchableOpacity
          onPress={startStream}
          style={[styles.button, styles.startBtn]}
        >
          <Text style={styles.buttonText}>🔴 START LIVE STREAM</Text>
        </TouchableOpacity>
      ) : (
        // 2. Live State: The Control Panel
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={stopStream}
            style={[styles.button, styles.stopBtn]}
          >
            <Text style={styles.buttonText}>⏹️ STOP (DELETE)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              stopStream(); // Kill the camera
              handleStitchAndShip(); // Send to Gallery
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

