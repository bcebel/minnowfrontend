import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";

const GET_ACTIVE_LIVESTREAMS = gql`
  query GetActiveLivestreams {
    messages(fileType: "live_stream_chunked") {
      id
      content
      fileName
      fileType
      sessionId
      chunkIndex
      magnetLink
      sender {
        id
        username
      }
    }
  }
`;

const GET_LIVESTREAM_CHUNKS = gql`
  query GetLivestreamChunks($sessionId: String!) {
    messages(fileType: "video_chunk", sessionId: $sessionId) {
      id
      sessionId
      chunkIndex
      magnetLink
    }
  }
`;

function Livestream({ stream }) {
  const { loading, error, data } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId: stream.sessionId },
    pollInterval: 5000,
  });

  const [liveChunks, setLiveChunks] = useState([]);

  useEffect(() => {
    if (data && data.messages) {
      setLiveChunks(data.messages);
    }
  }, [data]);

  const clearProcessedChunk = useCallback((chunkId) => {
    setLiveChunks((prevChunks) =>
      prevChunks.filter((chunk) => chunk.id !== chunkId)
    );
  }, []);

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.fileName || "Livestream"}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={stream.sessionId}
        initialChunks={liveChunks}
        clearProcessedChunk={clearProcessedChunk}
      />
    </View>
  );
}

export default function LivestreamScreen() {
  const { loading, error, data } = useQuery(GET_ACTIVE_LIVESTREAMS, {
    pollInterval: 10000, // Refresh every 10 seconds
  });

  if (loading && !data) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Loading Livestreams...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Error loading streams.</Text>
        <Text style={styles.text}>{error.message}</Text>
      </View>
    );
  }

  const activeStreams = data ? data.messages : [];

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>Active Livestreams</Text>
        {activeStreams.length > 0 ? (
          activeStreams.map((stream) => (
            <Livestream key={stream.id} stream={stream} />
          ))
        ) : (
          <Text style={styles.text}>No active livestreams.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: "#000",
  },
  scrollView: {
    backgroundColor: "#000",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  text: {
    color: "#fff",
  },
  streamContainer: {
    marginBottom: 20,
    width: "100%",
    maxWidth: 600,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 10,
  },
  streamTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
