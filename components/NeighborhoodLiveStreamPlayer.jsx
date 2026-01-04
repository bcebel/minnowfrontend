import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from "react-native";


// --- THE NON-REACT CONTROLLER ---

class StreamController {
  constructor(sessionId, setupMagnet, addLog, triggerFetch) {
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.setupMagnet = setupMagnet;

    // Simplified buffer config
    this.CHUNK_DURATION = 8; // seconds per chunk (increased from 1)
    this.TARGET_BUFFER_DURATION = 20; // seconds total buffer
    this.BUFFER_CHUNKS = Math.ceil(
      this.TARGET_BUFFER_DURATION / this.CHUNK_DURATION
    ); // 2 chunks

    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // WebTorrent setup (keep minimal for iOS)
    if (!window.globalWebTorrentClient) {
      this.addLog("🧰 Creating Torrent Client...");
      window.globalWebTorrentClient = new window.WebTorrent({
        dht: false, // Force false for both
        lsd: false, // Local Service Discovery (useless on mobile)
        tracker: {
          rtcConfig: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          },
        },
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
    if (this.ms.onbufferedchange !== undefined) {
      this.ms.addEventListener("bufferedchange", () => {
        this.addLog("📱 iOS managed buffer update");
        // If iOS deleted something we need, we might need to re-fetch
      });
    }

    // Video timeupdate listener for sync
    this.video.addEventListener("timeupdate", () => {
      const buffered = this.video.buffered;
      const curr = this.video.currentTime;

      for (let i = 0; i < buffered.length; i++) {
        // If there is a gap within 0.3 seconds of current time
        if (curr < buffered.start(i) && buffered.start(i) - curr < 0.3) {
          this.addLog("🦘 Nudging past gap...");
          this.video.currentTime = buffered.start(i) + 0.1;
        }
      }
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
        this.detectedMimeType =
          c.fileType ||
          c.mimeType ||
          'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';

        this.addLog(`🎯 Header Found. Mime: ${this.detectedMimeType}`);
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
    const currentChunk = this.currentPlaybackChunk;
    const indices = Array.from(this.chunkQueue.keys()).sort((a, b) => a - b);

    // MAX_AHEAD: Don't keep more than 5 chunks (approx 30-40s) ahead of playhead
    // MAX_BEHIND: Keep 0-1 chunks behind for slight rewinds/stability
    const MAX_AHEAD = 5;
    const MAX_BEHIND = 1;

    indices.forEach((idx) => {
      if (idx < currentChunk - MAX_BEHIND || idx > currentChunk + MAX_AHEAD) {
        const chunk = this.chunkQueue.get(idx);

        // Explicitly nullify the data before deleting for Garbage Collection
        if (chunk) {
          chunk.magnetLink = null;
          chunk.data = null;
        }
        this.chunkQueue.delete(idx);
      }
    });

    if (indices.length > MAX_AHEAD + MAX_BEHIND + 2) {
      this.addLog(
        `🧹 Memory Purge: Kept window [${currentChunk - MAX_BEHIND} to ${
          currentChunk + MAX_AHEAD
        }]`
      );
    }
  }

  async tick() {
    const currentTime = this.video.currentTime || 0;

    // 1. Safety Checks
    if (this.isProcessing || this.ms.readyState !== "open") return;

    // 2. Initialize SourceBuffer if needed
    if (!this.sb && this.detectedMimeType) {
      try {
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.addLog("🛠️ SourceBuffer Created");
        this.sb.addEventListener("updateend", () => {
          this.isProcessing = false;
          this.tick();
        });
      } catch (e) {
        this.addLog("❌ MSE Error: " + e.message);
        return;
      }
    }

    if (!this.sb || this.sb.updating) return;

    // 3. PRIORITY: The Header (-1)
    if (!this.headerLoaded) {
      this.isProcessing = true;
      try {
        this.addLog("📥 Fetching Header (-1)...");
        const buf = await this.download(this.setupMagnet, -1);
        if (buf) {
          this.sb.appendBuffer(buf);
          this.headerLoaded = true;
          this.addLog("✅ Header Loaded");
          this.video
            .play()
            .catch(() =>
              this.addLog("Waiting for user interaction to play...")
            );
        } else {
          this.isProcessing = false;
        }
      } catch (e) {
        this.isProcessing = false;
        setTimeout(() => this.tick(), 1000);
      }
      return;
    }

    // 4. NEXT: Regular Chunks
    const currentChunk = Math.floor(currentTime / this.CHUNK_DURATION);
    const bufferAhead = this.getBufferAhead(currentTime);

    if (bufferAhead < 10) {
      // Find the next chunk we need that we haven't already buffered
      const targetChunk =
        currentChunk + Math.floor(bufferAhead / this.CHUNK_DURATION) + 1;

      if (this.chunkQueue.has(targetChunk)) {
        const chunkData = this.chunkQueue.get(targetChunk);
        this.isProcessing = true;
        try {
          const buf = await this.download(chunkData.magnetLink, targetChunk);
          if (buf) {
            this.addLog(`🎬 Appending Chunk ${targetChunk}`);
            this.sb.appendBuffer(buf);
          } else {
            this.isProcessing = false;
          }
        } catch (e) {
          this.isProcessing = false;
        }
      }
    }
  }

  async download(magnet, index) {
    // 1. Check Warehouse First
    const cached = await warehouse.getChunk(index);
    if (cached) {
      // this.addLog(`📦 Found Chunk ${index} in Warehouse`);
      return cached;
    }

    // 2. If not in Warehouse, go to WebTorrent
    return new Promise((resolve, reject) => {
      if (!magnet) return resolve(null);

      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
        torrent.once("done", () => {
          torrent.files[0].getBuffer(async (err, buf) => {
            if (err) {
              this.client.remove(torrent.infoHash);
              reject(err);
            } else {
              // 3. Save to Warehouse so the rest of the app sees it!
              await warehouse.saveChunk(index, buf);
              this.client.remove(torrent.infoHash); // Free RAM
              resolve(buf);
            }
          });
        });
      });
    });
  }

  destroy() {
    clearInterval(this.watchdog);

    if (this.video) {
      this.video.pause();
      // CRITICAL: Revoke the Object URL to free up the memory
      if (this.video.src) {
        URL.revokeObjectURL(this.video.src);
      }
      this.video.src = "";
      this.video.load();
      this.video.remove();
    }

    // Clear the WebTorrent client's internal memory
    if (this.client) {
      this.client.torrents.forEach((t) => this.client.remove(t.infoHash));
    }

    this.addLog("🛑 Total Memory Cleanup Complete");
  }
}

// --- THE REACT WRAPPER ---
// --- THE UPDATED REACT WRAPPER ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [], // The "Boss" sends this list to us
}) {
  const videoRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const [nextIndexToPlay, setNextIndexToPlay] = useState(-1); // Start with header
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };



  // --- THE ONLY DATA HAND-OFF YOU NEED ---
  // When 'initialChunks' changes (because the Subscription in the Parent fired),
  // this effect automatically runs and feeds the new chunks to the engine.
  useEffect(() => {
    if (isJoined && controllerRef.current && initialChunks.length > 0) {
      addLog(`📡 Received ${initialChunks.length} chunks from Parent`);
      controllerRef.current.addChunks(initialChunks);
    }
  }, [isJoined, initialChunks]); // This "watches" the Boss's instructions

  const handleJoinStream = () => {
    addLog("🚀 Manual Join Triggered...");

    // Initialize the engine
    const controller = new StreamController(sessionId, null, addLog, () => {
      // This was triggerFetch - we don't need it if Subscriptions are working!
      console.log("Engine requested more data...");
    });

    controllerRef.current = controller;

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    setIsJoined(true);

    // Feed any chunks we already had sitting in the tray when we clicked Join
    if (initialChunks.length > 0) {
      controller.addChunks(initialChunks);
    }
  };

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
          display: isJoined ? "block" : "none",
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
