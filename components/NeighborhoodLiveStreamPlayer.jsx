// --- THE  WHOLE POINT OF THIS FILE IS TO PROVIDE A LIVE STREAM PLAYER THAT USES WEBTORRENT TO STREAM VIDEO CHUNKS FROM A P2P NETWORK --- //
// DONT DEFAULT TO SERVER VIDEO. INSTEAD, USE WEBTORRENT TO PULL VIDEO CHUNKS FROM PEERS. USE SERVER AS FALLBACK ONLY IF NO PEERS HAVE THE DATA READILY AVAILABLE. //
// KEEP TORRENTS ALIVE AS LONG AS POSSIBLE WITHOUT OVERLOADING THE BROWSER. USE A WAREHOUSE TO CACHE VIDEO CHUNKS LOCALLY. //

import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { warehouse } from "../components/StreamWearhouse.js";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- THE STREAM CONTROLLER (The Engine) ---
class StreamController {
  constructor(sessionId, addLog, triggerFetch) {
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;

    // 1. Core State
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.chunkQueue = new Map();
    this.setupMagnet = null;
    this.detectedMimeType = null;
    this.CHUNK_DURATION = 8;

    // 2. MediaSource Setup
    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();
    this.sb = null;

    // 3. Video Element (iPhone Optimized)
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("webkit-playsinline", "true");
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";

    // 4. Handlers
    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog("✅ MediaSource Open");
      if (this.detectedMimeType) this.createSourceBuffer();
      this.tick();
    });

    // Watchdog to prevent stalls
    this.watchdog = setInterval(() => this.tick(), 3000);
  }

  createSourceBuffer() {
    if (this.sb || !this.detectedMimeType || this.ms.readyState !== "open")
      return;
    try {
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.addLog("🛠️ SourceBuffer Created");
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
        this.tick();
      });
    } catch (e) {
      this.addLog("❌ Buffer Error: " + e.message);
    }
  }

  async sweepWarehouse() {
    this.addLog("🧹 Sweeping warehouse for pre-existing data...");
    const header = await warehouse.getChunk(-1);
    if (header) {
      this.addLog("🎯 Found Header in Warehouse");
      // Set the mimeType so the buffer can be created
      this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
      this.setupMagnet = "cached";
      if (this.ms.readyState === "open") this.createSourceBuffer();
    }
    this.tick();
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      // Handle Header
      if (c.chunkIndex === -1 && !this.headerLoaded) {
        this.setupMagnet = c.magnetLink;
        this.detectedMimeType =
          c.mimeType?.replace(/['"]+/g, '"') ||
          'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
        this.addLog("🎯 Header Found");
        if (this.ms.readyState === "open") this.createSourceBuffer();
      }
      // Handle Data Chunks
      if (c.chunkIndex >= 0) {
        this.chunkQueue.set(c.chunkIndex, c.magnetLink);
      }
    });
    this.tick();
  }

  async tick() {
    if (this.isProcessing || this.ms.readyState !== "open") return;
    if (!this.sb && this.detectedMimeType) this.createSourceBuffer();
    if (!this.sb || this.sb.updating) return;

    // STEP 1: Process Header
    if (!this.headerLoaded && this.setupMagnet) {
      this.isProcessing = true;
      try {
        // This will now correctly pull from warehouse because magnet is "cached"
        const buf = await this.download(this.setupMagnet, -1);
        if (buf) {
          this.sb.appendBuffer(buf);
          this.headerLoaded = true;
          this.nextIndex = 0; // Prepare for Chunk 0
          this.addLog("✅ Engine Started - Header Appended");
          this.video.play().catch(() => { });
        } else {
          this.isProcessing = false;
        }
      } catch (e) {
        this.addLog("❌ Header Append Failed");
        this.isProcessing = false;
      }
      return;
    }

  // STEP 2: Process Sequential Chunks (Index 0, 1, 2...)
    // Check BOTH the queue AND the warehouse
    const hasInQueue = this.chunkQueue.has(this.nextIndex);
    const hasInWarehouse = await warehouse.getChunk(this.nextIndex);

    if (this.headerLoaded && (hasInQueue || hasInWarehouse)) {
      this.isProcessing = true;
      const magnet = this.chunkQueue.get(this.nextIndex) || "cached";
      try {
        const buf = await this.download(magnet, this.nextIndex);
        if (buf) {
          this.addLog(`🎬 Appending Chunk ${this.nextIndex}`);
          this.sb.appendBuffer(buf);
          this.nextIndex++;
        } else {
          this.isProcessing = false;
        }
      } catch (e) {
        this.addLog(`❌ Chunk ${this.nextIndex} Error`);
        this.isProcessing = false;
      }
    }
  }

  async download(magnet, index) {
    // 1. Instant Check: Is it already in our local Warehouse?
    const cached = await warehouse.getChunk(index);
    if (cached) return cached;

    // 2. Swarm Priority: Try WebTorrent with a "Patient" timeout
    this.addLog(`📡 Swarm search for Chunk ${index}...`);

    const p2pData = await new Promise((resolve) => {
      let handled = false;

      // Give the swarm 5 seconds to find a peer
      const swarmTimeout = setTimeout(() => {
        if (!handled) {
          this.addLog(`🛰️ Swarm timeout for ${index}. Switching to Server.`);
          handled = true;
          resolve(null);
        }
      }, 5000);

      if (!magnet || magnet === "cached") {
        clearTimeout(swarmTimeout);
        return resolve(null);
      }

      window.globalWebTorrentClient.add(magnet, (torrent) => {
        // If we find it in the swarm
        torrent.on("done", () => {
          torrent.files[0].getBuffer(async (err, buf) => {
            if (!handled) {
              handled = true;
              clearTimeout(swarmTimeout);
              this.addLog(`💎 Swarm delivered Chunk ${index}!`);
              resolve(buf);
            }
            window.globalWebTorrentClient.remove(torrent.infoHash);
          });
        });
      });
    });

    if (p2pData) {
      await warehouse.saveChunk(index, p2pData);
      return p2pData;
    }

    // 3. Server Fallback: If swarm failed or was too slow
    try {
      this.addLog(`☁️ Fetching Chunk ${index} from Server...`);
      const response = await fetch(
        `${BACKEND_URL}/api/live-chunk/${this.sessionId}/${index}`
      );

      if (response.ok) {
        const serverData = await response.arrayBuffer();
        // Save to warehouse so we don't have to ask the server again for this chunk
        await warehouse.saveChunk(index, serverData);
        return serverData;
      } else {
        this.addLog(`❌ Server 404 for Chunk ${index}`);
      }
    } catch (e) {
      this.addLog(`❌ Connection error for Chunk ${index}`);
    }

    return null;
  }

  // Helper for the WebTorrent attempt
  tryWebTorrent(magnet) {
    return new Promise((resolve, reject) => {
      if (!magnet || magnet === "cached") return resolve(null);

      // Set a 5-second timeout for P2P before giving up to server
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

      window.globalWebTorrentClient.add(magnet, (torrent) => {
        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            clearTimeout(timeout);
            if (err) resolve(null);
            else resolve(buf);
            window.globalWebTorrentClient.remove(torrent.infoHash);
          });
        });
      });
    });
  }

  destroy() {
    clearInterval(this.watchdog);
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.remove();
    }
  }
}

// --- THE REACT COMPONENT ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  useEffect(() => {
    if (isJoined && controllerRef.current && initialChunks.length > 0) {
      controllerRef.current.addChunks(initialChunks);
    }
  }, [isJoined, initialChunks]);

  const handleJoinStream = async () => {
    addLog("🚀 Manual Join Triggered...");
    const controller = new StreamController(sessionId, addLog, () => {});

    // iPhone requirement: Attach video to DOM BEFORE setting src
    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    // Attach source after DOM placement
    controller.video.src = URL.createObjectURL(controller.ms);
    controllerRef.current = controller;
    setIsJoined(true);

    await controller.sweepWarehouse();
    if (initialChunks.length > 0) controller.addChunks(initialChunks);
  };

  return (
    <View style={styles.container}>
      <div ref={containerRef} style={styles.videoContainer} />
      {!isJoined && (
        <TouchableOpacity onPress={handleJoinStream} style={styles.button}>
          <Text style={styles.buttonText}>🔴 JOIN LIVE STREAM</Text>
        </TouchableOpacity>
      )}
      <View style={styles.logBox}>
        {logs.map((l, i) => (
          <Text key={i} style={styles.logText}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111" },
  videoContainer: { width: "100%", height: "100%", backgroundColor: "#000" },
  button: {
    backgroundColor: "#ff4444",
    padding: 20,
    borderRadius: 10,
    alignSelf: "center",
    marginTop: 20,
  },
  buttonText: { color: "white", fontWeight: "bold" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
