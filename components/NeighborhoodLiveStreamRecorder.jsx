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
  const supportedTypeRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);

  // CRITICAL: Track if the first segment (The Header) has been sent
  const headerSentRef = useRef(false);

  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);

  const APPLE_MIME_TYPE = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';

const processSeedQueue = async () => {
  if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0) {
    return;
  }
  isProcessingQueueRef.current = true;

  const client = window.globalWebTorrentClient;
  if (client) client.setMaxListeners(100); // Stop the "Memory Leak" warning

  const trackers = [
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.webtorrent.dev",
    "wss://tracker.files.fm:7073/announce",
  ];

  const seedAndSend = (chunkData, index) => {
    return new Promise((resolve) => {
      const isHeader = index === -1;
      const fileName = isHeader
        ? `h_${sessionIdRef.current}.mp4`
        : `c_${index}.mp4`;

      // 1. SEED FIRST (P2P is the priority)
      client.seed(
        chunkData,
        { name: fileName, announce: trackers },
        async (torrent) => {
          console.log(
            `📡 Local Seed Active: ${index} | Peers: ${torrent.numPeers}`
          );

          // 2. UPLOAD (Wrapped in a try/catch so it never crashes the loop)
          const uploadToBackend = async () => {
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
              const response = await fetch(`${BACKEND_URL}/api/live-chunk`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
              });

              if (!response.ok) throw new Error(`Server ${response.status}`);
              const result = await response.json();
              return result.magnetUri;
            } catch (e) {
              console.warn(
                `☁️ Server upload failed for chunk ${index}, staying P2P only.`
              );
              return null;
            }
          };

          // Try to get the server's Magnet, but fall back to our local one
          const serverMagnet = await uploadToBackend();
          const finalMagnet = serverMagnet || torrent.magnetURI;

          // 3. SEND GRAPHQL
          try {
            await sendMessage({
              variables: {
                content: isHeader ? "STREAM_HEADER" : "",
                neighborhoodId: neighborhoodId,
                fileName: isHeader ? "Header" : `Chunk ${index}`,
                fileType: isHeader ? "video_header" : "video_chunk",
                magnetLink: finalMagnet,
                mimeType: supportedTypeRef.current,
                sessionId: sessionIdRef.current,
                chunkIndex: index,
                totalChunks: -1,
              },
            });
            if (!isHeader) setChunkCount((prev) => prev + 1);
            else headerSentRef.current = true;
          } catch (err) {
            console.error("GraphQL broadcast failed:", err);
          }

          // 4. CLEANUP (Wait 5 mins)
          if (!isHeader) {
            setTimeout(() => {
              if (client.get(torrent.infoHash)) client.remove(torrent.infoHash);
            }, 300000);
          }
          resolve();
        }
      );
    });
  };

  while (chunkQueueRef.current.length > 0) {
    const chunk = chunkQueueRef.current.shift();
    await seedAndSend(
      chunk,
      headerSentRef.current ? chunkIndexRef.current++ : -1
    );
  }
  isProcessingQueueRef.current = false;
};

  const startStream = async () => {
    try {
      // 1. Initialize WebTorrent
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      if (!window.globalWebTorrentClient) {
        window.globalWebTorrentClient = new window.WebTorrent({
          tracker: {
            rtcConfig: {
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:global.stun.twilio.com:3478" },
              ],
            },
          },
        });
      }

      // 2. Create Backend Session
      const streamTitle = `${username}'s Live Stream`;
      const { data: streamData } = await createStreamMutation({
        variables: {
          title: streamTitle,
          neighborhoodId: neighborhoodId,
        },
      });

      if (!streamData?.createStream?.sessionId) {
        throw new Error("Failed to create stream session.");
      }

      sessionIdRef.current = streamData.createStream.sessionId;
      chunkIndexRef.current = 0;
      chunkQueueRef.current = [];
      isProcessingQueueRef.current = false;
      headerSentRef.current = false;
      setChunkCount(0);

      // 3. Camera Setup (Landcape-friendly for iPhone)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: 30,
        },
        audio: true,
      });
      streamRef.current = stream;

      // 4. Codec Selection
      const types = [
        APPLE_MIME_TYPE,
        "video/mp4; codecs=avc1",
        "video/webm; codecs=vp8,opus",
      ];
      let supportedType = types.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!supportedType) {
        throw new Error("No supported MediaRecorder format found.");
      }

      supportedTypeRef.current = supportedType;
      console.log(`Using MIME type: ${supportedType}`);

      // 5. Recorder Initialization
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedType,
        videoBitsPerSecond: 800000,
      });

      mediaRecorderRef.current = mediaRecorder;

      // 1-second chunks are essential for avoiding RTCDataChannel buffer limits
      const CHUNK_DURATION = 8000;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunkQueueRef.current.push(e.data);
          processSeedQueue();
        }
      };

      mediaRecorder.start(CHUNK_DURATION);
      setIsStreaming(true);
    } catch (error) {
      console.error("❌ Stream start error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

const stopStream = async () => {
  if (mediaRecorderRef.current?.state === "recording") {
    mediaRecorderRef.current.stop();
  }

  // Stop the camera immediately
  streamRef.current?.getTracks().forEach((track) => track.stop());

  console.log("⏹️ Stopping stream, flushing remaining chunks...");

  // Wait for the queue, but with a maximum timeout so it doesn't hang forever
  let waitCount = 0;
  while (isProcessingQueueRef.current && waitCount < 20) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    waitCount++;
  }

  await sendMessage({
    variables: {
      content: "⏹️ Stream ended",
      room: "neighborhood",
      neighborhoodId: neighborhoodId,
      sessionId: sessionIdRef.current,
    },
  });

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
          {isStreaming ? "⏹️ STOP LIVE STREAM" : "🔴 START LIVE STREAM"}
        </Text>
        {isStreaming && (
          <Text style={styles.statusText}>{chunkCount} chunks broadcasted</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  recorderContainer: {
    padding: 10,
    width: "100%",
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    marginTop: 5,
  },
});
