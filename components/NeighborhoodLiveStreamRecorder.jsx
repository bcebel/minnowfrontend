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

export default function NeighborhoodLiveStreamRecorder({
  neighborhoodId,
  username,
  onStreamEnd,
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef("");
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);

  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [createStreamMutation] = useMutation(CREATE_STREAM);

  const processSeedQueue = async () => {
    if (isProcessingQueueRef.current || chunkQueueRef.current.length === 0) {
      return;
    }
    isProcessingQueueRef.current = true;

    const client = window.globalWebTorrentClient;

    const seedAndSend = (chunkData, index) => {
      return new Promise((resolve, reject) => {
        client.seed(
          chunkData,
          {
            name: `live-${sessionIdRef.current}-chunk-${index}.webm`,
          },
          (torrent) => {
            console.log(`✅ Chunk ${index} seeded:`, torrent.magnetURI);
            sendMessage({
              variables: {
                content: "",
                room: "neighborhood",
                neighborhoodId: neighborhoodId,
                fileName: `${username}'s Live Stream - Part ${index + 1}`,
                fileType: "video_chunk",
                magnetLink: torrent.magnetURI,
                sessionId: sessionIdRef.current,
                chunkIndex: index,
                totalChunks: -1,
                thumbnailUrl: null,
              },
            })
              .then(() => {
                console.log(`✅ Sent message for chunk ${index}`);
                setChunkCount((prev) => prev + 1);
                resolve();
              })
              .catch((err) => {
                console.error(`❌ Failed to send message for chunk ${index}:`, err);
                reject(err);
              });
          }
        );
      });
    };

    while (chunkQueueRef.current.length > 0) {
      const chunkToProcess = chunkQueueRef.current.shift();
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
            // Add multiple fallback trackers
            announce: [
              "wss://tracker.openwebtorrent.com",
              "wss://tracker.btorrent.xyz",
              "wss://tracker.files.fm:7073/announce",
            ],
          },
        });
      }

      const streamTitle = `${username}'s Live Stream`;
      const { data: streamData } = await createStreamMutation({
        variables: {
          title: streamTitle,
          neighborhoodId: neighborhoodId,
        },
      });

      if (!streamData?.createStream?.sessionId) {
        throw new Error("Failed to create stream session on the backend.");
      }

      const newSessionId = streamData.createStream.sessionId;
      sessionIdRef.current = newSessionId;

      chunkIndexRef.current = 0;
      chunkQueueRef.current = [];
      isProcessingQueueRef.current = false;
      setChunkCount(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30 },
        audio: true,
      });
      streamRef.current = stream;

      // --- CROSS-BROWSER MIME TYPE CHECK ---
      const types = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=h264,opus",
        "video/mp4;codecs=avc1", // Required for many iOS versions
      ];

      let supportedType = types.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!supportedType) {
        throw new Error(
          "No supported MediaRecorder format found on this browser."
        );
      }

      console.log(`Using MIME type: ${supportedType}`);

  const mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: mimeType,
    videoBitsPerSecond: 1200000,
  });

      mediaRecorderRef.current = mediaRecorder;



      const CHUNK_DURATION =3000;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log(`➡️ Chunk received, adding to queue.`);
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

    console.log("✅ Queue finished. Sending stream ended message.");
    sendMessage({
      variables: {
        content: "⏹️ Stream ended",
        room: "neighborhood",
        neighborhoodId: neighborhoodId,
        sessionId: sessionIdRef.current,
      },
    });

    const ui = document.getElementById("streamUI");
    if (ui) document.body.removeChild(ui);

    setIsStreaming(false);
    if (onStreamEnd) {
      onStreamEnd();
    }
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