import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
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

const fetchChunkBytes = async (chunk, torrentClient, maxRetries = 5) => {
  const { sessionId, chunkIndex, magnetLink } = chunk;
  const infoHash = magnetLink?.match(/btih:([a-zA-Z0-9]+)/)?.[1];
  const API_BASE = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com";

  // --- 1. THE P2P LANE ---
  if (magnetLink && torrentClient) {
    const p2pData = await new Promise((resolve) => {
      // Increase discovery window to 5s for cellular/iPad stability
      const timeout = setTimeout(() => resolve(null), 5000);

      // Check if we are already seeding/downloading this
      const existing = torrentClient.get(magnetLink);
      if (existing && existing.done) {
        existing.files[0].getBuffer((err, buf) => {
          clearTimeout(timeout);
          resolve(buf);
        });
        return;
      }

      torrentClient.add(magnetLink, (torrent) => {
        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            clearTimeout(timeout);
            console.log(`💎 P2P HIT: Chunk ${chunkIndex} from swarm`);
            resolve(buf);
          });
        });
      });
    });

    if (p2pData) return p2pData;
  }

  // --- 2. THE SERVER LANE (Only if P2P fails/times out) ---
  for (let i = 0; i < maxRetries; i++) {
    try {
      const url = `${API_BASE}/api/live-chunk/${sessionId}/${chunkIndex}?hash=${infoHash}`;
      const response = await fetch(url);

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        // Turn this device into a Seed for the next person
        if (magnetLink && torrentClient && !torrentClient.get(magnetLink)) {
          torrentClient.seed(uint8, { name: `chunk_${chunkIndex}.mp4` });
          console.log(`📡 Scout SEEDING chunk ${chunkIndex} to swarm.`);
        }
        return uint8;
      }

      if (response.status === 404) {
        console.warn(`⏳ [Retry ${i + 1}] Chunk ${chunkIndex} pending...`);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        break;
      }
    } catch (err) {
      console.error("Server fetch error:", err);
    }
  }
  return null;
};

function Livestream({ stream }) {
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const hasSyncedInitial = useRef(false);
  const sessionId = stream.sessionId;

  // --- 1. INITIAL FETCH ---
  const { data: initialData } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId },
    skip: !sessionId,
  });

  // --- 2. CATCH-UP LOGIC (One time only!) ---
  useEffect(() => {
    const syncInitial = async () => {
      if (hasSyncedInitial.current || !initialData?.streamChunks) return;
      hasSyncedInitial.current = true; // Lock it!

      const chunks = initialData.streamChunks;
      const header = chunks.find((c) => c.fileType === "video_header");
      const latest = [...chunks]
        .filter((c) => c.chunkIndex !== -1)
        .sort((a, b) => b.chunkIndex - a.chunkIndex)[0];

      // We only care about the Header and the VERY LATEST chunk to get started
      const criticalItems = [];
      if (header) criticalItems.push({ ...header, index: -1 });
      if (latest) criticalItems.push({ ...latest, index: latest.chunkIndex });

      for (const item of criticalItems) {
        console.log(`📡 Scout Catch-up: Index ${item.index}`);
        const bytes = await fetchChunkBytes(
          item,
          window.globalWebTorrentClient
        );
        if (bytes) {
          await warehouse.saveChunk(sessionId, item.index, bytes);
          setAvailableInWarehouse((prev) => [
            ...new Set([...prev, item.index]),
          ]);
        }
      }
    };

    if (sessionId && initialData) syncInitial();
  }, [initialData, sessionId]);

  // --- 3. SUBSCRIPTION (The "Live Edge") ---
  useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    skip: !sessionId,
    onData: async ({ data }) => {
      const newChunk = data.data?.livestreamChunkAdded;
      if (!newChunk) return;

      const index =
        newChunk.fileType === "video_header" ? -1 : newChunk.chunkIndex;

      // If the Janitor already deleted it or we have it, skip
      if (availableInWarehouse.includes(index)) return;

      console.log(`✨ Scout Live: Chunk ${index}`);
      const bytes = await fetchChunkBytes(
        newChunk,
        window.globalWebTorrentClient
      );

      if (bytes) {
        await warehouse.saveChunk(sessionId, index, bytes);
        // Only update the signal so the Player knows to "Tick"
        setAvailableInWarehouse((prev) => [...new Set([...prev, index])]);
      }
    },
  });

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.title || "Livestream"}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={sessionId}
        availableInWarehouse={availableInWarehouse}
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
      alert("Please select a bubble to start a livestream.");
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
        {streamsError && (
          <Text style={styles.text}>{streamsError.message}</Text>
        )}
        {hoodsError && <Text style={styles.text}>{hoodsError.message}</Text>}
        {meError && <Text style={styles.text}>{meError.message}</Text>}
      </View>
    );
  }

  const activeStreams = streamsData?.streams || [];
  const neighborhoods = hoodsData?.myNeighborhoods || [];
  const filteredStreams = selectedHood
    ? activeStreams.filter((s) => s.neighborhood.id === selectedHood)
    : activeStreams;

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
          <Text style={styles.text}>Select a bubble to stream to:</Text>
          <View style={styles.pickerContainer}>
            {neighborhoods.map((hood) => (
              <TouchableOpacity
                key={hood.id}
                style={[
                  styles.pickerItem,
                  selectedHood === hood.id && styles.pickerItemSelected,
                ]}
                onPress={() => setSelectedHood(hood.id)}
              >
                <Text style={styles.pickerItemText}>{hood.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.goLiveButton}
            onPress={handleGoLive}
            disabled={!selectedHood}
          >
            <Text style={styles.goLiveButtonText}>Go Live</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Active Livestreams</Text>
        {filteredStreams.length > 0 ? (
          filteredStreams.map((stream) => (
            <Livestream key={stream.id} stream={stream} />
          ))
        ) : (
          <Text style={styles.text}>No active livestreams in this bubble.</Text>
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
    backgroundColor: "#130720",
  },
  scrollView: {
    backgroundColor: "#130720",
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
    borderColor: "#130720",
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
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 10,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#130720",
    borderRadius: 20,
    margin: 5,
  },
  pickerItemSelected: {
    backgroundColor: "#00ffff",
  },
  pickerItemText: {
    color: "white",
  },
  goLiveButton: {
    backgroundColor: "#151159",
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
