// components/NeighborhoodLiveStreamRecorder.jsx
import React, { useState, useRef } from "react";
import { View, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { useMutation, gql } from "@apollo/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { warehouse } from "./StreamWearhouse.js";
import { unifiedUpload } from "../app/neighborhoods/neighborhood-chat.js";
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

  // Refs for persistent state across renders
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const headerSentRef = useRef(false);
  const supportedTypeRef = useRef('video/mp4; codecs="avc1.4d401f, mp4a.40.2"');

  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);
  const activeSwarms = useRef({});
  
const handleStitchAndShip = async () => {
  try {
    const sessionId = sessionIdRef.current;
    const totalChunks = chunkIndexRef.current;

    // 1. STITCH: Grab everything from the warehouse
    const parts = [];
    const header = await warehouse.getChunk(sessionId, -1);
    if (header) parts.push(header);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = await warehouse.getChunk(sessionId, i);
      if (chunk) parts.push(chunk);
    }

    // 2. WRAP: Create the "Asset" object that unifiedUpload expects
    const stitchedBlob = new Blob(parts, { type: "video/mp4" });
    const mockAsset = {
      uri: URL.createObjectURL(stitchedBlob),
      name: `live-archive-${sessionId}.mp4`,
      size: stitchedBlob.size,
    };

    // 3. SHIP: Use the passed-in unifiedUpload from ChatScreen
    await unifiedUpload(mockAsset, "video", stitchedBlob.size, "video/mp4");

    // 4. CLEANUP: Clear the warehouse since it's now permanent in the gallery
    await warehouse.deleteSession(sessionId);
    Alert.alert("Success", "Stream archived to Gallery!");
  } catch (error) {
    console.error("❌ Archive failed:", error);
    Alert.alert("Error", "Could not stitch and ship.");
  }
};
  
  const seedChunk = (chunkIndex, buffer) => {
    // Every time you finish seeding a new chunk (let's say chunkIndex)
    const keepAfter = chunkIndex - 5; // Keep the last 5 chunks for the P2P swarm
    if (keepAfter > 0) {
      warehouse.deleteOldChunks(sessionId, keepAfter);
    }
    const client = window.globalWebTorrentClient;

    client.seed(buffer, { announce: TRACKERS }, (torrent) => {
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
    });
  };

  // --- THE WORKER: SEEDS P2P & UPLOADS TO BACKEND ---
  const processSeedQueue = async () => {
    if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0)
      return;
    isProcessingQueueRef.current = true;

    const client = window.globalWebTorrentClient;
    if (!client) {
      console.error("❌ No Global WebTorrent Client found!");
      isProcessingQueueRef.current = false;
      return;
    }

    const seedAndSend = (chunkData, index) => {
      return new Promise((resolve) => {
        const isHeader = index === -1;
        const fileName = isHeader
          ? `h_${sessionIdRef.current}.mp4`
          : `c_${index}.mp4`;

        client.seed(chunkData, { name: fileName }, async (torrent) => {
          console.log(
            `📡 Seeding ${isHeader ? "Header" : "Chunk " + index} | Peers: ${
              torrent.numPeers
            }`
          );

          // Upload to Heroku as a WebSeed backup
          const uploadToBackend = async (retry = 0) => {
            try {
              const formData = new FormData();
              formData.append(
                "chunk",
                new Blob([chunkData], { type: supportedTypeRef.current })
              );
              formData.append("sessionId", sessionIdRef.current);
              formData.append("chunkIndex", index.toString());
              formData.append("neighborhoodId", neighborhoodId);

              const token = await AsyncStorage.getItem("token");
              const res = await fetch(`${BACKEND_URL}/api/live-chunk`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
              });
              const data = await res.json();
              return data.magnetUri;
            } catch (e) {
              if (isHeader && retry < 2) return uploadToBackend(retry + 1);
              return null;
            }
          };

          const serverMagnet = await uploadToBackend();
          const finalMagnet = serverMagnet || torrent.magnetURI;

          // Notify the world via GraphQL
          await sendMessage({
            variables: {
              content: isHeader ? "STREAM_HEADER" : "",
              neighborhoodId,
              fileName: isHeader ? "Header" : `Chunk ${index}`,
              fileType: isHeader ? "video_header" : "video_chunk",
              magnetLink: finalMagnet,
              mimeType: supportedTypeRef.current,
              sessionId: sessionIdRef.current,
              chunkIndex: index,
            },
          });

          if (!isHeader) setChunkCount((prev) => prev + 1);
          else headerSentRef.current = true;

          // Cleanup seed after 5 mins
          setTimeout(() => client.remove(torrent.infoHash), 300000);
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
     // 1. THE "ONE COMMAND" ENGINE CHECK
     // If it's not on the window, we make it. Right here. Right now.
     if (!window.globalWebTorrentClient) {
       console.log("🛠️ Engine missing. Hot-starting WebTorrent...");
       if (!window.WebTorrent) {
         // If the CDN script failed too, we grab it manually
         const script = document.createElement("script");
         script.src =
           "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
         document.head.appendChild(script);
         await new Promise((resolve) => (script.onload = resolve));
       }
       window.globalWebTorrentClient = new window.WebTorrent();
       window.globalWebTorrentClient.setMaxListeners(0);
     }

     const client = window.globalWebTorrentClient;
     console.log("✅ Engine Engaged:", client);

     // 2. CREATE SESSION
     const { data: streamData } = await createStreamMutation({
       variables: { title: `${username}'s Live`, neighborhoodId },
     });

     if (!streamData?.createStream?.sessionId) throw new Error("No Session ID");
     sessionIdRef.current = streamData.createStream.sessionId;

     // 3. CAMERA & MEDIA RECORDER
     const stream = await navigator.mediaDevices.getUserMedia({
       video: { width: 640, height: 360 },
       audio: true,
     });
     streamRef.current = stream;

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
      { type: "video/mp4" }
    );

    // 3. This calls your existing IPFS upload logic
    return await this.uploadToIPFS(
      URL.createObjectURL(finalFile),
      finalFile.name,
      "video"
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
  recorderContainer: { padding: 10, width: "100%" },
  button: { padding: 15, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  statusText: { color: "white", fontSize: 12, marginTop: 5 },
  archiveButton: {
    backgroundColor: "#2ecc71", // Green for success/save
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#fff",
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
  stopBtn: { backgroundColor: "#444" }, // Gray for "just stop"
  archiveBtn: { backgroundColor: "#2ecc71" }, // Green for "Save"
  chunkCountText: {
    color: "#00ffff",
    textAlign: "center",
    marginTop: 10,
    fontSize: 12,
    fontWeight: "bold",
  },
});