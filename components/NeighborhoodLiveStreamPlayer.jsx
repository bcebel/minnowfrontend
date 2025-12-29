import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from "react-native";
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

    this.trackers = [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.fastcast.nz",
    ];

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
  }

  addChunks(chunks) {
    this.addLog(`🧐 Scanning ${chunks.length} chunks for Header...`);

    chunks.forEach((c) => {
      // Explicitly check for -1
      if (c.chunkIndex === -1) {
        this.addLog("🎯 FOUND HEADER (-1)!");
        if (!this.headerLoaded) {
          this.setupMagnet = c.magnetLink;
          this.detectedMimeType = c.mimeType;
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

    this.tick();
  }

  async tick() {
    if (this.isProcessing || this.ms.readyState !== "open") return;

    // STEP 1: Initialize SourceBuffer once we have a codec
    if (!this.sb && this.detectedMimeType) {
      try {
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.addLog("🛠️ SourceBuffer Created");
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
        this.addLog("📥 Downloading Header...");
        const buf = await this.download(this.setupMagnet);
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
        this.addLog("✅ Header Loaded");
      } catch (e) {
        this.addLog("❌ Header Failed");
      } finally {
        this.isProcessing = false;
        setTimeout(() => this.tick(), 100);
      }
      return;
    }

    // STEP 3: Download and Append Chunks
    if (this.headerLoaded) {
      const chunk = this.chunkBuffer.get(this.nextIndex);
      if (chunk) {
        this.isProcessing = true;
        try {
          this.addLog(`📥 Fetching Chunk ${this.nextIndex}...`);
          const buf = await this.download(chunk.magnetLink);
          this.sb.appendBuffer(buf);
          this.chunkBuffer.delete(this.nextIndex);
          this.nextIndex++;

          // Try to play if we have a small buffer
          if (this.video.paused && this.nextIndex > 1) {
            this.video.play().catch(() => {});
          }
        } catch (e) {
          this.addLog(`❌ Chunk ${this.nextIndex} Error`);
        } finally {
          this.isProcessing = false;
          setTimeout(() => this.tick(), 100);
        }
      }
    }
  }

  download(magnet) {
    return new Promise((resolve, reject) => {
      // Check if already downloading
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

      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            if (err) reject(err);
            else {
              resolve(buf);
              // Keep seeding for others for a bit, then remove
              setTimeout(() => this.client.remove(torrent.infoHash), 300000);
            }
          });
        });
        torrent.on("error", (err) => reject(err));
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
