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
    this.setupMagnet = setupMagnet; // Might be null initially

    // 1. Setup WebTorrent
    if (!window.globalWebTorrentClient) {
      this.addLog("🧰 Creating Torrent Client...");
      window.globalWebTorrentClient = new window.WebTorrent();
    }
    this.client = window.globalWebTorrentClient;

    // 2. Select Media Engine
    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();
    this.sb = null;

    this.detectedMimeType = null;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.streamingAllowed = true;
    this.nextIndex = 0;
    this.chunkBuffer = new Map();
    this.maxBufferSize = 20;
    this.cleanupThreshold = this.isIOS ? 30 : 50;
    this.lastMemoryWarning = 0;
    this.bufferStartTimes = new Map();

    this.trackers = this.isIOS
      ? ["wss://tracker.openwebtorrent.com"] // Only ONE WebSocket tracker
      : ["wss://tracker.openwebtorrent.com", "wss://tracker.webtorrent.dev"];

    // 3. Create Video Element
    this.video = document.createElement("video");
    this.video.disableRemotePlayback = true;
    this.video.playsInline = true;
    this.video.muted = true; // High chance of autoplay success if muted
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";
    this.video.setAttribute("webkit-playsinline", "true");

    // 4. Attach MediaSource
    this.video.src = URL.createObjectURL(this.ms);

    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog("✅ MediaSource Open");
      this.tick();
    });

    // 5. Watchdog for background fetching
    this.watchdog = setInterval(() => {
      if (!this.isProcessing) {
        this.triggerFetch();
        this.tick(); // Keep checking if we can process
      }
    }, 3000);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.addLog("📱 App backgrounded - aggressive cleanup");
        this.emergencyCleanup();
      }
    });
  }
  emergencyCleanup() {
    // For iOS: Drastic cleanup when memory pressure is suspected
    if (!this.sb || this.sb.updating) return;

    try {
      const currentTime = this.video.currentTime || 0;

      // 1. Clean up WebTorrent torrents aggressively
      const torrents = this.client.torrents;
      torrents.forEach((torrent) => {
        if (torrent.done) {
          this.client.remove(torrent.infoHash);
        }
      });

      // 2. Trim video buffer to bare minimum
      if (this.sb.buffered.length) {
        const end = this.sb.buffered.end(this.sb.buffered.length - 1);
        if (end - currentTime > 5) {
          const keepFrom = Math.max(0, currentTime - 2); // Keep only 2 seconds behind
          this.sb.remove(0, keepFrom);
          this.addLog(`🚨 iOS Emergency cleanup: 0-${keepFrom.toFixed(1)}s`);
        }
      }

      // 3. Reduce chunk buffer
      if (this.chunkBuffer.size > 10) {
        const indices = Array.from(this.chunkBuffer.keys()).sort(
          (a, b) => a - b
        );
        const toRemove = indices.length - 10;
        for (let i = 0; i < toRemove; i++) {
          this.chunkBuffer.delete(indices[i]);
        }
        this.addLog(
          `🚨 iOS: Reduced chunk buffer from ${indices.length} to 10`
        );
      }
    } catch (e) {
      console.warn("Emergency cleanup failed:", e);
    }
  }

  maybeCleanupBuffers() {
    // iOS-optimized: Less aggressive, more frequent small cleanups
    if (!this.sb || this.sb.updating || !this.sb.buffered.length) return;

    try {
      const currentTime = this.video.currentTime || 0;
      const end = this.sb.buffered.end(this.sb.buffered.length - 1);
      const bufferAhead = end - currentTime;

      // iOS: Clean up more aggressively but in smaller chunks
      if (this.isIOS) {
        // Clean up if we have more than 10 seconds total
        if (end > 10) {
          // Remove small chunks at a time (2 seconds)
          const removeEnd = Math.max(0, currentTime - 3); // Keep 3 seconds behind
          if (removeEnd > 2 && !this.sb.updating) {
            this.sb.remove(0, Math.min(removeEnd, 2)); // Max 2 seconds at a time
            this.addLog(`📱 iOS gentle cleanup: removed 2s`);
            this.isProcessing = true;
          }
        }

        // Force garbage collection hint (iOS Safari specific)
        if (this.video && this.video.currentTime > 30) {
          // Every 30 seconds, trigger a mild cleanup
          const now = Date.now();
          if (now - this.lastMemoryWarning > 30000) {
            this.lastMemoryWarning = now;
            this.emergencyCleanup();
          }
        }
      } else {
        // Desktop: Original logic
        if (end > this.cleanupThreshold) {
          const removeEnd = Math.max(0, currentTime - 5);
          if (removeEnd > 5 && !this.sb.updating) {
            this.sb.remove(0, removeEnd);
            this.addLog(`🧹 Cleanup: 0-${removeEnd.toFixed(1)}s`);
            this.isProcessing = true;
          }
        }
      }
    } catch (e) {
      console.warn("Buffer cleanup failed:", e);
    }
  }

  addChunks(chunks) {
    let foundHeader = false;

    chunks.forEach((c) => {
      // Explicit check for -1
      if (c.chunkIndex === -1) {
        this.addLog("🎯 FOUND HEADER (-1)!");
        if (!this.headerLoaded) {
          // CRITICAL: Store the header's magnet link for tick() to use
          this.setupMagnet = c.magnetLink;
          this.detectedMimeType = c.mimeType;
          foundHeader = true;
        }
      }

      // Store regular chunks
      if (c.chunkIndex >= 0) {
        if (!this.chunkBuffer.has(c.chunkIndex)) {
          this.chunkBuffer.set(c.chunkIndex, c);
        }
      }
    });

    if (!this.setupMagnet) {
      this.addLog("❌ Header (-1) still missing from tray.");
    }

    // === NEW: ENFORCE MAX BUFFER SIZE ===
    if (this.chunkBuffer.size > this.maxBufferSize) {
      // Get all stored chunk indices and sort them
      const sortedIndices = Array.from(this.chunkBuffer.keys()).sort(
        (a, b) => a - b
      );

      // Calculate how many to remove
      const chunksToRemove = sortedIndices.length - this.maxBufferSize;

      // Remove the oldest chunks (lowest indices)
      for (let i = 0; i < chunksToRemove; i++) {
        this.chunkBuffer.delete(sortedIndices[i]);
      }

      this.addLog(
        `🧹 Trimmed buffer: removed ${chunksToRemove} old chunks. Current size: ${this.chunkBuffer.size}`
      );
    }
    // ====================================

    this.tick();
  }

  async tick() {
    if (this.isProcessing || this.ms.readyState !== "open") {
      this.addLog(
        `⏸️ Tick blocked: isProcessing=${this.isProcessing}, readyState=${this.ms.readyState}`
      );
      return;
    }

    if (this.nextIndex % 10 === 0) {
      // Log every 10 chunks
      this.addLog(
        `📊 Buffer stats: ${this.chunkBuffer.size}/${this.maxBufferSize} chunks, nextIndex: ${this.nextIndex}`
      );
    }
    // STEP 1: Initialize SourceBuffer
    if (!this.sb && this.detectedMimeType) {
      try {
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.addLog("🛠️ SourceBuffer Created");

        // === ADD EVENT LISTENERS HERE ===
        this.sb.addEventListener("updateend", () => {
          this.addLog(`📦 SB updateend. Ready for next chunk.`);
          this.isProcessing = false;
          setTimeout(() => this.tick(), 50); // Process next chunk
        });
        this.sb.addEventListener("error", (e) => {
          this.addLog(`❌ SourceBuffer error: ${e.message}`);
          this.isProcessing = false;
        });
        // ================================
      } catch (e) {
        this.addLog("❌ MSE Error: " + e.message);
        return;
      }
    }

    if (!this.sb || this.sb.updating) return;

    // STEP 2: Download and Append Header
    if (this.setupMagnet && !this.headerLoaded) {
      this.isProcessing = true;
      try {
        this.addLog("📥 Downloading Header..."); // Add this log
        const buf = await this.download(this.setupMagnet);
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
        this.addLog("✅ Header Loaded");
      } catch (e) {
        this.addLog("❌ Header Failed: " + e.message);
        this.isProcessing = false;
        setTimeout(() => this.tick(), 1000);
        return;
      }
      return; // Let updateend event continue the flow
    }

    // STEP 3: Download and Append Chunks
    if (this.headerLoaded) {
      const chunk = this.chunkBuffer.get(this.nextIndex);
      if (chunk) {
        // Inside the 'if (chunk)' block in tick():
        this.isProcessing = true;
        try {
          this.addLog(
            `🔄 TICK: Attempting to download chunk ${this.nextIndex}...`
          );
          const buf = await this.download(chunk.magnetLink);

          // === STRICT SIZE VALIDATION ===
          // A valid 1-second video chunk should be > 10KB. Adjust as needed.
          const MIN_CHUNK_SIZE = 10 * 1024; // 10 KB
          if (!buf || buf.length < MIN_CHUNK_SIZE) {
            this.addLog(
              `⚠️ Chunk ${this.nextIndex} too small (${buf?.length} bytes). Likely corrupt. Removing from queue.`
            );
            this.chunkBuffer.delete(this.nextIndex); // Remove bad chunk
            this.nextIndex++; // CRITICAL: Advance index anyway
            this.isProcessing = false;
            setTimeout(() => this.tick(), 100);
            return;
          }
          this.addLog(
            `✅ Downloaded chunk ${this.nextIndex}, size: ${buf.length} bytes`
          );

          // Append to SourceBuffer
          this.sb.appendBuffer(buf);

          // Update state (now bufferStartTimes is initialized)
          if (this.bufferStartTimes) {
            this.bufferStartTimes.set(this.nextIndex, Date.now());
          }
          this.chunkBuffer.delete(this.nextIndex);
          this.nextIndex++; // Now we will look for chunk 1

          // The 'updateend' event will fire, calling tick() again
          // Do NOT set this.isProcessing = false here
        } catch (e) {
          this.addLog(`❌ Chunk ${this.nextIndex} Error: ${e.message}`);
          this.isProcessing = false;
          setTimeout(() => this.tick(), 1000);
        }
      } else {
        // ADD THIS LOG - Shows when a chunk is *missing* from the buffer
        this.addLog(`⏳ TICK: Chunk ${this.nextIndex} not in buffer yet.`);
      }
    }
  }

download(magnet) {
    return new Promise((resolve, reject) => {
      const existing = this.client.get(magnet);
      if (existing) {
        if (existing.done)
          return existing.files[0].getBuffer((err, buf) =>
            err ? reject(err) : resolve(buf)
          );
        existing.on("done", () =>
          existing.files[0].getBuffer((err, buf) =>
            err ? reject(err) : resolve(buf)
          )
        );
        return;
      }

         const timeout = this.isIOS ? 10000 : 30000; // 10s vs 30s
         const timeoutId = setTimeout(() => {
           reject(new Error("Download timeout"));
           this.client.remove(magnet);
         }, timeout);
      
      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
        torrent.on("done", () => {
            clearTimeout(timeoutId);
          torrent.files[0].getBuffer((err, buf) => {
            if (err) reject(err);
            else {
              resolve(buf);
              // iOS: Remove torrent IMMEDIATELY after use
              if (this.isIOS) {
                setTimeout(() => {
                  try {
                    this.client.remove(torrent.infoHash);
                  } catch (e) {}
                }, 1000); // 1 second instead of 5 minutes
              } else {
                setTimeout(() => this.client.remove(torrent.infoHash), 30000); // 30 seconds for desktop
              }
            }
          });
        });
          torrent.on("error", (err) => {
            clearTimeout(timeoutId);
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
