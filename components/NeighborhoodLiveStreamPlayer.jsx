import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery } from "@apollo/client";

const GET_STREAM_CHUNKS = gql`
  query GetStreamChunks($sessionId: String!) {
    streamChunks(sessionId: $sessionId) {
      id
      chunkIndex
      magnetLink
      fileType
      mimeType
      sessionId
    }
  }
`;
// --- THE NON-REACT CONTROLLER ---

class StreamController {
  constructor(sessionId, setupMagnet, addLog, triggerFetch) {
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.setupMagnet = setupMagnet;

    // Simplified buffer config
    this.CHUNK_DURATION =5; // seconds per chunk (increased from 1)
    this.TARGET_BUFFER_DURATION = 10; // seconds total buffer
    this.BUFFER_CHUNKS = Math.ceil(
      this.TARGET_BUFFER_DURATION / this.CHUNK_DURATION
    ); // 2 chunks

    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // WebTorrent setup (keep minimal for iOS)
    if (!window.globalWebTorrentClient) {
      this.addLog("🧰 Creating Torrent Client...");
      window.globalWebTorrentClient = new window.WebTorrent({
        dht: !this.isIOS, // Disable DHT on iOS
        webSeeds: false,
        tracker: this.isIOS
          ? { maxConns: 1, rtcConfig: { iceServers: [] } }
          : {},
      });
    }
    this.client = window.globalWebTorrentClient;

    // Trackers - minimal set
    this.trackers = this.isIOS
      ? ["wss://tracker.openwebtorrent.com"]
      : ["wss://tracker.openwebtorrent.com", "wss://tracker.webtorrent.dev"];

    // Simplified state
    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();
    this.sb = null;
    this.detectedMimeType = null;
    this.headerLoaded = false;
    this.isProcessing = false;

    // NEW: Chunk queue based on time, not index
    this.chunkQueue = new Map(); // key: chunkIndex, value: {magnetLink, appendTime}
    this.lastCleanedTime = 0;
    this.currentPlaybackChunk = -1; // Which 5-second chunk are we in?

    // Video element
    this.video = document.createElement("video");
    this.video.disableRemotePlayback = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";
    this.video.setAttribute("webkit-playsinline", "true");

    // Video timeupdate listener for sync
    this.video.addEventListener("timeupdate", () => {
      this.syncBufferToPlayback();
    });

    // Attach MediaSource
    this.video.src = URL.createObjectURL(this.ms);

    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog("✅ MediaSource Open");
      this.tick();
    });

    // Watchdog - less frequent
    this.watchdog = setInterval(() => {
      if (!this.isProcessing) {
        this.triggerFetch();
      }
    }, 5000); // Every 5 seconds
  }

  // NEW: Sync everything to video playback time
  syncBufferToPlayback() {
    if (!this.video || !this.sb || this.sb.updating) return;

    const currentTime = this.video.currentTime || 0;
    const currentChunk = Math.floor(currentTime / this.CHUNK_DURATION);
    const buffered = this.video.buffered;

    for (let i = 0; i < buffered.length; i++) {
      if (
        currentTime < buffered.start(i) &&
        buffered.start(i) - currentTime < 0.5
      ) {
        this.addLog("🦘 Jumping small gap...");
        this.video.currentTime = buffered.start(i) + 0.1;
        break;
      }
    }
    // Update current playback chunk
    if (currentChunk !== this.currentPlaybackChunk) {
      this.currentPlaybackChunk = currentChunk;
      this.addLog(
        `▶️ Playing chunk ${currentChunk} (${currentTime.toFixed(1)}s)`
      );
    }

    // Clean up chunks we've already passed
    this.cleanupPastChunks(currentTime);

    // Trigger next chunk download if needed
    const bufferAhead = this.getBufferAhead(currentTime);
    if (bufferAhead < this.TARGET_BUFFER_DURATION / 2) {
      // Less than 5 seconds ahead
      this.triggerFetch();
    }
  }

  cleanupPastChunks(currentTime) {
    if (!this.sb || this.sb.updating || !this.sb.buffered.length) return;

    try {
      const removeEnd = Math.max(0, currentTime - 2); // Keep 2 seconds behind for safety

      if (removeEnd > 1 && !this.sb.updating) {
        this.sb.remove(0, removeEnd);
        this.isProcessing = true;
        this.addLog(`🧹 Cleaned 0-${removeEnd.toFixed(1)}s`);
      }
    } catch (e) {
      console.warn("Cleanup failed:", e);
    }
  }

  getBufferAhead(currentTime) {
    if (!this.sb || !this.sb.buffered.length) return 0;

    const end = this.sb.buffered.end(this.sb.buffered.length - 1);
    return Math.max(0, end - currentTime);
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      // Header chunk
      if (c.chunkIndex === -1 && !this.headerLoaded) {
        this.setupMagnet = c.magnetLink;
        this.detectedMimeType = c.mimeType;
        this.addLog("🎯 FOUND HEADER (-1)!");
      }

      // Regular chunks
      if (c.chunkIndex >= 0) {
        // Only keep upcoming chunks (within buffer window)
        const chunkStartTime = c.chunkIndex * this.CHUNK_DURATION;
        const chunkEndTime = chunkStartTime + this.CHUNK_DURATION;
        const currentTime = this.video.currentTime || 0;

        // If chunk is in the future or very recent past, keep it
        if (chunkEndTime > currentTime - 2) {
          this.chunkQueue.set(c.chunkIndex, {
            magnetLink: c.magnetLink,
            targetTime: chunkStartTime,
          });
        }
      }
    });

    // Trim chunk queue to only what we need
    this.trimChunkQueue();

    this.tick();
  }

  trimChunkQueue() {
    if (this.chunkQueue.size <= this.BUFFER_CHUNKS * 2) return; // Allow some extra

    const currentChunk = this.currentPlaybackChunk;
    const indices = Array.from(this.chunkQueue.keys()).sort((a, b) => a - b);

    // Keep only chunks that are current or future (and a small buffer)
    const chunksToDelete = indices.filter(
      (idx) =>
        idx < currentChunk - 1 || idx > currentChunk + this.BUFFER_CHUNKS + 2
    );

    chunksToDelete.forEach((idx) => this.chunkQueue.delete(idx));

    if (chunksToDelete.length > 0) {
      this.addLog(
        `✂️ Trimmed chunk queue: ${chunksToDelete.length} old chunks removed`
      );
    }
  }

  async tick() {
    if (this.isProcessing || this.ms.readyState !== "open") {
      return;
    }

    // STEP 1: Initialize SourceBuffer
    if (!this.sb && this.detectedMimeType) {
      try {
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.addLog("🛠️ SourceBuffer Created");

        this.sb.addEventListener("updateend", () => {
          this.addLog(`📦 SB updateend`);
          this.isProcessing = false;

          // Sync immediately after append
          setTimeout(() => {
            this.syncBufferToPlayback();
            this.tick();
          }, 50);
        });

        this.sb.addEventListener("error", (e) => {
          this.addLog(`❌ SourceBuffer error: ${e.message}`);
          this.isProcessing = false;
          setTimeout(() => this.tick(), 1000);
        });
      } catch (e) {
        this.addLog("❌ MSE Error: " + e.message);
        return;
      }
    }

    if (!this.sb || this.sb.updating) return;

    // STEP 2: Download Header
    if (this.setupMagnet && !this.headerLoaded) {
      this.isProcessing = true;
      try {
        this.addLog("📥 Downloading Header...");
        const buf = await this.download(this.setupMagnet);
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
        this.addLog("✅ Header Loaded");
      } catch (e) {
        this.addLog("❌ Header Failed: " + e.message);
        this.isProcessing = false;
        setTimeout(() => this.tick(), 1000);
      }
      return;
    }

    // STEP 3: Download and append next needed chunk
    if (this.headerLoaded) {
      const currentTime = this.video.currentTime || 0;
      const currentChunk = Math.floor(currentTime / this.CHUNK_DURATION);

      // Find the next chunk we need (closest to playback that we don't have in buffer)
      let targetChunk = null;
 
      const availableIndices = Array.from(this.chunkQueue.keys()).sort(
        (a, b) => a - b
      );
      for (let idx of availableIndices) {
        if (idx >= currentChunk) {
          targetChunk = idx;
          break;
        }
      }
     const bufferAhead = this.getBufferAhead(currentTime);
      // We need chunks that extend our buffer
      for (let offset = 0; offset <= this.BUFFER_CHUNKS; offset++) {
        const checkChunk = currentChunk + offset;
        const chunkStartTime = checkChunk * this.CHUNK_DURATION;

        // Check if we already have this time in buffer
        let hasBuffer = false;
        if (this.sb.buffered.length) {
          for (let i = 0; i < this.sb.buffered.length; i++) {
            const start = this.sb.buffered.start(i);
            const end = this.sb.buffered.end(i);
            if (chunkStartTime >= start && chunkStartTime < end) {
              hasBuffer = true;
              break;
            }
          }
        }
if (this.video.paused && this.video.buffered.length > 0) {
  this.video.play().catch((e) => console.log("Autoplay blocked:", e));
}
        // If we don't have buffer for this chunk and we have it in queue, download it
        if (!hasBuffer && this.chunkQueue.has(checkChunk)) {
          targetChunk = checkChunk;
          break;
        }
      }

      if (targetChunk !== null) {
        const chunkData = this.chunkQueue.get(targetChunk);
        this.isProcessing = true;

        try {
          this.addLog(
            `⬇️ Downloading chunk ${targetChunk} (${
              targetChunk * this.CHUNK_DURATION
            }s)...`
          );
          const buf = await this.download(chunkData.magnetLink);

          // Validate chunk
          const MIN_CHUNK_SIZE = 50 * 1024; // 50KB minimum for 5-second chunk
          if (!buf || buf.length < MIN_CHUNK_SIZE) {
            this.addLog(`⚠️ Chunk ${targetChunk} too small, skipping`);
            this.chunkQueue.delete(targetChunk);
            this.isProcessing = false;
            setTimeout(() => this.tick(), 100);
            return;
          }

          this.addLog(
            `✅ Downloaded chunk ${targetChunk}, ${(buf.length / 1024).toFixed(
              1
            )}KB`
          );
          this.sb.appendBuffer(buf);
          this.chunkQueue.delete(targetChunk);
        } catch (e) {
          this.addLog(`❌ Chunk ${targetChunk} Error: ${e.message}`);
          this.isProcessing = false;
          setTimeout(() => this.tick(), 1000);
        }
      } else if (bufferAhead < this.CHUNK_DURATION) {
        // Low buffer warning
        this.addLog(`⚠️ Low buffer: ${bufferAhead.toFixed(1)}s ahead`);
        this.triggerFetch();
      }
    }
  }

  download(magnet) {
    return new Promise((resolve, reject) => {
      const existing = this.client.get(magnet);
      if (existing) {
        if (existing.done) {
          return existing.files[0].getBuffer((err, buf) =>
            err ? reject(err) : resolve(buf)
          );
        }
        existing.on("done", () =>
          existing.files[0].getBuffer((err, buf) =>
            err ? reject(err) : resolve(buf)
          )
        );
        return;
      }

      const timeout = setTimeout(
        () => {
          reject(new Error("Download timeout"));
          this.client.remove(magnet);
        },
        this.isIOS ? 15000 : 30000
      );

      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
torrent.on("done", () => {
  torrent.files[0].getBuffer((err, buf) => {
    if (err) reject(err);
    else {
      resolve(buf);
      // CRITICAL: Remove IMMEDIATELY after use
      setTimeout(() => {
        try {
          this.client.remove(torrent.infoHash);
        } catch (e) {}
      }, 100); // 100ms delay
    }
  });
});
        torrent.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    });
  }

  destroy() {
    clearInterval(this.watchdog);

    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.load();
      this.video.remove();
    }

    this.addLog("🛑 Stream controller destroyed");
  }
}

// --- THE REACT WRAPPER ---
// --- THE UPDATED REACT WRAPPER ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  setupMagnet,
  initialChunks = [],
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);

  const { data, refetch } = useQuery(GET_STREAM_CHUNKS, {
    variables: { sessionId },
    notifyOnNetworkStatusChange: true,
  });

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  // 1. MANUAL INITIALIZATION (The iPhone Way)
  const handleJoinStream = () => {
    addLog("🚀 Manual Join Triggered...");

    // Create controller with null for setupMagnet (it will find it in chunks)
    const controller = new StreamController(sessionId, null, addLog, () =>
      refetch()
    );

    controllerRef.current = controller;
    window.controller = controller;

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    setIsJoined(true);

    // Immediately feed whatever chunks we already have in the 'data' tray
    if (data?.streamChunks) {
      controller.addChunks(data.streamChunks);
    }
  };

  // 2. DATA HAND-OFF
  useEffect(() => {
    // Only feed the engine if the user has joined and we actually have message data
    if (isJoined && controllerRef.current && data?.streamChunks) {
      addLog(`📡 Syncing Tray: ${data.streamChunks.length} segments available`);

      // We send ONLY the message chunks here.
      // The header was already handled in handleJoinStream via 'setupMagnet'
      controllerRef.current.addChunks(data.streamChunks);
    }
  }, [isJoined, data?.streamChunks]); // Watch specifically for the chunks array changing

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          position: "relative",
          backgroundColor: "#000",
          aspectRatio: "16/9",
          overflow: "hidden",
          display: isJoined ? "block" : "none", // Hide until joined
        }}
      />

      {!isJoined && (
        <TouchableOpacity
          onPress={handleJoinStream}
          style={styles.bigJoinButton}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "bold" }}>
            🔴 JOIN LIVE STREAM
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.logBox}>
        {logs.map((log, i) => (
          <Text key={i} style={styles.logText}>
            {log}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9, // Ensure the container has a defined shape
    backgroundColor: "#111",
    overflow: "hidden",
  },
  bigJoinButton: {
    backgroundColor: "#ff4444",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    margin: 20,
  },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
