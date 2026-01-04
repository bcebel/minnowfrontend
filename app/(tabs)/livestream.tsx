import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { gql, useQuery, useSubscription } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";
import { warehouse } from "../../components/StreamWearhouse.js"; // Ensure this matches your export


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

// fetchChunkBytes.js
const fetchChunkBytes = async (chunk, torrentClient) => {
  const { magnetLink, sessionId, chunkIndex } = chunk;
  
  const p2pPromise = new Promise((resolve, reject) => {
    if (!torrentClient) return reject("No Torrent Client");
    let torrent = torrentClient.get(magnetLink) || torrentClient.add(magnetLink);

    torrent.on('done', () => {
      torrent.files[0].getArrayBuffer((err, buffer) => {
        if (err) reject(err); else resolve(buffer);
      });
    });
    setTimeout(() => reject(new Error("P2P Timeout")), 2500);
  });

  try {
    return await p2pPromise;
  } catch (err) {
    const response = await fetch(`/api/live-chunk/${sessionId}/${chunkIndex}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!response.ok) throw new Error("Server fetch failed");
    return await response.arrayBuffer();
  }
};

function Livestream({ stream }) {
  // --- 1. STATE & REFS (Now inside the component) ---
  const [liveChunks, setLiveChunks] = useState([]);
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const torrentClientRef = useRef(null);

  // --- 2. QUERIES & SUBSCRIPTIONS ---
  const { data: initialData } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId: stream.sessionId },
    skip: !stream.sessionId,
  });

  const { data: subscriptionData } = useSubscription(
    LIVESTREAM_CHUNK_SUBSCRIPTION,
    {
      variables: { sessionId: stream.sessionId },
      skip: !stream.sessionId,
      onData: async ({ data }) => {
        const newChunk = data.data?.livestreamChunkAdded;
        if (!newChunk || availableInWarehouse.includes(newChunk.chunkIndex))
          return;

        try {
          // Fetch and store in IndexedDB
          const videoBytes = await fetchChunkBytes(
            newChunk,
            torrentClientRef.current
          );
          await warehouse.saveChunk(newChunk.chunkIndex, videoBytes);

          // Signal the player that data is ready
          setAvailableInWarehouse((prev) =>
            [...prev, newChunk.chunkIndex].sort((a, b) => a - b)
          );
          console.log(`📥 Chunk ${newChunk.chunkIndex} stored in Warehouse`);
        } catch (err) {
          console.error("🔴 Warehouse Error:", err);
        }
      },
    }
  );

  // --- 3. SYNC INITIAL CHUNKS TO UI ---
  useEffect(() => {
    if (initialData?.streamChunks) {
      setLiveChunks(
        initialData.streamChunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
      );
    }
  }, [initialData]);

  const clearProcessedChunk = useCallback((chunkId) => {
    setLiveChunks((prev) => prev.filter((c) => c.id !== chunkId));
  }, []);

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.title || "Livestream"}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={stream.sessionId}
        setupMagnet={stream.magnetLink}
        initialChunks={liveChunks} // UI list
        availableInWarehouse={availableInWarehouse} // The actual data signal
        clearProcessedChunk={clearProcessedChunk}
        torrentClientRef={torrentClientRef} // Pass this down so the player can share it
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
