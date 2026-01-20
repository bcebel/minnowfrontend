import React, { useState, useEffect, useRef } from "react";
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
import { warehouse } from "../../components/StreamWearhouse.js";
import { unifiedUpload } from "../neighborhoods/neighborhood-chat.js";

// --- QUERIES ---
const GET_ME = gql`
  query GetMe {
    me {
      id
      username
    }
  }
`;
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

// --- P2P + SERVER LOGIC ---
const fetchChunkBytes = async (chunk) => {
  const { sessionId, chunkIndex, magnetLink } = chunk;
  const P2P_WAIT_MS = 5000;

  return new Promise(async (resolve) => {
    let resolved = false;

    // 1. P2P Attempt
    if (window.globalWebTorrentClient && magnetLink) {
      try {
        const client = window.globalWebTorrentClient;
let torrent =
  client.get(magnetLink) ||
  client.add(magnetLink, { name: `${sessionId}_${chunkIndex}` });
        const finish = (buf) => {
          if (!resolved) {
            resolved = true;
            resolve(new Uint8Array(buf));
          }
        };

        if (torrent.done) {
          torrent.files[0].getBuffer((err, buf) => finish(buf));
        } else {
          torrent.once("done", () =>
            torrent.files[0].getBuffer((err, buf) => finish(buf))
          );
        }
      } catch (e) {
        console.log("P2P error, waiting for server...");
      }
    }

    // 2. Server Fallback after 5 seconds
    setTimeout(async () => {
      if (!resolved) {
        try {
          const infoHash = magnetLink?.match(/btih:([a-zA-Z0-9]+)/)?.[1];
          const res = await fetch(
            `${API_BASE}/api/live-chunk/${sessionId}/${chunkIndex}?hash=${infoHash}`
          );
          if (res.ok) {
            const buf = await res.arrayBuffer();
            resolved = true;
            resolve(new Uint8Array(buf));
          }
        } catch (err) {
          resolve(null);
        }
      }
    }, P2P_WAIT_MS);
  });
};

// --- SUB-COMPONENT ---
function Livestream({ stream }) {
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const fetchingRef = useRef(new Set());
  const sessionId = stream.sessionId;

  // Inside Livestream component
useEffect(() => {
  return () => {
    const sessionToClean = sessionId;
    console.log(
      `[Janitor] 🏖️ Beach time. Checking back later for ${sessionToClean}`
    );

    setTimeout(async () => {
      // THE FIX: Check if we are still on this session before nuking!
      // If we've started a new stream, don't delete the old one yet if it's the same ID
      console.log(
        `[Janitor] 🍦 Ice cream done. Cleanup check: ${sessionToClean}`
      );

      // Only nuke if it's not the current active recording
      await warehouse.clearSession(sessionToClean).catch(() => {});

      if (window.globalWebTorrentClient) {
        window.globalWebTorrentClient.torrents.forEach((t) => {
          if (t.name && t.name.includes(sessionToClean)) {
            console.log(`[Janitor] 🚮 Removing old swarm: ${t.name}`);
            t.destroy();
          }
        });
      }
    }, 120000); // Give it 2 full minutes of "beach time"
  };
}, [sessionId]);

  // Inside Livestream component in livestream.tsx
  useEffect(() => {
    const fetchHeader = async () => {
      // Check if we already have it
      const existing = await warehouse.getChunk(sessionId, -1);
      if (existing) return;

      // If not, fetch it from server (Header is small, don't bother with P2P)
      try {
        const res = await fetch(`${API_BASE}/api/live-chunk/${sessionId}/-1`);
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          await warehouse.saveChunk(sessionId, -1, new Uint8Array(bytes));
          console.log("🎬 Header (-1) saved to Warehouse");
          // Trigger a re-render so Player knows it's there
          setAvailableInWarehouse((prev) => [...prev, -1]);
        }
      } catch (e) {
        console.error("Header fetch failed", e);
      }
      console.log(
        `[Scout] 🔍 Looking for Header at: ${API_BASE}/api/live-chunk/${sessionId}/-1`
      );
    };
    fetchHeader();
  }, [sessionId]);

useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
  variables: { sessionId },
  onData: async ({ data }) => {
    const chunk = data.data?.livestreamChunkAdded;
    if (!chunk || fetchingRef.current.has(chunk.chunkIndex)) return;

    fetchingRef.current.add(chunk.chunkIndex);

    // Check if this chunk has a thumbnail (header chunk at index -1)
    if (chunk.chunkIndex === -1 && chunk.thumbnailUrl) {
      // Save thumbnail to StreamChunk collection
      try {
        await saveThumbnailToStreamChunk(sessionId, chunk.thumbnailUrl);
      } catch (error) {
        console.log("Could not save thumbnail to StreamChunk:", error);
      }
    }

    const bytes = await fetchChunkBytes(chunk);
    if (bytes) {
      await warehouse.saveChunk(sessionId, chunk.chunkIndex, bytes);
      setAvailableInWarehouse((prev) => [
        ...new Set([...prev, chunk.chunkIndex]),
      ]);
    }
    fetchingRef.current.delete(chunk.chunkIndex);
  },
});

// Add this helper function
const saveThumbnailToStreamChunk = async (sessionId, thumbnailUrl) => {
  try {
    const response = await fetch(`${API_BASE}/api/stream-chunk/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        chunkIndex: -1,
        thumbnailUrl,
      }),
    });

    if (response.ok) {
      console.log("✅ Thumbnail saved to StreamChunk");
    }
  } catch (error) {
    console.error("Error saving thumbnail:", error);
  }
};

  return (
    <View style={styles.streamContainer}>
      <Text style={styles.streamTitle}>{stream.title}</Text>
      <NeighborhoodLiveStreamPlayer
        sessionId={sessionId}
        availableInWarehouse={availableInWarehouse}
      />
    </View>
  );
}

// --- MAIN SCREEN ---
export default function LivestreamScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedHood, setSelectedHood] = useState(null);

  const { data: meData, loading: l1 } = useQuery(GET_ME);
  const {
    data: streamsData,
    loading: l2,
    refetch,
  } = useQuery(GET_ACTIVE_LIVESTREAMS, { pollInterval: 5000 });
  const { data: hoodsData, loading: l3 } = useQuery(GET_MY_NEIGHBORHOODS);

  if (l1 || l2 || l3) return <ActivityIndicator style={{ marginTop: 50 }} />;

  if (isRecording) {
    return (
      <NeighborhoodLiveStreamRecorder
        neighborhoodId={selectedHood}
        username={meData?.me?.username}
        unifiedUpload={unifiedUpload}
        onStreamEnd={() => {
          setIsRecording(false);
          refetch();
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.container}>
        <Text style={styles.title}>Bubbles</Text>
        <View style={styles.picker}>
          {hoodsData?.myNeighborhoods.map((h) => (
            <TouchableOpacity
              key={h.id}
              onPress={() => setSelectedHood(h.id)}
              style={[styles.item, selectedHood === h.id && styles.selected]}
            >
              <Text style={{ color: "white" }}>{h.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.goLive}
          onPress={() =>
            selectedHood ? setIsRecording(true) : alert("Pick a bubble")
          }
        >
          <Text style={styles.btnText}>GO LIVE</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Active Streams</Text>
        {streamsData?.streams.map((s) => (
          <Livestream key={s.id} stream={s} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#130720" },
  container: { padding: 20, alignItems: "center" },
  title: {
    color: "white",
    fontSize: 20,
    marginVertical: 15,
    fontWeight: "bold",
  },
  picker: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  item: { padding: 10, backgroundColor: "#333", margin: 5, borderRadius: 20 },
  selected: { backgroundColor: "cyan" },
  goLive: {
    backgroundColor: "#151159",
    padding: 15,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },
  btnText: { color: "white", fontWeight: "bold" },
  streamContainer: { width: "100%", marginBottom: 30 },
  streamTitle: { color: "white", marginBottom: 10 },
});
