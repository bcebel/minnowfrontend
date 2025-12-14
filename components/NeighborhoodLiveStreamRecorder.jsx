// components/NeighborhoodLiveStreamRecorder.jsx
import { useState, useRef } from "react";
import { View, TouchableOpacity, Text, Alert } from "react-native";
import { useMutation, gql } from "@apollo/client";

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
      thumbnailUrl: $thumbnailUrl # 🆕 ADD THIS LINE
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      magnetLink
      mimeType
      thumbnailUrl # 🆕 ADD THIS LINE
      room
      createdAt
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;

export default function NeighborhoodLiveStreamRecorder({
  neighborhoodId,
  username,
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef(Date.now().toString());
  const chunkIndexRef = useRef(0);

  const [sendMessage] = useMutation(SEND_MESSAGE);

  const startStream = async () => {
    try {
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      // Initialize global WebTorrent client
      if (!window.globalWebTorrentClient) {
        window.globalWebTorrentClient = new WebTorrent({
          tracker: { pex: true, lsd: true },
        });
      }

      const client = window.globalWebTorrentClient;
      sessionIdRef.current = Date.now().toString();
      chunkIndexRef.current = 0;
      setChunkCount(0);

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
        videoBitsPerSecond: 1000000,
      });
      mediaRecorderRef.current = mediaRecorder;

      // Record in 5-second chunks
      const CHUNK_DURATION = 5000;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const chunkIndex = chunkIndexRef.current++;
          const chunk = e.data;

          console.log(`🎬 Seeding chunk ${chunkIndex}: ${chunk.size} bytes`);

          // Seed this chunk immediately
          client.seed(
            chunk,
            {
              name: `live-${sessionIdRef.current}-chunk-${chunkIndex}.webm`,
            },
            (torrent) => {
              console.log(`✅ Chunk ${chunkIndex} seeded:`, torrent.magnetURI);

              // Send to neighborhood chat
              sendMessage({
                variables: {
                  content: "",
                  room: "neighborhood",
                  neighborhoodId: neighborhoodId,
                  fileName: `${username}'s Live Stream - Part ${
                    chunkIndex + 1
                  }`,
                  fileType: "video_chunk",
                  magnetLink: torrent.magnetURI,
                  sessionId: sessionIdRef.current,
                  chunkIndex: chunkIndex,
                  totalChunks: -1, // Live stream, unknown total
                  thumbnailUrl: null,
                },
              });

              setChunkCount((prev) => prev + 1);
            }
          );
        }
      };

      // Send initial "LIVE NOW" message
      await sendMessage({
        variables: {
          content: "🔴 LIVE NOW! Tap to watch",
          room: "neighborhood",
          neighborhoodId: neighborhoodId,
          fileName: `${username}'s Live Stream`,
          fileType: "live_stream_chunked",
          sessionId: sessionIdRef.current,
          magnetLink: null,
          chunkIndex: null,
          totalChunks: null,
        },
      });

      // Start recording chunks
      mediaRecorder.start(CHUNK_DURATION);
      setIsStreaming(true);

      // Update UI
      const container = document.createElement("div");
      container.id = "streamUI";
      container.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: rgba(0,0,0,0.8); color: white;
        padding: 15px; border-radius: 10px;
        border: 2px solid #ff4444; z-index: 1000;
        font-family: sans-serif; min-width: 200px;
      `;
      container.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <div style="width: 12px; height: 12px; background: #ff4444; border-radius: 50%; margin-right: 8px;"></div>
          <strong>🔴 LIVE STREAMING</strong>
        </div>
        <div id="streamStats">
          <div>Chunks: <span id="chunkCount">0</span></div>
          <div>Duration: <span id="duration">00:00</span></div>
        </div>
        <button id="stopStream" style="
          background: #ff4444; color: white; border: none;
          padding: 8px 16px; border-radius: 6px; margin-top: 10px;
          cursor: pointer; width: 100%; font-weight: bold;
        ">⏹️ Stop Stream</button>
      `;
      document.body.appendChild(container);

      // Update stats
      const startTime = Date.now();
      const updateInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60)
          .toString()
          .padStart(2, "0");
        const secs = (elapsed % 60).toString().padStart(2, "0");
        document.getElementById("duration").textContent = `${mins}:${secs}`;
        document.getElementById("chunkCount").textContent =
          chunkIndexRef.current;
      }, 1000);

      // Stop button
      document.getElementById("stopStream").onclick = () => {
        clearInterval(updateInterval);
        stopStream();
      };
    } catch (error) {
      console.error("❌ Stream start error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

  const stopStream = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Send stream ended message
    sendMessage({
      variables: {
        content: "⏹️ Stream ended",
        room: "neighborhood",
        neighborhoodId: neighborhoodId,
      },
    });

    // Remove UI
    const ui = document.getElementById("streamUI");
    if (ui) document.body.removeChild(ui);

    setIsStreaming(false);
    setChunkCount(0);
  };

  return (
    <View>
      <TouchableOpacity
        onPress={isStreaming ? stopStream : startStream}
        style={{
          backgroundColor: isStreaming ? "#ff4444" : "#0066cc",
          padding: 15,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
          {isStreaming ? "⏹️ STOP LIVE STREAM" : "🔴 START LIVE STREAM"}
        </Text>
        {isStreaming && (
          <Text style={{ color: "white", fontSize: 12, marginTop: 5 }}>
            {chunkCount} chunks broadcasted
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
