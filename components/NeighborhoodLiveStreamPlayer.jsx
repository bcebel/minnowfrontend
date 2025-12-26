import React, { useEffect, useRef, useState, useCallback } from "react";
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

    const client = window.globalWebTorrentClient;
    
    const newTorrent = client.add(magnetUri, (t) => {
      console.log(`[SwarmManager ${sessionId}] Torrent Ready. Peers: ${t.numPeers}`);
      setPeers(t.numPeers);
    });

    setTorrent(newTorrent);

    const onWire = () => setPeers(newTorrent.numPeers);
    newTorrent.on("wire", onWire);

    newTorrent.on("error", (err) => {
      if (!err.message.includes("duplicate torrent")) {
        console.error(`[SwarmManager ${sessionId}] Torrent Error:`, err.message);
      }
    });

    return () => {
      newTorrent.removeListener("wire", onWire);
      // We don't destroy the client here because it's global, 
      // but we clear local state.
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
  const [chunkBuffer, setChunkBuffer] = useState(new Map());
  const [nextExpectedIndex, setNextExpectedIndex] = useState(0);
  const [chunkLog, setChunkLog] = useState([]);

  // ---------- Helpers ----------
  const addLog = useCallback((message) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    setChunkLog((prev) => [...prev.slice(-10), `${timestamp}: ${message}`]);
    console.log(`[Player ${sessionId}] ${message}`);
  }, [sessionId]);

  // 🔥 PANIC LOGIC: Tell WebTorrent to prioritize the next chunk
  const triggerPriorityDownload = useCallback(() => {
    if (!torrent) return;
    addLog("🔥 Priority set: Swarm focusing on next chunk pieces.");
    // Select all pieces of the file with high priority (1)
    torrent.select(0, torrent.pieces.length - 1, 1);
    // Mark the very first pieces as "critical" for immediate playback
    torrent.criticalPieces = [0, 1, 2, 3, 4, 5];
  }, [torrent, addLog]);

  // ---------- Data Preparation ----------
  const sortedChunks = [...initialChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const magnetUri = sortedChunks[0]?.magnetLink;
  const { torrent, peers } = useTorrentSwarm(magnetUri, sessionId);

  // ============================================
  // 3. MEDIASOURCE & VIDEO ELEMENT SETUP
  // ============================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    addLog(`Setting up player`);

    function getMediaSourceConstructor() {
      if (self.ManagedMediaSource) return self.ManagedMediaSource;
      if (self.MediaSource) return self.MediaSource;
      throw new Error("No MediaSource API available.");
    }

    const MediaSourceConstructor = getMediaSourceConstructor();
    const mediaSource = new MediaSourceConstructor();
    mediaSourceRef.current = mediaSource;

    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.style.width = "100%";
    video.style.height = "auto";
    video.playsInline = true;

    const url = URL.createObjectURL(mediaSource);
    video.src = url;

    // Listeners
    video.onplaying = () => { addLog(`VIDEO PLAYING!`); setIsLoading(false); };
    video.onwaiting = () => { addLog(`Video buffering...`); setIsLoading(true); };
    video.onerror = (e) => setError(`Video Error ${e.target.error?.code}`);

    const container = document.getElementById(`video-container-${sessionId}`);
    if (container) {
      container.innerHTML = "";
      container.appendChild(video);
      videoRef.current = video;
    }

    const handleSourceOpen = () => {
      addLog(`MediaSource opened`);
      try {
        const mimeType = 'video/webm; codecs="vp8,opus"'; // Matches Recorder
        const sb = mediaSource.addSourceBuffer(mimeType);
        sourceBufferRef.current = sb;
        sb.mode = "sequence";

        sb.addEventListener("updateend", () => appendFromBuffer());
      } catch (e) {
        setError(`MSE Error: ${e.message}`);
      }
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);

    return () => {
      addLog(`Cleaning up session`);
      if (url) URL.revokeObjectURL(url);
      if (videoRef.current) videoRef.current.remove();
    };
  }, [sessionId, addLog]);

  // ============================================
  // 4. HEARTBEAT MONITOR (The "Panic" Trigger)
  // ============================================
  useEffect(() => {
    if (!videoRef.current || !sourceBufferRef.current) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const sb = sourceBufferRef.current;
      
      if (!video || !sb || sb.updating) return;

      const buffered = sb.buffered;
      if (buffered.length > 0) {
        const bufferEnd = buffered.end(buffered.length - 1);
        const secondsLeft = bufferEnd - video.currentTime;

        // Visual heartbeat in logs
        if (secondsLeft < 5 && !isLoading) {
          addLog(`🚨 LOW BUFFER: ${secondsLeft.toFixed(1)}s left. Panicking!`);
          triggerPriorityDownload();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoading, torrent, triggerPriorityDownload, addLog]);

  // ============================================
  // 5. SMART BUFFER & APPEND LOGIC
  // ============================================
  const appendFromBuffer = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || !torrent) return;

    const chunkToAppend = chunkBuffer.get(nextExpectedIndex);
    if (!chunkToAppend) {
      setIsLoading(true);
      return;
    }

    const file = torrent.files[0];
    if (!file) return;

    addLog(`▶️ Appending chunk #${nextExpectedIndex}`);
    file.getBuffer((err, buffer) => {
      if (err || !sb) return;
      try {
        sb.appendBuffer(buffer);
        setChunkBuffer((prev) => {
          const newMap = new Map(prev);
          newMap.delete(nextExpectedIndex);
          return newMap;
        });
        setNextExpectedIndex((prev) => prev + 1);
      } catch (e) {
        addLog(`Append error: ${e.message}`);
      }
    });
  }, [chunkBuffer, nextExpectedIndex, torrent, addLog]);

  useEffect(() => {
    if (sortedChunks.length > 0) {
      const newChunks = sortedChunks.filter(c => !chunkBuffer.has(c.chunkIndex) && c.chunkIndex >= nextExpectedIndex);
      if (newChunks.length > 0) {
        setChunkBuffer(prev => {
          const next = new Map(prev);
          newChunks.forEach(c => {
            next.set(c.chunkIndex, c);
            if (clearProcessedChunk) clearProcessedChunk(c.id);
          });
          return next;
        });
      }
    }
  }, [sortedChunks, clearProcessedChunk, chunkBuffer, nextExpectedIndex]);

  useEffect(() => {
    appendFromBuffer();
  }, [chunkBuffer, appendFromBuffer]);

  // ============================================
  // 6. RENDER
  // ============================================
  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffff" />
          <Text style={styles.loadingText}>
            {nextExpectedIndex === 0 ? "Connecting to Neighbors..." : "Buffering Swarm..."}
          </Text>
        </View>
      )}

      <View id={`video-container-${sessionId}`} style={styles.videoContainer} />

      <View style={styles.statsContainer}>
        <Text style={styles.chunkInfo}>Peers: {peers} | Next Needed: #{nextExpectedIndex}</Text>
        <View style={styles.debugContainer}>
          {chunkLog.map((log, i) => (
            <Text key={i} style={styles.debugText}>{log}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#111", borderRadius: 8, padding: 10 },
  loadingContainer: { position: "absolute", zIndex: 10, top: "30%", width: "100%", alignItems: "center" },
  loadingText: { color: "#00ffff", marginTop: 10, fontWeight: "bold" },
  videoContainer: { width: "100%", minHeight: 300, backgroundColor: "#000", borderRadius: 5 },
  statsContainer: { marginTop: 10, padding: 8, backgroundColor: "#222", borderRadius: 5 },
  chunkInfo: { color: "#0f0", fontSize: 12, fontFamily: "monospace", marginBottom: 5 },
  debugContainer: { backgroundColor: "#000", padding: 5, borderRadius: 3, maxHeight: 100 },
  debugText: { color: "#8af", fontSize: 10, fontFamily: "monospace" },
});
