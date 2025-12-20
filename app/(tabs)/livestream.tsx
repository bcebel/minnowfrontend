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
  subscription LivestreamChunkAdded($sessionId: String!) {
    livestreamChunkAdded(sessionId: $sessionId) {
      id
      sessionId
      chunkIndex
      magnetLink
      fileType
    }
  }
`;

function Livestream({ stream }) {
  const [liveChunks, setLiveChunks] = useState([]);

  // 1. Fetch initial chunks that might already exist
  const { data: initialData } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId: stream.sessionId },
    skip: !stream.sessionId,
  });

  // 2. Listen for new chunks via GraphQL subscription
  const { data: subscriptionData } = useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId: stream.sessionId },
  });

  // 3. Load initial chunks once
  useEffect(() => {
    if (initialData?.streamChunks) {
      setLiveChunks(initialData.streamChunks);
    }
  }, [initialData]);

  // 4. Add new chunks as they arrive from the subscription
  useEffect(() => {
    if (subscriptionData?.livestreamChunkAdded) {
      const newChunk = subscriptionData.livestreamChunkAdded;
      setLiveChunks((prevChunks) => {
        if (!prevChunks.some(chunk => chunk.id === newChunk.id)) {
          return [...prevChunks, newChunk];
        }
        return prevChunks;
      });
    }
  }, [subscriptionData]);

  const clearProcessedChunk = useCallback((chunkId) => {
    setLiveChunks((prevChunks) =>
      prevChunks.filter((chunk) => chunk.id !== chunkId)
    );
  }, []);

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.title || "Livestream"}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={stream.sessionId}
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