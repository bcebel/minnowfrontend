// components/NeighborhoodLiveStreamRecorder.jsx
import React, { useState, useRef } from "react";
import { View, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { useMutation, gql } from "@apollo/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  

  return (
    <View style={styles.recorderContainer}>
      <TouchableOpacity
        onPress={isStreaming ? stopStream : startStream}
        style={[
          styles.button,
          { backgroundColor: isStreaming ? "#151159" : "#0066cc" },
        ]}
      >
        <Text style={styles.buttonText}>
          {isStreaming ? "⏹️ STOP LIVE" : "🔴 START LIVE"}
        </Text>
        {isStreaming && (
          <Text style={styles.statusText}>{chunkCount} chunks live</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  recorderContainer: { padding: 10, width: "100%" },
  button: { padding: 15, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  statusText: { color: "white", fontSize: 12, marginTop: 5 },
});