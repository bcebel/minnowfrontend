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
// Clean Global Initialization (Put this once at the very top after imports)
if (typeof window !== "undefined") {
  const initGlobalClient = () => {
    // Only proceed if WebTorrent script is loaded AND client isn't already made
    if (window.WebTorrent && !window.globalWebTorrentClient) {
      console.log("🕸️ Global WebTorrent Client Forced Initialization");
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
      // CRITICAL: Prevent the memory leak warnings from crashing the browser
      window.globalWebTorrentClient.setMaxListeners(100);
    } else if (!window.WebTorrent) {
      // Script not ready? Try again in 100ms
      setTimeout(initGlobalClient, 100);
    }
  };
  initGlobalClient();
}

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
const API_BASE = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com";
// Defensive Global Client Init


// The "Safety Net" for when the Global Client is physically blocked (Incognito)
const fallbackServerFetch = async (chunk) => {
  const { sessionId, chunkIndex, magnetLink } = chunk;
  const infoHash = magnetLink?.match(/btih:([a-zA-Z0-9]+)/)?.[1];
  const url = `${API_BASE}/api/live-chunk/${sessionId}/${chunkIndex}?hash=${infoHash}`;
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      console.log(`%c 🛡️ EMERGENCY FALLBACK HIT: Chunk ${chunkIndex} `, "background: #ff0000; color: #fff");
      return uint8;
    }
  } catch (err) {
    console.error("Fallback fetch failed:", err);
  }
  return null;
};


// 2. Update fetchChunkBytes to be even more patient
const fetchChunkBytes = async (chunk) => {
  const { sessionId, chunkIndex, magnetLink, fileType } = chunk;

  let client = typeof window !== 'undefined' ? window.globalWebTorrentClient : null;
  
  // Wait up to 3 seconds for the client to wake up
  if (!client && typeof window !== 'undefined') {
    console.log(`⏳ Chunk ${chunkIndex} waiting for Global Client...`);
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200));
      client = window.globalWebTorrentClient;
      if (client) break;
    }
  }

  if (!client) {
    console.warn(`⚠️ Client still missing for Chunk ${chunkIndex}. Lane: Fallback.`);
    return fallbackServerFetch(chunk);
  }
  

  const infoHash = magnetLink?.match(/btih:([a-zA-Z0-9]+)/)?.[1];
  const indexToSave = fileType === "video_header" || chunkIndex === -1 ? -1 : chunkIndex;
  const serverUrl = `${API_BASE}/api/live-chunk/${sessionId}/${chunkIndex}?hash=${infoHash}`;

  return new Promise((resolve) => {
    let torrent = client.get(magnetLink);

    if (!torrent) {
      torrent = client.add(magnetLink, {
        strategy: "sequential",
        announce: [
          "wss://tracker.openwebtorrent.com",
          "wss://tracker.webtorrent.dev",
          "wss://tracker.files.fm:7073/announce",
        ],
      });
      torrent.addWebSeed(serverUrl);
    }

    torrent.on("wire", (wire) => {
      console.log(`%c 🤝 PEER FOUND (${wire.type}): ${chunkIndex} `, "background: #1e90ff; color: #fff");
    });

    const finish = () => {
      torrent.files[0].getBuffer(async (err, buf) => {
        if (err) return resolve(null);
        const source = torrent.numPeers > 0 ? "🛰️ P2P" : "☁️ WEBSEED";
        console.log(`%c ${source} HIT: Chunk ${chunkIndex} `, "background: #00ff00; color: #000");
        await warehouse.saveChunk(sessionId, indexToSave, buf);
        resolve(buf);
      });
    };

    if (torrent.done) finish();
    else torrent.once("done", finish);

    // The "23 Eons" Safety: If it's been 30s and progress is 0, 
    // WebTorrent might be stuck on a dead peer.
    setTimeout(() => {
      if (!torrent.done && torrent.progress === 0) {
        console.warn(`🐢 Chunk ${chunkIndex} is stalling. Force-fetching from WebSeed.`);
        // WebTorrent will naturally try the WebSeed harder now.
      }
    }, 30000);
  });
};

function Livestream({ stream }) {
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const fetchingRef = useRef(new Set()); // Track chunks currently in flight
  const hasSyncedInitial = useRef(false);
  const sessionId = stream.sessionId;

  // --- 1. INITIAL FETCH ---
  const { data: initialData } = useQuery(GET_LIVESTREAM_CHUNKS, {
    variables: { sessionId },
    skip: !sessionId,
  });

  // --- 2. CATCH-UP LOGIC (One time only!) ---
  // Inside your useEffect for syncInitial
  useEffect(() => {
    const syncInitial = async () => {
      if (hasSyncedInitial.current || !initialData?.streamChunks) return;
      hasSyncedInitial.current = true;

      const chunks = initialData.streamChunks;

      // 1. FIND THE HEADER (-1)
      const header = chunks.find(
        (c) => c.fileType === "video_header" || c.chunkIndex === -1
      );

      // 2. FIND THE LIVE EDGE
      const latest = [...chunks]
        .filter((c) => c.chunkIndex !== -1)
        .sort((a, b) => b.chunkIndex - a.chunkIndex)[0];

      // MUST FETCH HEADER FIRST
      if (header) {
        console.log("🎬 Scout: Fetching Critical Header...");
        const headerBytes = await fetchChunkBytes(header);
        if (headerBytes) {
          await warehouse.saveChunk(sessionId, -1, headerBytes);
          setAvailableInWarehouse((prev) => [...new Set([...prev, -1])]);
        }
      }

      // THEN FETCH LIVE EDGE
      if (latest) {
        console.log(`⏩ Scout: Catching up to Edge (${latest.chunkIndex})`);
        const edgeBytes = await fetchChunkBytes(latest);
        if (edgeBytes) {
          await warehouse.saveChunk(sessionId, latest.chunkIndex, edgeBytes);
          setAvailableInWarehouse((prev) => [
            ...new Set([...prev, latest.chunkIndex]),
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
      if (availableInWarehouse.includes(index) || fetchingRef.current.has(index)) return;

      fetchingRef.current.add(index);
      console.log(`✨ Scout Live: Chunk ${index}`);

      const bytes = await fetchChunkBytes(newChunk);

      if (bytes) {
        await warehouse.saveChunk(sessionId, index, bytes);
        // Only update the signal so the Player knows to "Tick"
        setAvailableInWarehouse((prev) => [...new Set([...prev, index])]);
      }
      fetchingRef.current.delete(index);
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
