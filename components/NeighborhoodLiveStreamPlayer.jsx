import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { warehouse } from "../components/StreamWearhouse.js";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- THE STREAM CONTROLLER (The Engine) ---
class StreamController {
  constructor(sessionId, addLog) {
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';

    this.ms = new (window.ManagedMediaSource || window.MediaSource)();
    this.sb = null;
    this.heartbeat = null;

    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.peerCount = 0;
    this.swarmInterval = setInterval(() => {
      if (window.globalWebTorrentClient) {
        const totalPeers = window.globalWebTorrentClient.torrents.reduce(
          (acc, t) => acc + t.numPeers,
          0
        );
        if (totalPeers !== this.peerCount) {
          this.peerCount = totalPeers;
          this.addLog(`👥 Swarm Active: ${totalPeers} peers`);
        }
      }
    }, 5000);

    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => this.onSourceOpen());

    this.janitorInterval = setInterval(() => this.vacuum(), 30000);
  }

  onSourceOpen() {
    this.addLog("✅ MediaSource Open");
    try {
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
      });

      // The Heartbeat is the only thing that runs the engine
      this.heartbeat = setInterval(() => this.tick(), 500);
      this.addLog("💓 Heartbeat started (500ms)");
    } catch (e) {
      this.addLog("❌ SourceBuffer failed: " + e.message);
    }
  }

  async download(magnet, index) {
    // 1. Warehouse Check (Instant)
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    // 2. Aggressive P2P Attempt
    if (magnet && magnet !== "cached" && window.globalWebTorrentClient) {
      const p2pData = await this.p2pFetchWithTimeout(magnet, index);
      if (p2pData) {
        await warehouse.saveChunk(this.sessionId, index, p2pData);
        return p2pData;
      }
    }

    // 3. Server Fallback (The Safety Net)
    return await this.fetchFromServer(index);
  }

  async p2pFetchWithTimeout(magnet, index) {
    return new Promise((resolve) => {
      const client = window.globalWebTorrentClient;
      let hasResolved = false;

      // Use a 5-second aggressive timeout for live chunks
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          this.addLog(`⏱️ P2P Timeout for Chunk ${index}`);
          resolve(null);
        }
      }, 5000);

      client.add(magnet, { strategy: "sequential" }, (torrent) => {
        // Add server as a webseed so P2P and Server work together
        const serverUrl = `${BACKEND_URL}/api/live-chunk/${this.sessionId}/${index}`;
        torrent.addWebSeed(serverUrl);

        torrent.on("download", () => {
          // If we have enough for a buffer (e.g., 10%), resolve early if it's a large file
          // For small 8s chunks, we usually wait for 100%
          if (torrent.progress === 1 && !hasResolved) {
            torrent.files[0].getBuffer((err, buf) => {
              if (!hasResolved) {
                hasResolved = true;
                clearTimeout(timeout);
                this.addLog(`💎 P2P Success: Chunk ${index}`);
                resolve(buf);
              }
            });
          }
        });

        // Handle "No Peers" quickly
        setTimeout(() => {
          if (!hasResolved && torrent.numPeers === 0) {
            hasResolved = true;
            clearTimeout(timeout);
            torrent.destroy();
            resolve(null);
          }
        }, 2000);
      });
    });
  }
  async tick() {
    if (!this.sb || this.sb.updating || this.isProcessing) return;
    this.isProcessing = true;

    try {
      if (!this.headerLoaded) {
        const header = await warehouse.getChunk(this.sessionId, -1);
        if (header) {
          this.addLog("🎬 Appending Header...");
          this.sb.appendBuffer(header);
          this.headerLoaded = true;
        } else {
          this.isProcessing = false;
        }
        return;
      }

      const chunk = await warehouse.getChunk(this.sessionId, this.nextIndex);
      if (chunk) {
        this.addLog(`📦 Appending Chunk ${this.nextIndex}`);
        this.sb.appendBuffer(chunk);
        this.nextIndex++;
      } else {
        this.isProcessing = false;
      }
    } catch (e) {
      this.addLog(`❌ Tick Error: ${e.message}`);
      this.isProcessing = false;
    }
  }

  async vacuum() {
    if (this.nextIndex > 20) {
      this.addLog("🧹 Janitor: Vacuuming IndexedDB...");
      await warehouse.deleteOldChunks(this.sessionId, this.nextIndex - 15);
    }
  }

  stop() {
    clearInterval(this.heartbeat);
    clearInterval(this.janitorInterval);
    if (this.video) {
      this.video.pause();
      this.video.src = "";
    }
    this.addLog("🛑 Engine Stopped.");
  }
}

// --- THE REACT COMPONENT ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  availableInWarehouse = [], // This is our signal from the "Scout"
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (controllerRef.current) controllerRef.current.stop();
    };
  }, []);

  const handleJoinStream = async () => {
    addLog("🚀 Join Clicked...");

    // Find the latest chunk to avoid starting at 0 for an old stream
    const latestIndex = initialChunks.reduce(
      (max, c) => (c.chunkIndex > max ? c.chunkIndex : max),
      0
    );

    const controller = new StreamController(sessionId, addLog);

    // If the stream has been going, jump to the edge
    if (latestIndex > 5) {
      addLog(`⏩ Jumping to Edge: ${latestIndex}`);
      controller.nextIndex = latestIndex;
    }

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    controller.video.src = URL.createObjectURL(controller.ms);
    controllerRef.current = controller;
    setIsJoined(true);
  };

  return (
    <View style={styles.container}>
      {/* Native Web Container */}
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
  videoContainer: { width: "100%", height: "100%", backgroundColor: "#130720" },
  button: {
    backgroundColor: "#151159",
    padding: 20,
    borderRadius: 10,
    alignSelf: "center",
    marginTop: 20,
    zIndex: 10,
  },
  buttonText: { color: "white", fontWeight: "bold" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
