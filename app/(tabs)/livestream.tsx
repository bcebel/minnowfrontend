
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import LivestreamRecorder from "../../components/LivestreamRecorder";
import { Picker } from "@react-native-picker/picker";

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
    livestreams {
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

const GET_LIVESTREAM_CHUNKS = gql`
  query GetLivestreamChunks($sessionId: String!) {
    livestreamChunks(sessionId: $sessionId) {
      id
      sessionId
      chunkIndex
      magnetLink
    }
  }
`;

function Livestream({ stream }) {
  const { data } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId: stream.sessionId },
    pollInterval: 5000,
  });

  const [liveChunks, setLiveChunks] = useState([]);

  useEffect(() => {
    if (data && data.livestreamChunks) {
      setLiveChunks(data.livestreamChunks);
    }
  }, [data]);

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

  if ((streamsLoading && !streamsData) || (hoodsLoading && !hoodsData)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Loading data...</Text>
      </View>
    );
  }

  if (streamsError || hoodsError) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Error loading data.</Text>
        {streamsError && (
          <Text style={styles.text}>{streamsError.message}</Text>
        )}
        {hoodsError && <Text style={styles.text}>{hoodsError.message}</Text>}
      </View>
    );
  }

  const activeStreams = streamsData ? streamsData.livestreams : [];
  const neighborhoods = hoodsData ? hoodsData.myNeighborhoods : [];

  if (isRecording) {
    return (
      <View style={styles.container}>
        <LivestreamRecorder
          neighborhoodId={selectedHood}
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
          <Picker
            selectedValue={selectedHood}
            style={styles.picker}
            onValueChange={(itemValue) => setSelectedHood(itemValue)}
          >
            <Picker.Item label="Select a neighborhood..." value={null} />
            {neighborhoods.map((hood) => (
              <Picker.Item key={hood.id} label={hood.name} value={hood.id} />
            ))}
          </Picker>
          <TouchableOpacity style={styles.goLiveButton} onPress={handleGoLive}>
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
  picker: {
    backgroundColor: "#333",
    color: "white",
    marginBottom: 10,
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
