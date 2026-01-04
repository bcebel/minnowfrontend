import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet, 
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery, useSubscription } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";

const GET_MY_NEIGHBORHOODS = gql`
  query GetMyNeighborhoods {
    myNeighborhoods {
      id
      name
    }
  }
`;

const GET_ACTIVE_LIVESTREAMS = gql`
  query GetActiveLivestreams {
    streams {
      id
      title
      sessionId
      neighborhood {
        id
        name
      }
    }
  }
`;

// Corrected query to use "streamChunks"
const GET_LIVESTREAM_CHUNKS = gql`
  query GetLivestreamChunks($sessionId: String!) {
    streamChunks(sessionId: $sessionId) {
      id
      sessionId
      chunkIndex
      magnetLink
      fileType
    }
  }
`;

const GET_ME = gql`
  query GetMe {
    me {
      id
      username
    }
  }
`;

const LIVESTREAM_CHUNK_SUBSCRIPTION = gql`
  subscription OnLivestreamChunkAdded($sessionId: String!) {
    livestreamChunkAdded(sessionId: $sessionId) {
      id
      sessionId
      chunkIndex
      magnetLink
      fileName
      fileType
      fileSize
    }
  }
`;

function Livestream({
  stream,
}: {
  stream: { id: string; sessionId?: string; magnetLink?: string; title?: string };
}) {
  type StreamChunk = {
    id: string;
    sessionId?: string;
    chunkIndex: number;
    magnetLink?: string;
    fileType?: string;
  };

  const [liveChunks, setLiveChunks] = useState<StreamChunk[]>([]);

  // 1. Fetch initial chunks that might already exist
  const { data: initialData } = useQuery<
    { streamChunks: StreamChunk[] },
    { sessionId: string }
  >(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId: stream.sessionId },
    skip: !stream.sessionId,
  });

  // 2. Listen for new chunks via GraphQL subscription
  // Change 'sessionId' to 'stream.sessionId'
  const { data: subscriptionData, error: subscriptionError } = useSubscription(
    LIVESTREAM_CHUNK_SUBSCRIPTION,
    {
      variables: { sessionId: stream.sessionId }, // <--- Fixed this line
      skip: !stream.sessionId, // Safety check
      onData: ({ data }) => {
        console.log("🔔 SUBSCRIPTION NOTIFICATION:", data.data);
      },
      onError: (err) => {
        console.error("❌ SUBSCRIPTION ERROR:", err);
        console.error("❌ Error details:", err.message);
        console.error("❌ Network error?", err.networkError);
        console.error("❌ GraphQL errors:", err.graphQLErrors);
      },
    }
  );
  // 3. Load initial chunks once
  useEffect(() => {
    if (subscriptionError) {
      console.log("🔍 Subscription error state:", subscriptionError);
    }
  }, [subscriptionError]);

  // 1. Initial Load Effect (Runs once when initialData arrives)
  useEffect(() => {
    if (initialData?.streamChunks) {
      setLiveChunks((prev) => {
        const chunkMap = new Map(prev.map((c) => [c.chunkIndex, c]));
        initialData.streamChunks.forEach((c) => chunkMap.set(c.chunkIndex, c));
        return Array.from(chunkMap.values()).sort(
          (a, b) => a.chunkIndex - b.chunkIndex
        );
      });
      console.log("📦 Loaded initial chunks:", initialData.streamChunks.length);
    }
  }, [initialData]);

  // 2. Subscription Effect (Runs every time a NEW chunk is added)
  // livestream.tsx
useEffect(() => {
  if (subscriptionData?.livestreamChunkAdded) {
    const newChunk = subscriptionData.livestreamChunkAdded;
    console.log(`🔥 SUB RECEIVED: Chunk #${newChunk.chunkIndex}`);

    setLiveChunks((prev) => {
      // Don't add if we have it
      if (prev.find((c) => c.chunkIndex === newChunk.chunkIndex)) return prev;

      const newTray = [...prev, newChunk].sort(
        (a, b) => a.chunkIndex - b.chunkIndex
      );
      console.log(
        "Current Tray of Chunks:",
        newTray.map((c) => c.chunkIndex)
      );
      return newTray;
    });
  }
}, [subscriptionData]);

  const clearProcessedChunk = useCallback((chunkId: string) => {
    setLiveChunks((prevChunks) =>
      prevChunks.filter((chunk) => chunk.id !== chunkId)
    );
  }, []);

  console.log(
    "Current Tray of Chunks:",
    liveChunks.map((c) => c.chunkIndex)
  );

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.title || "Livestream"}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={stream.sessionId}
        setupMagnet={stream.magnetLink}
        initialChunks={liveChunks}
        clearProcessedChunk={clearProcessedChunk}
      />
    </View>
  );
}

export default function LivestreamScreen() {
  const { data: meData, loading: meLoading, error: meError } = useQuery(GET_ME);
  const username = meData?.me?.username;

  const {
    loading: streamsLoading,
    error: streamsError,
    data: streamsData,
    refetch,
  } = useQuery(GET_ACTIVE_LIVESTREAMS, {
    pollInterval: 10000,
  });

  const {
    loading: hoodsLoading,
    error: hoodsError,
    data: hoodsData,
  } = useQuery(GET_MY_NEIGHBORHOODS);

  const [isRecording, setIsRecording] = useState(false);
  const [selectedHood, setSelectedHood] = useState(null);

  const handleGoLive = () => {
    if (selectedHood) {
      setIsRecording(true);
    } else {
      alert("Please select a neighborhood to start a livestream.");
    }
  };

  const handleStreamEnd = () => {
    setIsRecording(false);
    refetch();
  };

  if (meLoading || streamsLoading || hoodsLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Loading data...</Text>
      </View>
    );
  }

  if (streamsError || hoodsError || meError) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Error loading data.</Text>
        {streamsError && <Text style={styles.text}>{streamsError.message}</Text>}
        {hoodsError && <Text style={styles.text}>{hoodsError.message}</Text>}
        {meError && <Text style={styles.text}>{meError.message}</Text>}
      </View>
    );
  }

  const activeStreams = streamsData?.streams || [];
  const neighborhoods = hoodsData?.myNeighborhoods || [];

  if (isRecording) {
    return (
      <View style={styles.container}>
        <NeighborhoodLiveStreamRecorder
          neighborhoodId={selectedHood}
          username={username}
          onStreamEnd={handleStreamEnd}
        />
      </View>
    );
  }
  

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>Livestreams</Text>

        <View style={styles.controlsContainer}>
          <Text style={styles.text}>Select a neighborhood to stream to:</Text>
          <View style={styles.pickerContainer}>
            {neighborhoods.map((hood) => (
              <TouchableOpacity
                key={hood.id}
                style={[styles.pickerItem, selectedHood === hood.id && styles.pickerItemSelected]}
                onPress={() => setSelectedHood(hood.id)}
              >
                <Text style={styles.pickerItemText}>{hood.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.goLiveButton} onPress={handleGoLive} disabled={!selectedHood}>
            <Text style={styles.goLiveButtonText}>Go Live</Text>
          </TouchableOpacity>
        </View>

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
  controlsContainer: {
    width: "100%",
    maxWidth: 600,
    marginBottom: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#333',
    borderRadius: 20,
    margin: 5,
  },
  pickerItemSelected: {
    backgroundColor: '#00ffff',
  },
  pickerItemText: {
    color: 'white',
  },
  goLiveButton: {
    backgroundColor: "#ff4444",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  goLiveButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});
