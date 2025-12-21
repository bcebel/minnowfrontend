// NeighborhoodLiveStreamPlayer.jsx - CONSOLIDATED & FIXED VERSION
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";

// Custom Hook: Manages a single torrent instance for the session
function useTorrentSwarm(magnetUri, sessionId) {
  const [torrent, setTorrent] = useState(null);
  const [peers, setPeers] = useState(0);
  const torrentRef = useRef(null);

  useEffect(() => {
    if (!magnetUri || !window.globalWebTorrentClient) return;

    console.log(`[SwarmManager ${sessionId}] Managing torrent`);

    const client = window.globalWebTorrentClient;

    // Add the torrent. WebTorrent returns existing instance for duplicate magnet links.
    const newTorrent = client.add(magnetUri, (torrent) => {
      console.log(
        `[SwarmManager ${sessionId}] Ready. Peers: ${torrent.numPeers}`
      );
      setPeers(torrent.numPeers);
    });

    torrentRef.current = newTorrent;
    setTorrent(newTorrent);

    // Monitor peer connections
    newTorrent.on("wire", (peer) => {
      console.log(`[SwarmManager ${sessionId}] Peer connected: ${peer.addr}`);
      setPeers(newTorrent.numPeers);
    });

    newTorrent.on("error", (err) => {
      // Silently ignore "duplicate torrent" errors, they are expected
      if (!err.message.includes("duplicate torrent")) {
        console.error(
          `[SwarmManager ${sessionId}] Torrent Error:`,
          err.message
        );
      }
    });

    // Cleanup: Release reference only. Let global client manage torrent lifecycle.
    return () => {
      console.log(`[SwarmManager ${sessionId}] Releasing reference.`);
      torrentRef.current = null;
      setTorrent(null);
    };
  }, [magnetUri, sessionId]);

  return { torrent, peers };
}

// Main Player Component
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  clearProcessedChunk,
}) {
  // Refs and State
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processedChunks, setProcessedChunks] = useState(new Set());
  const [chunkLog, setChunkLog] = useState([]);

  // Helper: Add to debug log
  const addLog = (message) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    setChunkLog((prev) => [...prev.slice(-10), `${timestamp}: ${message}`]); // Keep last 10 logs
    console.log(`[Player ${sessionId}] ${message}`);
  };

  // Data Prep
  const sortedChunks = [...initialChunks].sort(
    (a, b) => a.chunkIndex - b.chunkIndex
  );
  const magnetUri = sortedChunks[0]?.magnetLink; // Magnet link from first chunk

  // Swarm Management via Custom Hook
  const { torrent, peers } = useTorrentSwarm(magnetUri, sessionId);

  // 1. CORE SETUP: MediaSource & Video Element
  useEffect(() => {
    if (typeof window === "undefined") return; // Don't run on server

    addLog(`Setting up player`);

    // Cleanup any existing video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();
      videoRef.current.remove();
      videoRef.current = null;
    }

    // Get MediaSource Constructor (Managed for iOS, Standard for others)
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

    // Create MediaSource Instance
    const MediaSourceConstructor = getMediaSourceConstructor();
    const mediaSource = new MediaSourceConstructor();
    mediaSourceRef.current = mediaSource;

    // Create Video Element
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.muted = true; // REQUIRED for autoplay
    video.style.width = "100%";
    video.style.height = "auto";
    video.playsInline = true;
    video.preload = "auto";

    // Set video source to the MediaSource
    const url = URL.createObjectURL(mediaSource);
    video.src = url;

    // --- Video Event Listeners ---
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

    // Add Video to DOM
    const container = document.getElementById(`video-container-${sessionId}`);
    if (container) {
      container.innerHTML = "";
      container.appendChild(video);
      videoRef.current = video;
    }

    // --- MediaSource Event: sourceopen ---
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
        sourceBuffer.mode = "sequence"; // IMPORTANT for live streaming

        sourceBuffer.addEventListener("updateend", () => {
          addLog(`SourceBuffer update ended`);
          // Process next chunk after the current one finishes appending
          processNextChunk();
        });

        sourceBuffer.addEventListener("error", (e) => {
          addLog(`SourceBuffer error: ${e.message}`);
        });

        // Start processing if chunks are already available
        if (sortedChunks.length > 0) {
          addLog(`Starting with ${sortedChunks.length} chunks`);
          processNextChunk();
        }
      } catch (e) {
        addLog(`Failed to setup SourceBuffer: ${e.message}`);
        setError(`Failed to setup video: ${e.message}`);
      }
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);

    // --- COMPREHENSIVE CLEANUP FUNCTION ---
    return () => {
      addLog(`Performing comprehensive cleanup`);
      setIsLoading(true);

      // 1. Clean up SourceBuffer listeners
      if (sourceBufferRef.current) {
        sourceBufferRef.current.removeEventListener(
          "updateend",
          handleSourceOpen
        );
        sourceBufferRef.current = null;
      }

      // 2. Clean up MediaSource
      if (mediaSourceRef.current) {
        mediaSourceRef.current.removeEventListener(
          "sourceopen",
          handleSourceOpen
        );
        mediaSourceRef.current = null;
      }

      // 3. Clean up Video Element
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load(); // Important for iOS
        videoRef.current.remove();
        videoRef.current = null;
      }

      // 4. Revoke Object URL
      if (url) URL.revokeObjectURL(url);

      // 5. Clear processed chunks for this session
      setProcessedChunks(new Set());
    };
  }, [sessionId]); // Only re-run if sessionId changes

  // 2. PROCESS CHUNKS (Uses torrent from hook)
  const processNextChunk = () => {
    // Guard: Ensure SourceBuffer is ready and not busy
    if (!sourceBufferRef.current || sourceBufferRef.current.updating) {
      return;
    }

    // Guard: Ensure the torrent from the hook is ready
    if (!torrent) {
      addLog(`Waiting for torrent to be ready from swarm...`);
      return;
    }

    // Find the next chunk that hasn't been processed
    const nextChunk = sortedChunks.find(
      (chunk) =>
        !processedChunks.has(chunk.id) &&
        chunk.chunkIndex === processedChunks.size // Process in order (0,1,2...)
    );

    if (!nextChunk) {
      addLog(`No chunks ready to process. Waiting...`);
      // Still loading if we haven't processed any yet
      setIsLoading(processedChunks.size === 0);
      return;
    }

    addLog(`Processing chunk ${nextChunk.chunkIndex}`);

    // Get the file from the torrent (managed by the hook)
    const file = torrent.files[0];
    if (!file) {
      addLog(`ERROR: No file in torrent.`);
      return;
    }

    // Get the chunk's buffer from the torrent
    file.getBuffer((err, buffer) => {
      if (err) {
        addLog(`ERROR getting buffer: ${err.message}`);
        return;
      }

      addLog(
        `Got buffer for chunk ${nextChunk.chunkIndex}, size: ${buffer.byteLength}`
      );

      try {
        // Append buffer to SourceBuffer
        sourceBufferRef.current.appendBuffer(buffer);
        addLog(`Appended chunk ${nextChunk.chunkIndex} to SourceBuffer`);

        // Mark chunk as processed locally
        setProcessedChunks((prev) => new Set(prev).add(nextChunk.id));

        // Notify parent component (LivestreamScreen) to clear this chunk from its state
        if (clearProcessedChunk) {
          clearProcessedChunk(nextChunk.id);
        }
      } catch (e) {
        addLog(`Failed to append buffer: ${e.message}`);
      }
    });
  };

  // 3. TRIGGER PROCESSING WHEN NEW CHUNKS ARRIVE
  useEffect(() => {
    if (sortedChunks.length > 0 && sourceBufferRef.current) {
      addLog(`New chunks arrived, triggering process.`);
      // processNextChunk will be called from the SourceBuffer 'updateend' event
      // This ensures sequential, non-overlapping appends.
      processNextChunk();
    }
  }, [sortedChunks.length]);

  // 4. RENDER
  return (
    <View style={styles.container}>
      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffff" />
          <Text style={styles.loadingText}>
            {processedChunks.size === 0
              ? "Loading first chunk..."
              : "Buffering..."}
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
          Chunks: {processedChunks.size}/{sortedChunks.length}
        </Text>
        <Text style={peers > 0 ? styles.peerInfoGood : styles.peerInfoBad}>
          Peers in Swarm: {peers}
        </Text>
        {sortedChunks.length > 0 && (
          <Text style={styles.chunkInfo}>
            Next: #
            {sortedChunks.find((c) => !processedChunks.has(c.id))?.chunkIndex ||
              "--"}
          </Text>
        )}
      </View>

      {/* Debug Log (Collapsible in future) */}
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

// ========== STYLES ==========
const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
    marginBottom: 15, // Increased spacing
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
    color: "#ff9900", // Amber warning color
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
    overflow: "hidden", // Keves the video corners rounded
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
    color: "#0f0", // Green
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  peerInfoGood: {
    color: "#0f0", // Green
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "bold",
    marginTop: 4,
  },
  peerInfoBad: {
    color: "#f44", // Red
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
    color: "#ff0", // Yellow
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 3,
    fontWeight: "bold",
  },
  debugText: {
    color: "#8af", // Light blue
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 14,
  },
});
