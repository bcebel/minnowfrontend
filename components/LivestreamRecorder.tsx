
import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Platform } from "react-native";
import { gql, useMutation } from "@apollo/client";

const CREATE_LIVESTREAM = gql`
  mutation CreateLivestream($neighborhoodId: ID!, $title: String!) {
    createLivestream(neighborhoodId: $neighborhoodId, title: $title) {
      id
      sessionId
    }
  }
`;

const ADD_LIVESTREAM_CHUNK = gql`
  mutation AddLivestreamChunk(
    $livestreamId: ID!
    $sessionId: String!
    $chunkIndex: Int!
    $magnetLink: String!
  ) {
    addLivestreamChunk(
      livestreamId: $livestreamId
      sessionId: $sessionId
      chunkIndex: $chunkIndex
      magnetLink: $magnetLink
    ) {
      id
    }
  }
`;

export default function LivestreamRecorder({ neighborhoodId, onStreamEnd }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const [livestreamId, setLivestreamId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [createLivestream] = useMutation(CREATE_LIVESTREAM);
  const [addLivestreamChunk] = useMutation(ADD_LIVESTREAM_CHUNK);

  useEffect(() => {
    if (Platform.OS === "web") {
      startStreaming();
    } else {
      Alert.alert("Web Only", "Live streaming requires a browser");
      onStreamEnd();
    }

    return () => {
      stopStreaming();
    };
  }, []);

  const startStreaming = async () => {
    try {
      const { data } = await createLivestream({
        variables: {
          neighborhoodId,
          title: "New Livestream", // Placeholder title
        },
      });

      const { id, sessionId } = data.createLivestream;
      setLivestreamId(id);
      setActiveSessionId(sessionId);
      setIsStreaming(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360 },
        audio: true,
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      let chunkIndex = 0;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          uploadChunk(e.data, chunkIndex++, sessionId);
        }
      };

      mediaRecorder.start(5000); // 5-second chunks
    } catch (err) {
      console.error("Failed to start stream:", err);
      Alert.alert("Failed to start stream", err.message);
      onStreamEnd();
    }
  };

  const uploadChunk = (chunk, index, sessionId) => {
    return new Promise((resolve, reject) => {
      const client = window.globalWebTorrentClient;
      if (!client) {
        return reject(new Error("WebTorrent client not initialized."));
      }

      client.seed(chunk, { name: `${sessionId}_chunk_${index}` }, (torrent) => {
        addLivestreamChunk({
          variables: {
            livestreamId,
            sessionId,
            chunkIndex: index,
            magnetLink: torrent.magnetURI,
          },
        })
          .then(resolve)
          .catch(reject);
      });
    });
  };

  const stopStreaming = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsStreaming(false);
    onStreamEnd();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recording...</Text>
      <TouchableOpacity style={styles.stopButton} onPress={stopStreaming}>
        <Text style={styles.stopButtonText}>Stop Stream</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 20,
  },
  stopButton: {
    backgroundColor: "#ff4444",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  stopButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});
