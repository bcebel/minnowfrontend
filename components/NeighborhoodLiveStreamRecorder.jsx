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
const seedAndSend = (chunkData, index) => {
  return new Promise((resolve, reject) => {
    const extension = supportedTypeRef.current.includes("mp4") ? "mp4" : "webm";
    const isHeader = index === -1;
    const fileName = isHeader
      ? `header-${sessionIdRef.current}.mp4`
      : `live-${sessionIdRef.current}-chunk-${index}.${extension}`;

    // Function to send the GraphQL message (extracted for reuse)
    const sendGraphQLMessage = (magnetUriToSend) => {
      sendMessage({
        variables: {
          content: isHeader ? "STREAM_HEADER" : "",
          room: "neighborhood",
          neighborhoodId: neighborhoodId,
          fileName: isHeader
            ? "Stream Header"
            : `${username}'s Live Stream - Part ${index + 1}`,
          fileType: isHeader ? "video_header" : "video_chunk",
          magnetLink: magnetUriToSend,
          mimeType: supportedTypeRef.current,
          sessionId: sessionIdRef.current,
          chunkIndex: index,
          totalChunks: -1,
          thumbnailUrl: null,
        },
      })
        .then(() => {
          if (!isHeader) setChunkCount((prev) => prev + 1);
          else headerSentRef.current = true;
          resolve();
        })
        .catch((err) => {
          console.error(`❌ Failed to send message:`, err);
          reject(err);
        });
    };

    // Step 1: Upload chunk to backend for seeding
    const uploadToBackend = async () => {
      const formData = new FormData();
      formData.append(
        "chunk",
        new Blob([chunkData], { type: supportedTypeRef.current })
      );
      formData.append("sessionId", sessionIdRef.current);
      formData.append("chunkIndex", index.toString());

      try {
        // Use the same auth token if needed; your backend uses 'authenticateToken'
        // 2. USE THE SAME KEY ("token") from your other page
        const token = await AsyncStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const response = await fetch(`${BACKEND_URL}/api/live-chunk`, {
          method: "POST",
          headers,
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(
            `⚠️ Backend upload for chunk ${index} failed:`,
            response.status,
            errorText
          );
          return null;
        }

        const result = await response.json();
        console.log(
          `📤 Chunk ${index} uploaded to backend. Magnet:`,
          result.magnetUri?.substring(0, 50) + "..."
        );
        return result.magnetUri; // Backend returns its magnet URI
      } catch (error) {
        console.error(
          `🚨 Backend upload network error for chunk ${index}:`,
          error
        );
        return null;
      }
    };

    const trackers = [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.webtorrent.dev",
      "udp://tracker.opentrackr.org:1337",
      "udp://9.rarbg.to:2710",
      "udp://open.stealth.si:80",
      "udp://exodus.desync.com:6969",
      "udp://tracker.torrent.eu.org:451",
    ];
    // Step 2: Start local seeding immediately (for speed)
    client.seed(chunkData, { name: fileName, announce: trackers  }, async (torrent) => {
      console.log(
        `✅ ${isHeader ? "Header" : "Chunk " + index} seeded locally:`,
        torrent.magnetURI
      );

      const localMagnet = torrent.magnetURI;
      let finalMagnet = localMagnet;

      // Step 3: Try to upload to backend in parallel, but don't wait too long.
      // For header, we wait longer because it's critical.
      const backendUploadPromise = uploadToBackend();

      if (isHeader) {
        // For header, wait up to 2 seconds for backend confirmation
        try {
          const backendMagnet = await Promise.race([
            backendUploadPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
          ]);
          if (backendMagnet) finalMagnet = backendMagnet;
        } catch (e) {
          console.error("Header backend upload error:", e);
        }
      } else {
        // For regular chunks, fire-and-forget after 500ms
        setTimeout(() => {
          backendUploadPromise
            .then((backendMagnet) => {
              if (backendMagnet) {
                console.log(`🔁 Backend seeding confirmed for chunk ${index}`);
                // Optional: If backend magnet is different, you could update
                // the GraphQL message here with a second mutation
              }
            })
            .catch(() => {});
        }, 500);
      }

      // Step 4: Send GraphQL message with whichever magnet we have
      sendGraphQLMessage(finalMagnet);

      // Step 5: Local cleanup (2 minutes as before)
      setTimeout(() => {
        if (client.get(torrent.infoHash)) {
          client.remove(torrent.infoHash);
        }
      }, 120000);
    });
  });
};

    while (chunkQueueRef.current.length > 0) {
      const chunkToProcess = chunkQueueRef.current.shift();

      // IPHONE FIX: The very first data from MediaRecorder must be treated as the Header
      if (!headerSentRef.current) {
        try {
          await seedAndSend(chunkToProcess, -1);
        } catch (e) {
          console.error("Header seed failed:", e);
        }
      }

      const currentIndex = chunkIndexRef.current++;
      try {
        await seedAndSend(chunkToProcess, currentIndex);
      } catch (error) {
        console.error(`Failed to process chunk ${currentIndex}:`, error);
      }
    }

    isProcessingQueueRef.current = false;
  };

  const startStream = async () => {
    try {
      // 1. Initialize WebTorrent
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
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
      let supportedType = types.find((type) => MediaRecorder.isTypeSupported(type));

      if (!supportedType) {
        throw new Error("No supported MediaRecorder format found.");
      }

      supportedTypeRef.current = supportedType;
      console.log(`Using MIME type: ${supportedType}`);

      // 5. Recorder Initialization
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedType,
        videoBitsPerSecond: 400000, 
      });

      mediaRecorderRef.current = mediaRecorder;

      // 1-second chunks are essential for avoiding RTCDataChannel buffer limits
      const CHUNK_DURATION = 1000;

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
    streamRef.current?.getTracks().forEach((track) => track.stop());

    const waitForQueue = async () => {
      while (isProcessingQueueRef.current) {
        console.log("Waiting for chunk queue to finish...");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };
    await waitForQueue();

    sendMessage({
      variables: {
        content: "⏹️ Stream ended",
        room: "neighborhood",
        neighborhoodId: neighborhoodId,
        sessionId: sessionIdRef.current,
      },
    });

    setIsStreaming(false);
    if (onStreamEnd) {
      onStreamEnd();
    }
  };

  return (
    <View style={styles.recorderContainer}>
      <TouchableOpacity
        onPress={isStreaming ? stopStream : startStream}
        style={[
          styles.button,
          { backgroundColor: isStreaming ? "#ff4444" : "#0066cc" }
        ]}
      >
        <Text style={styles.buttonText}>
          {isStreaming ? "⏹️ STOP LIVE STREAM" : "🔴 START LIVE STREAM"}
        </Text>
        {isStreaming && (
          <Text style={styles.statusText}>
            {chunkCount} chunks broadcasted
          </Text>
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
  }
});