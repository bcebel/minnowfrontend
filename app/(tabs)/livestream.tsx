import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  FlatList,
  TouchableOpacity,
} from "react-native";
import TabPreview from "../../components/LandingPreview";
import { AuthContext } from "../../contexts/AuthProvider";
import { gql, useQuery, useSubscription } from "@apollo/client";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer";
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";
import { warehouse } from "../../components/StreamWearhouse.js";

const GET_STREAM_ROTATION = gql`
  query GetStreamRotation($sessionId: String!) {
    messages(sessionId: $sessionId) {
      rotation
    }
  }
`;
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
    streams(
      status: "live" # ✅ Only get live streams
    ) {
      id
      title
      sessionId
      status
      createdAt
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
      rotation
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
      rotation
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
/*
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

  useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    onSubscriptionData: ({ subscriptionData }) => {
      console.log("🔄 Subscription data received:", subscriptionData);
    },
    onError: (error) => {
      console.error("❌ Subscription error:", error);
    },
    onComplete: () => {
      console.log("✅ Subscription complete");
    },
    // Add this to see if it's even trying
    skip: !sessionId,
  });
  // Subscription
  useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    onData: async ({ data }) => {
      const chunk = data.data?.livestreamChunkAdded;
      if (!chunk || fetchingRef.current.has(chunk.chunkIndex)) return;
      fetchingRef.current.add(chunk.chunkIndex);
      console.log(
        `🔄 Received chunk ${chunk.chunkIndex} with rotation: ${chunk.rotation}`,
      );

      if (chunk.chunkIndex === -1 && chunk.rotation) {
        console.log(`🎯 Header rotation: ${chunk.rotation}°`);
        // You could store this in state and pass to player
      }
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
                rotation={rotation}
                
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
*/
export default function LivestreamScreen() {
const router = useRouter();
  
  // ✅ Get the token from your context
  const { token } = React.useContext(AuthContext); 
  // OR, if you made a useAuth hook:
  // const { token } = useAuth();

  // 🚨 The Guard: If there is no token, show the preview
  // (This runs BEFORE any useQuery calls, so Apollo never fires)
  if (!token) {
    return (
      <TabPreview
        icon="📡"
        title="P2P Livestreams"
        description="Stream to your community without buffering. Your content is served by the swarm, not a central server."
        onSignUp={() => router.push('/login')}
      />
    );
  }
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const [isRecording, setIsRecording] = useState(false);
  const [selectedHood, setSelectedHood] = useState(null);

  // 1. Get Me, Neighborhoods,
  // and Streams
  const { data: meData } = useQuery(GET_ME);
  const { data: hoodsData, loading: lHoods } = useQuery(GET_MY_NEIGHBORHOODS);
  const {
    data: streamsData,
    loading: lStreams,
    refetch,
  } = useQuery(GET_ACTIVE_LIVESTREAMS, {
    pollInterval: 5000,
  });

  // 2. Handle Recording State
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

  if (lHoods || lStreams) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View
      style={[styles.mainWrapper, { height: SCREEN_HEIGHT, paddingBottom: 40 }]}
    >
      <FlatList
        data={streamsData?.streams || []}
        keyExtractor={(item) => item.id}
        pagingEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        // ✅ Header goes here
        ListHeaderComponent={
          <View
            style={[
              styles.fullPage,
              { height: SCREEN_HEIGHT, backgroundColor: "#130720" },
            ]}
          >
            <View style={{ width: "100%", alignItems: "center", zIndex: 10 }}>
              <Text style={styles.title}>Pick a Bubble to Stream To</Text>

              <View style={styles.picker}>
                {hoodsData?.myNeighborhoods?.map((h) => (
                  <TouchableOpacity
                    key={h.id}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                      styles.item,
                      selectedHood === h.id && styles.selected,
                    ]}
                    onPress={() => {
                      console.log("Selected:", h.name);
                      setSelectedHood(h.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      pointerEvents="none"
                      style={{ color: "white", fontWeight: "600" }}
                    >
                      {h.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.goLive, { zIndex: 20 }]}
                onPress={() =>
                  selectedHood ? setIsRecording(true) : alert("Pick a bubble")
                }
              >
                <Text style={styles.btnText}>GO LIVE</Text>
              </TouchableOpacity>

              <Text
                style={[styles.loadingText, { marginTop: 40, opacity: 0.6 }]}
              >
                Scroll down to watch active streams ↓
              </Text>
            </View>
          </View>
        }
        // ✅ Render items here
        renderItem={({ item }) => (
          <View style={[styles.fullPage, { height: SCREEN_HEIGHT }]}>
            <LivestreamPreview stream={item} />
          </View>
        )}
        // ✅ Empty state
        ListEmptyComponent={
          <View style={[styles.fullPage, { height: SCREEN_HEIGHT }]}>
            <Text style={styles.noStreamsText}>No active streams nearby</Text>
          </View>
        }
      />
    </View>
  );
}

// --- THE NEW "LIVESTREAM PREVIEW" COMPONENT ---
function LivestreamPreview({ stream }) {
  const [availableInWarehouse, setAvailableInWarehouse] = useState([]);
  const [streamStatus, setStreamStatus] = useState("loading"); // 👈 ADD THIS LIN
  const sessionId = stream.sessionId;
  // 3. THE ROTATION QUERY: Just get rotation directly
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const shouldRotate = isSafari || isiPhone;
  

const [rotation, setRotation] = useState(0);
  // 1. THE SCOUT: Polls for the header/chunk 0 until it finds them
  // This handles the "It just started" race condition
  // In LivestreamPreview.jsx, update the polling effect:

 useEffect(() => {
   let isMounted = true;

   const fetchRotation = async () => {
     try {
       const res = await fetch(`${API_BASE}/api/stream-rotation/${sessionId}`);
       const data = await res.json();
       if (isMounted) {
         setRotation(data.rotation || 0);
         console.log(`🔄 Rotation from REST: ${data.rotation}°`);
       }
     } catch (e) {
       // silent fail
     }
   };

   fetchRotation();
   const interval = setInterval(fetchRotation, 2000);
   return () => {
     isMounted = false;
     clearInterval(interval);
   };
 }, [sessionId]);
  
  useEffect(() => {
    let interval;
    let isMounted = true;
    let attemptCount = 0;

    
    const findInitialData = async () => {
      // First check if stream is expired
      const streamAge = Date.now() - new Date(stream.createdAt).getTime();
      if (streamAge > 2 * 60 * 60 * 1000) {
        console.log(`⏰ Stream ${sessionId} expired (${streamAge}ms old)`);
        if (isMounted) {
          setStreamStatus("expired");
          // Remove from available streams
          // You might want to call a parent callback to remove this stream
        }
        clearInterval(interval);
        return;
      }

      const isExpired = await warehouse.isStreamExpired(sessionId);
      if (isExpired) {
        console.log("⏰ Stream expired");
        setStreamStatus("expired");
        clearInterval(interval);
        return;
      }

      const chunksToGet = [-1, 0];
      let foundCount = 0;

      for (const idx of chunksToGet) {
        if (availableInWarehouse.includes(idx)) {
          foundCount++;
          continue;
        }

        try {
          const res = await fetch(
            `${API_BASE}/api/live-chunk/${sessionId}/${idx}`,
          );

          if (res.ok) {
            const bytes = await res.arrayBuffer();
            await warehouse.saveChunk(sessionId, idx, new Uint8Array(bytes));
            setAvailableInWarehouse((prev) => [...new Set([...prev, idx])]);
            foundCount++;
          } else if (res.status === 404) {
            // Chunk not ready yet
            console.log(`⏳ Waiting for chunk ${idx}...`);
          }
        } catch (e) {
          console.log(`Error fetching chunk ${idx}:`, e.message);
        }
      }

      if (foundCount === 2) {
        console.log(`✅ Stream ${sessionId} ready!`);
        setStreamStatus("live");
        clearInterval(interval);
      }
    };

    // Get initial status
    warehouse.getStreamStatus(sessionId).then(setStreamStatus);

    // Start polling
    interval = setInterval(findInitialData, 3000);
    findInitialData();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sessionId, stream.createdAt]);

  // Add this effect to run the janitor periodically
  useEffect(() => {
    // Clean up expired streams every 5 minutes
    const janitorInterval = setInterval(
      () => {
        warehouse.clearOldSessions([sessionId]); // Keep current session
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(janitorInterval);
  }, [sessionId]);

  // 2. THE SUBSCRIPTION: Listens for any NEW chunks as they happen
  useSubscription(LIVESTREAM_CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    onData: async ({ data }) => {
      console.log(
        "📡 [LIVESTREAM-PREVIEW] FULL DATA:",
        JSON.stringify(data, null, 2),
      );

      const chunk = data.data?.livestreamChunkAdded;
      if (!chunk) return;
         if (chunk.rotation) {
           setRotation(chunk.rotation);
           console.log(`🎯 Rotation from subscription: ${chunk.rotation}°`);
         }

      console.log(
        `🔄 [Preview] Chunk ${chunk.chunkIndex} rotation: ${chunk.rotation}`,
      );


      // When a new chunk arrives, we go get it immediately
      try {
        const res = await fetch(
          `${API_BASE}/api/live-chunk/${sessionId}/${chunk.chunkIndex}`,
        );
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          await warehouse.saveChunk(
            sessionId,
            chunk.chunkIndex,
            new Uint8Array(bytes),
          );
          setAvailableInWarehouse((prev) => [
            ...new Set([...prev, chunk.chunkIndex]),
          ]);
        }
      } catch (e) {
        console.log("Sub fetch fail");
      }
    },
  });

  return (
    <View style={styles.streamContainer}>
      <View style={styles.infoOverlay}>
        <Text style={styles.streamTitle}>{stream.title}</Text>
        <View style={styles.liveBadge}>
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* We pass the availableInWarehouse array. 
         The Player needs to "watch" this array to start the engine.
      */}
      <NeighborhoodLiveStreamPlayer
        sessionId={sessionId}
        availableInWarehouse={availableInWarehouse}
        rotation={shouldRotate ? rotation : 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: "#130720" },
  fullPage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  streamContainer: {
    width: "100%",
    height: "100%",
  },
  title: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
  },
  goLive: {
    backgroundColor: "#ff375f",
    padding: 20,
    borderRadius: 15,
    marginTop: 40,
  },
  btnText: { color: "white", fontWeight: "bold" },
  picker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginVertical: 20,
    borderColor: "ff8000"
  },
  item: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#333",
    margin: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#00FFFF",
  },
  selected: {
    backgroundColor: "#ff375f",
    borderColor: "#ffffff",
    borderWidth: 3,
  },
});
