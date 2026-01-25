import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery, useSubscription } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";
import { warehouse } from "../../components/StreamWearhouse.js";

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

// SIMPLE: Just get streams
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
      thumbnailUrl
    }
  }
`;

const API_BASE = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com";

// --- HELPER: Fetch ALL messages with thumbnails ---
async function fetchAllMessagesWithThumbnails() {
  try {
    const response = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query GetAllMessages {
            messages {
              sessionId
              thumbnailUrl
            }
          }
        `,
      }),
    });

    const result = await response.json();
    console.log("📨 All messages:", result.data?.messages?.length || 0);

    // Filter for messages with thumbnails and sessionId
    const messagesWithThumbs = (result.data?.messages || []).filter(
      (m) => m.thumbnailUrl && m.sessionId,
    );

    console.log("🖼️ Messages with thumbnails:", messagesWithThumbs.length);
    return messagesWithThumbs;
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return [];
  }
}

// --- LIVESTREAM COMPONENT ---
function Livestream({ stream }) {
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const fetchingRef = useRef(new Set());
  const [showPlayer, setShowPlayer] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [loadingThumbnail, setLoadingThumbnail] = useState(true);
  const sessionId = stream.sessionId;

  // Fetch thumbnail for this stream
  useEffect(() => {
    const fetchThumbnail = async () => {
      setLoadingThumbnail(true);

      try {
        // Try to get thumbnail from backend API
        const response = await fetch(`${API_BASE}/api/thumbnail/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.thumbnailUrl) {
            setThumbnailUrl(data.thumbnailUrl);
            setLoadingThumbnail(false);
            return;
          }
        }
      } catch (error) {
        console.log("Thumbnail API failed:", error);
      }

      // Fallback: Try to fetch all messages and find one for this session
      try {
        const messages = await fetchAllMessagesWithThumbnails();
        const matchingMessage = messages.find((m) => m.sessionId === sessionId);

        if (matchingMessage?.thumbnailUrl) {
          setThumbnailUrl(matchingMessage.thumbnailUrl);
        } else {
          // Use fallback image
          const fallbacks = [
            "https://images.pexels.com/photos/4621606/pexels-photo-4621606.jpeg",
            "https://images.pexels.com/photos/268533/pexels-photo-268533.jpeg",
          ];
          setThumbnailUrl(
            fallbacks[Math.floor(Math.random() * fallbacks.length)],
          );
        }
      } catch (error) {
        console.log("Message fetch failed:", error);
        // Use fallback
        setThumbnailUrl(
          "https://images.pexels.com/photos/4621606/pexels-photo-4621606.jpeg",
        );
      }

      setLoadingThumbnail(false);
    };

    fetchThumbnail();
  }, [sessionId]);

  // Janitor logic
  useEffect(() => {
    return () => {
      const sessionToClean = sessionId;
      setTimeout(async () => {
        await warehouse.clearSession(sessionToClean).catch(() => {});
        if (window.globalWebTorrentClient) {
          window.globalWebTorrentClient.torrents.forEach((t) => {
            if (t.name && t.name.includes(sessionToClean)) {
              t.destroy();
            }
          });
        }
      }, 120000);
    };
  }, [sessionId]);

  // Scout logic
  useEffect(() => {
    const fetchHeader = async () => {
      const existing = await warehouse.getChunk(sessionId, -1);
      if (existing) return;
      try {
        const res = await fetch(`${API_BASE}/api/live-chunk/${sessionId}/-1`);
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          await warehouse.saveChunk(sessionId, -1, new Uint8Array(bytes));
          setAvailableInWarehouse((prev) => [...prev, -1]);
        }
      } catch (e) {
        console.error("Header fetch failed", e);
      }
    };
    fetchHeader();
  }, [sessionId]);

  // Subscription
  useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    onData: async ({ data }) => {
      const chunk = data.data?.livestreamChunkAdded;
      if (!chunk || fetchingRef.current.has(chunk.chunkIndex)) return;
      fetchingRef.current.add(chunk.chunkIndex);

      // If this chunk has a thumbnail
      if (chunk.thumbnailUrl && !thumbnailUrl) {
        setThumbnailUrl(chunk.thumbnailUrl);
      }

      const bytes = await new Promise(async (resolve) => {
        let resolved = false;

        if (window.globalWebTorrentClient && chunk.magnetLink) {
          try {
            const client = window.globalWebTorrentClient;
            let torrent =
              client.get(chunk.magnetLink) ||
              client.add(chunk.magnetLink, {
                name: `${sessionId}_${chunk.chunkIndex}`,
              });

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
                torrent.files[0].getBuffer((err, buf) => finish(buf)),
              );
            }
          } catch (e) {
            console.log("P2P error");
          }
        }

        setTimeout(async () => {
          if (!resolved) {
            try {
              const infoHash =
                chunk.magnetLink?.match(/btih:([a-zA-Z0-9]+)/)?.[1];
              const res = await fetch(
                `${API_BASE}/api/live-chunk/${sessionId}/${chunk.chunkIndex}?hash=${infoHash}`,
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
        }, 5000);
      });

      if (bytes) {
        await warehouse.saveChunk(sessionId, chunk.chunkIndex, bytes);
        setAvailableInWarehouse((prev) => [
          ...new Set([...prev, chunk.chunkIndex]),
        ]);
      }
      fetchingRef.current.delete(chunk.chunkIndex);
    },
  });

return (
  <View style={styles.streamContainer}>
    <Text style={styles.streamTitle}>{stream.title}</Text>
    <View style={styles.videoBox}>
      <NeighborhoodLiveStreamPlayer
        sessionId={stream.sessionId}
        onThumbnailLoaded={() => {}}
        // FIX: Use 'thumbnailUrl' (which you defined with useState)
        // instead of 'thumbnailOverride'
        initialChunks={thumbnailUrl ? [{ thumbnailUrl: thumbnailUrl }] : []}
      />
    </View>
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
  } = useQuery(GET_ACTIVE_LIVESTREAMS, {
    pollInterval: 5000,
  });
  const { data: hoodsData, loading: l3 } = useQuery(GET_MY_NEIGHBORHOODS);

  // Debug
  useEffect(() => {
    if (streamsData) {
      console.log("📊 Streams loaded:", streamsData.streams?.length || 0);
    }
  }, [streamsData]);

  if (l1 || l2 || l3) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading streams...</Text>
      </View>
    );
  }

  if (isRecording) {
    return (
      <NeighborhoodLiveStreamRecorder
        neighborhoodId={selectedHood}
        username={meData?.me?.username}
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
        {streamsData?.streams && streamsData.streams.length > 0 ? (
          streamsData.streams.map((s) => <Livestream key={s.id} stream={s} />)
        ) : (
          <View style={styles.noStreams}>
            <Text style={styles.noStreamsText}>No active streams</Text>
            <Text style={styles.noStreamsSubtext}>
              Start a stream to see it here!
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: "#130720",
    flex: 1,
  },
  container: {
    padding: 20,
    alignItems: "center",
    paddingBottom: 40,
  },
  title: {
    color: "white",
    fontSize: 20,
    marginVertical: 15,
    fontWeight: "bold",
  },
  picker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  item: {
    padding: 10,
    backgroundColor: "#333",
    margin: 5,
    borderRadius: 20,
  },
  selected: {
    backgroundColor: "#007AFF",
  },
  goLive: {
    backgroundColor: "#ff375f",
    padding: 15,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  btnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  streamContainer: {
    width: "100%",
    marginBottom: 30,
  },
  streamTitle: {
    color: "white",
    marginBottom: 5,
    fontSize: 16,
    fontWeight: "bold",
  },
  sessionId: {
    color: "#888",
    fontSize: 10,
    marginBottom: 10,
    fontFamily: "monospace",
  },
  videoContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  thumbnailWrapper: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  thumbnailLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#333",
  },
  placeholderText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  placeholderSubtext: {
    color: "#aaa",
    fontSize: 12,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
    marginBottom: 10,
  },
  playIcon: {
    color: "white",
    fontSize: 30,
    marginLeft: 5,
  },
  playText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "white",
    marginRight: 6,
  },
  liveText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  backButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 10,
  },
  backButtonText: {
    color: "white",
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#130720",
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  noStreams: {
    padding: 40,
    alignItems: "center",
  },
  noStreamsText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  noStreamsSubtext: {
    color: "#888",
    fontSize: 14,
  },
  videoBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
});
