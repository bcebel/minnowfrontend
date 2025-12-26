// NeighborhoodLiveStreamPlayer.jsx - FINAL CONSOLIDATED VERSION
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";

// ============================================
// 1. CUSTOM HOOK: SINGLE TORRENT MANAGER
// ============================================
function useTorrentSwarm(magnetUri, sessionId) {
  const [torrent, setTorrent] = useState(null);
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    if (!magnetUri || !window.globalWebTorrentClient) return;

    console.log(`[SwarmManager ${sessionId}] Managing torrent`);

    const client = window.globalWebTorrentClient;
    // 'add' returns the existing torrent if it's a duplicate
    const newTorrent = client.add(magnetUri, (torrent) => {
      console.log(
        `[SwarmManager ${sessionId}] Ready. Peers: ${torrent.numPeers}`
      );
      setPeers(torrent.numPeers);
    });

    setTorrent(newTorrent);

    newTorrent.on("wire", (peer) => {
      console.log(`[SwarmManager ${sessionId}] Peer connected: ${peer.addr}`);
      setPeers(newTorrent.numPeers);
    });

    newTorrent.on("error", (err) => {
      // Ignore expected "duplicate torrent" errors
      if (!err.message.includes("duplicate torrent")) {
        console.error(`[SwarmManager ${sessionId}] Error:`, err.message);
      }
    });

    return () => {
      console.log(`[SwarmManager ${sessionId}] Releasing reference.`);
      setTorrent(null);
    };
  }, [magnetUri, sessionId]);

  return { torrent, peers };
}

// ============================================
// 2. MAIN PLAYER COMPONENT
// ============================================
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  clearProcessedChunk,
}) {
  // ---------- Refs ----------
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);

  // ---------- State ----------
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // SMART BUFFER: Map<chunkIndex, chunkData>
  const [chunkBuffer, setChunkBuffer] = useState(new Map());
  const [nextExpectedIndex, setNextExpectedIndex] = useState(0);
  const [chunkLog, setChunkLog] = useState([]);

  // ---------- Helpers ----------
  const addLog = (message) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    setChunkLog((prev) => [...prev.slice(-10), `${timestamp}: ${message}`]);
    console.log(`[Player ${sessionId}] ${message}`);
  };

  // Add this to your startLivePlayback loop
const startHeartbeat = (video, sourceBuffer) => {
  setInterval(() => {
    if (!sourceBuffer || sourceBuffer.updating) return;

    const currentPlayTime = video.currentTime;
    const buffered = sourceBuffer.buffered;
    
    if (buffered.length > 0) {
      const bufferEnd = buffered.end(buffered.length - 1);
      const secondsLeft = bufferEnd - currentPlayTime;

      console.log(`💓 Heartbeat: ${secondsLeft.toFixed(2)}s of video remaining in buffer`);

      // If we have less than 5 seconds left, "Panic"
      if (secondsLeft < 5) {
        this.triggerPriorityDownload(); // Tell WebTorrent to ignore everything else
      }
    }
  }, 2000); // Check every 2 seconds
};

  // ---------- Data Preparation ----------
  const sortedChunks = [...initialChunks].sort(
    (a, b) => a.chunkIndex - b.chunkIndex
  );
  const magnetUri = sortedChunks[0]?.magnetLink;

  // ---------- Swarm Management ----------
  const { torrent, peers } = useTorrentSwarm(magnetUri, sessionId);

  // ============================================
  // 3. MEDIASOURCE & VIDEO ELEMENT SETUP
  // ============================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    addLog(`Setting up player`);

    // ----- Cleanup previous session -----
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();
      videoRef.current.remove();
      videoRef.current = null;
    }

    // ----- Get Correct MediaSource Constructor -----
    function getMediaSourceConstructor() {
      if (self.ManagedMediaSource) {
        addLog("Using ManagedMediaSource API (iOS)");
        return self.ManagedMediaSource;
      }
      if (self.MediaSource) {
        addLog("Using standard MediaSource API");
        return self.MediaSource;
      }
      throw new Error("No MediaSource API is available.");
    }

    const MediaSourceConstructor = getMediaSourceConstructor();
    const mediaSource = new MediaSourceConstructor();
    mediaSourceRef.current = mediaSource;

    // ----- Create Video Element -----
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.style.width = "100%";
    video.style.height = "auto";
    video.playsInline = true;
    video.preload = "auto";

    const url = URL.createObjectURL(mediaSource);
    video.src = url;

    // ----- Video Event Listeners -----
    video.addEventListener("playing", () => {
      addLog(`VIDEO IS PLAYING!`);
      setIsLoading(false);
    });
    video.addEventListener("canplay", () => {
      addLog(`Video can play`);
      video.play().catch((e) => addLog(`Autoplay failed: ${e.message}`));
    });
    video.addEventListener("error", (e) => {
      addLog(`Video error: ${e.target.error?.code || "Unknown"}`);
      setError(`Video Error ${e.target.error?.code}`);
    });
    video.addEventListener("waiting", () => addLog(`Video waiting for data`));

    // ----- Add to DOM -----
    const container = document.getElementById(`video-container-${sessionId}`);
    if (container) {
      container.innerHTML = "";
      container.appendChild(video);
      videoRef.current = video;
    }

    // ----- MediaSource Event: sourceopen -----
    const handleSourceOpen = () => {
      addLog(`MediaSource opened`);
      try {
        // Try different MIME types for compatibility
        const mimeTypes = [
          'video/webm; codecs="vp8,opus"',
          'video/webm; codecs="vp9,opus"',
          'video/webm; codecs="vp8,vorbis"',
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        ];

        let sourceBuffer = null;
        for (const mimeType of mimeTypes) {
          try {
            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            addLog(`Created SourceBuffer with ${mimeType}`);
            break;
          } catch (e) {
            addLog(`Failed with ${mimeType}: ${e.message}`);
          }
        }

        if (!sourceBuffer) {
          setError("Browser does not support required video format.");
          return;
        }

        sourceBufferRef.current = sourceBuffer;
        sourceBuffer.mode = "sequence";

        // CRITICAL: When one chunk finishes appending, try to add the next one.
        sourceBuffer.addEventListener("updateend", () => {
          addLog(`SourceBuffer update ended`);
          appendFromBuffer(); // <-- SMART BUFFER LOGIC
        });

        sourceBuffer.addEventListener("error", (e) => {
          addLog(`SourceBuffer error: ${e.message}`);
        });

        // Start processing if chunks are available
        if (sortedChunks.length > 0) {
          addLog(`Starting with ${sortedChunks.length} chunks`);
          bufferAvailableChunks();
        }
      } catch (e) {
        addLog(`Failed to setup SourceBuffer: ${e.message}`);
        setError(`Failed to setup video: ${e.message}`);
      }
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);

    // ----- COMPREHENSIVE CLEANUP -----
    return () => {
      addLog(`Performing comprehensive cleanup`);
      setIsLoading(true);
      setChunkBuffer(new Map());
      setNextExpectedIndex(0);

      if (sourceBufferRef.current) {
        sourceBufferRef.current.removeEventListener(
          "updateend",
          handleSourceOpen
        );
        sourceBufferRef.current = null;
      }
      if (mediaSourceRef.current) {
        mediaSourceRef.current.removeEventListener(
          "sourceopen",
          handleSourceOpen
        );
        mediaSourceRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load();
        videoRef.current.remove();
        videoRef.current = null;
      }
      if (url) URL.revokeObjectURL(url);
    };
  }, [sessionId]);

  // ============================================
  // 4. SMART BUFFER LOGIC (CORE)
  // ============================================
  // A. Store any newly arrived chunks into the buffer Map
  const bufferAvailableChunks = () => {
    if (!torrent) {
      addLog(`Waiting for torrent...`);
      return;
    }

    const unprocessedChunks = sortedChunks.filter(
      (chunk) => !chunkBuffer.has(chunk.chunkIndex)
    );

    if (unprocessedChunks.length === 0) {
      // If buffer is empty and we expect index 0, we are still loading.
      setIsLoading(nextExpectedIndex === 0);
      return;
    }

    unprocessedChunks.forEach((chunk) => {
      addLog(`📦 Buffering chunk ${chunk.chunkIndex}`);
      // Add chunk to the Map
      setChunkBuffer((prev) => new Map(prev).set(chunk.chunkIndex, chunk));
      // Notify parent component
      if (clearProcessedChunk) {
        clearProcessedChunk(chunk.id);
      }
    });

    // After buffering new chunks, try to append the next one in sequence
    appendFromBuffer();
  };

  // B. Append the next expected chunk from the buffer to the SourceBuffer
  const appendFromBuffer = () => {
    // Guard: Ensure SourceBuffer is ready and not busy
    if (!sourceBufferRef.current || sourceBufferRef.current.updating) {
      return;
    }
    // Guard: Ensure torrent is ready
    if (!torrent) {
      return;
    }

    // 1. Check if the chunk we need next is in the buffer
    const chunkToAppend = chunkBuffer.get(nextExpectedIndex);
    if (!chunkToAppend) {
      addLog(
        `⏳ Waiting for chunk #${nextExpectedIndex} to arrive in buffer...`
      );
      setIsLoading(true);
      return;
    }

    // 2. Get the file buffer from WebTorrent
    const file = torrent.files[0];
    if (!file) {
      addLog(`ERROR: No file in torrent.`);
      return;
    }

    addLog(`▶️ Appending buffered chunk #${nextExpectedIndex}`);
    file.getBuffer((err, buffer) => {
      if (err) {
        addLog(`ERROR getting buffer: ${err.message}`);
        return;
      }

      try {
        // 3. Append to SourceBuffer (triggers 'updateend' when done)
        sourceBufferRef.current.appendBuffer(buffer);

        // 4. Update state: Remove from buffer, move expected index forward
        setChunkBuffer((prev) => {
          const newBuffer = new Map(prev);
          newBuffer.delete(nextExpectedIndex);
          return newBuffer;
        });
        setNextExpectedIndex((prev) => prev + 1);
      } catch (e) {
        addLog(`Failed to append buffer: ${e.message}`);
      }
    });
  };

  // ============================================
  // 5. TRIGGER: When new chunks arrive from parent/subscription
  // ============================================
  useEffect(() => {
    if (sortedChunks.length > 0 && sourceBufferRef.current) {
      addLog(`New chunks data arrived from GraphQL.`);
      bufferAvailableChunks();
    }
  }, [sortedChunks.length]); // Runs when chunk count changes

  // ============================================
  // 6. RENDER
  // ============================================
  return (
    <View style={styles.container}>
      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffff" />
          <Text style={styles.loadingText}>
            {nextExpectedIndex === 0 ? "Connecting..." : "Buffering..."}
          </Text>
          {peers === 0 && (
            <Text style={styles.peerWarning}>
              (Connected to 0 peers. Waiting for broadcaster...)
            </Text>
          )}
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Video Container (with iOS hack) */}
      <View
        id={`video-container-${sessionId}`}
        style={[
          styles.videoContainer,
          // iOS-specific rendering hack
          Platform.OS === "web" && /iPhone|iPad|iPod/.test(navigator.userAgent)
            ? styles.iOSVideoContainerHack
            : null,
        ]}
      />

      {/* Stats Panel */}
      <View style={styles.statsContainer}>
        <Text style={styles.sessionId}>Session: {sessionId}</Text>
        <Text style={styles.chunkInfo}>
          Chunks Ready: {chunkBuffer.size} / {sortedChunks.length}
        </Text>
        <Text style={peers > 0 ? styles.peerInfoGood : styles.peerInfoBad}>
          Peers in Swarm: {peers}
        </Text>
        <Text style={styles.chunkInfo}>Next Needed: #{nextExpectedIndex}</Text>
      </View>

      {/* Debug Log */}
      {chunkLog.length > 0 && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Player Log:</Text>
          {chunkLog.map((log, i) => (
            <Text key={i} style={styles.debugText} numberOfLines={1}>
              {log}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================
// 7. STYLES
// ============================================
const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  loadingContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 5,
    marginBottom: 10,
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 14,
  },
  peerWarning: {
    color: "#ff9900",
    fontSize: 12,
    marginTop: 5,
    fontStyle: "italic",
  },
  errorContainer: {
    backgroundColor: "#cc0000",
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
  },
  errorText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
  },
  videoContainer: {
    width: "100%",
    minHeight: 300,
    backgroundColor: "#000",
    borderRadius: 5,
    overflow: "hidden",
  },
  // The iOS rendering hack
  iOSVideoContainerHack: {
    borderWidth: 1,
    borderColor: "transparent",
  },
  statsContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#222",
    borderRadius: 5,
  },
  sessionId: {
    color: "#aaa",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 2,
  },
  chunkInfo: {
    color: "#0f0",
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  peerInfoGood: {
    color: "#0f0",
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "bold",
    marginTop: 4,
  },
  peerInfoBad: {
    color: "#f44",
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "bold",
    marginTop: 4,
  },
  debugContainer: {
    marginTop: 10,
    padding: 6,
    backgroundColor: "#000",
    borderRadius: 4,
    maxHeight: 120,
  },
  debugTitle: {
    color: "#ff0",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 3,
    fontWeight: "bold",
  },
  debugText: {
    color: "#8af",
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 14,
  },
});
