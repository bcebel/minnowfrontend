import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery, useSubscription } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";
import { warehouse } from "../../components/StreamWearhouse.js";
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
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
    }
    messages {
      sessionId
      thumbnailUrl
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
      <Text style={styles.sessionId}>{sessionId}</Text>

      <View style={styles.videoContainer}>
        {!showPlayer ? (
          // THUMBNAIL VIEW
          <TouchableOpacity
            style={styles.thumbnailWrapper}
            onPress={() => setShowPlayer(true)}
            activeOpacity={0.8}
          >
            {loadingThumbnail ? (
              <View style={styles.thumbnailLoading}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.loadingText}>Loading thumbnail...</Text>
              </View>
            ) : thumbnailUrl ? (
              <>
                <Image
                  source={{ uri: thumbnailUrl }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
                <View style={styles.playOverlay}>
                  <View style={styles.playButton}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                  <Text style={styles.playText}>Click to watch live</Text>
                </View>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </>
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Text style={styles.placeholderText}>No thumbnail</Text>
                <Text style={styles.placeholderSubtext}>Click to watch</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          // PLAYER VIEW
          <>
            <NeighborhoodLiveStreamPlayer
              sessionId={sessionId}
              availableInWarehouse={availableInWarehouse}
            />
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowPlayer(false)}
            >
              <Text style={styles.backButtonText}>← Back to thumbnail</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export default function LivestreamScreen() {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedHood, setSelectedHood] = useState(null);

  const { data: meData, loading: l1 } = useQuery(GET_ME);
  const {
    data: streamsData,
    loading: l2,
    refetch,
  } = useQuery(GET_ACTIVE_LIVESTREAMS, {
    pollInterval: 8000,
  });
  const { data: hoodsData, loading: l3 } = useQuery(GET_MY_NEIGHBORHOODS);

  // Handle scrolling to switch active video
  const handleScroll = useCallback(
    (event) => {
      const yOffset = event.nativeEvent.contentOffset.y;
      const index = Math.round(yOffset / SCREEN_HEIGHT);
      if (index !== activeIndex) {
        setActiveIndex(index);
      }
    },
    [activeIndex, SCREEN_HEIGHT],
  );

  if (l1 || l2 || l3)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );

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
    <View style={[styles.mainWrapper, { height: SCREEN_HEIGHT }]}>
      <ScrollView
        pagingEnabled
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
      >
        {/* PAGE 1: THE PICKER (Index 0) */}
        <View style={[styles.fullPage, { height: SCREEN_HEIGHT }]}>
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
          <Text style={styles.hint}>↓ Scroll for Streams ↓</Text>
        </View>

        {/* PAGES 2+: LIVE STREAMS (Index 1+) */}
        {streamsData?.streams?.map((s, index) => (
          <LivestreamItem
            key={s.id}
            stream={s}
            screenHeight={SCREEN_HEIGHT}
            // Only mount player if this page is active
            isVisible={index + 1 === activeIndex}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// --- ISOLATED ITEM COMPONENT ---
const LivestreamItem = React.memo(({ stream, screenHeight, isVisible }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    const huntForHeader = async () => {
      const sessionId = stream.sessionId;

      // 1. Check Warehouse
      const existing = await warehouse.getChunk(sessionId, -1);
      if (existing) {
        setReady(true);
        return;
      }

      // 2. Check Server Fallback
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/live-chunk/${sessionId}/-1`,
        );
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          await warehouse.saveChunk(sessionId, -1, new Uint8Array(bytes));
          setReady(true);
          console.log("✅ Header recovered from Server");
          return;
        }
      } catch (e) {
        console.log("📡 Server fetch failed, waiting for P2P...");
      }

      // 3. If the stream object has a magnet, try WebTorrent here too
      // (This is what makes 'New' streams work if the server is still processing)
    };

    const interval = setInterval(huntForHeader, 4000);
    huntForHeader();
    return () => clearInterval(interval);
  }, [isVisible, stream.sessionId]);

  if (!isVisible) return <View style={{ height: screenHeight }} />;

  return (
    <View style={{ height: screenHeight, backgroundColor: "#000" }}>
      {ready ? (
        <NeighborhoodLiveStreamPlayer
          sessionId={stream.sessionId}
          muted
          autoPlay
        />
      ) : (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color="#ff375f" />
          <Text style={{ color: "#fff", marginTop: 10 }}>
            Connecting to Hive...
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: "#000" },
  fullPage: { width: "100%", justifyContent: "center", alignItems: "center" },
  title: { color: "white", fontSize: 32, fontWeight: "bold", marginBottom: 30 },
  picker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 30,
  },
  item: {
    padding: 15,
    backgroundColor: "#222",
    margin: 5,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#444",
  },
  selected: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  goLive: {
    backgroundColor: "#ff375f",
    padding: 20,
    borderRadius: 15,
    width: "70%",
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "bold", fontSize: 18 },
  hint: { color: "#444", marginTop: 40 },
  overlay: { position: "absolute", bottom: 100, left: 20 },
  streamTitle: { color: "white", fontSize: 22, fontWeight: "bold" },
  liveBadge: {
    backgroundColor: "red",
    padding: 4,
    borderRadius: 4,
    width: 45,
    marginTop: 5,
  },
  liveText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },
  loading: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
});