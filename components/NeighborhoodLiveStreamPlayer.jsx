import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { warehouse } from "../components/StreamWearhouse.js";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

class StreamController {
  constructor(sessionId, addLog) {
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.chunkBuffer = new Map();
    this.isProcessing = false;

    // Apple-friendly MimeType
    this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';

    // 1. Create Video & MediaSource
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.style.backgroundColor = "black";

    const MS_Class = window.ManagedMediaSource || window.MediaSource;
    this.ms = new MS_Class();
    this.video.src = URL.createObjectURL(this.ms);

    // 2. The Hand-Crafted Heartbeat (Slow & Steady)
    this.ms.addEventListener("sourceopen", () => {
      this.addLog("🌅 MediaSource Open. Swarm ready.");
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
      });

      // Heartbeat: Check the tray every 1 second (Vermont Pace)
      this.heartbeat = setInterval(() => this.tick(), 1000);
    });

    // 3. The Beach Bum Janitor (Independent Chron)
    this.janitor = setInterval(() => this.smartVacuum(), 300000); // Check every 5 mins
  }

  async smartDownload(magnet, index) {
    // Check Disk first
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    return new Promise((resolve) => {
      const client = window.globalWebTorrentClient;
      if (!client) return resolve(null);

      // Add with a specific name so we can find it later for long-term seeding
      client.add(magnet, { name: `swarm_${this.sessionId}_${index}` }, (t) => {
        t.on("done", () => {
          t.files[0].getBuffer(async (err, buf) => {
            if (buf) {
              await warehouse.saveChunk(this.sessionId, index, new Uint8Array(buf));
              resolve(buf);
              // WE DO NOT DESTROY THE TORRENT HERE. 
              // We leave it "Super Peering" for as long as the player is open.
            } else resolve(null);
          });
        });
      });

      // Give the swarm 10 full seconds to find a neighbor before failing
      setTimeout(() => { if (!client.get(magnet)?.done) resolve(null); }, 10000);
    });
  }

  async smartVacuum() {
    this.addLog("🏖️ Janitor checking the tide...");
    const stats = await warehouse.getStats(this.sessionId); // Size check
    
    // If we're over 200MB, we start being a little more careful
    if (stats.totalSize > 200 * 1024 * 1024) {
      this.addLog("🧹 Volume over 200MB, cleaning old drift...");
      await warehouse.deleteOldChunks(this.sessionId, this.nextIndex - 20);
    }
  }

  stop() {
    clearInterval(this.heartbeat);
    clearInterval(this.janitor);
    this.addLog("🛑 Engine Stopped. Peer status: Hibernating.");
    // We don't nuke the torrents immediately. Let them seed until the page refreshes.
  }

  onSourceOpen() {
    this.addLog("✅ MediaSource Open");
    try {
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
      });
      this.addLog("💓 Heartbeat ready");
    } catch (e) {
      this.addLog("❌ SourceBuffer failed: " + e.message);
    }
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      if (c.chunkIndex === -1 && !this.headerLoaded) {
        this.detectedMimeType = c.mimeType || this.detectedMimeType;
        this.headerMagnet = c.magnetLink;
      }
      if (c.chunkIndex >= 0 && !this.chunkBuffer.has(c.chunkIndex)) {
        this.chunkBuffer.set(c.chunkIndex, c);
      }
    });
    this.tick();
  }

  async tick() {
    if (this.isProcessing || !this.ms || this.ms.readyState !== "open") return;
    if (!this.sb || this.sb.updating) return;

    const chunk = this.chunkBuffer.get(this.nextIndex);
    if (!chunk) {
      // THIS LOG WILL TELL US IF THE TRAY IS EMPTY
      // console.log(`[Engine] Waiting for tray to provide index: ${this.nextIndex}`);
      return;
    }

    // A. The Header (DNA)
    if (this.headerMagnet && !this.headerLoaded) {
      this.isProcessing = true;
      const buf = await this.smartDownload(this.headerMagnet, -1);
      if (buf) {
        this.addLog("🎬 Appending Header");
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
      }
      this.isProcessing = false;
      return;
    }

    // B. The Chunks
    if (this.headerLoaded) {
      const chunk = this.chunkBuffer.get(this.nextIndex);
      if (chunk) {
        this.isProcessing = true;
        const buf = await this.smartDownload(chunk.magnetLink, this.nextIndex);
        if (buf) {
          this.addLog(`📦 Appending Chunk ${this.nextIndex}`);
          this.sb.appendBuffer(buf);
          this.chunkBuffer.delete(this.nextIndex);
          this.nextIndex++;
        }
        this.isProcessing = false;
      }
    }
  }

  async smartDownload(magnet, index) {
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    return new Promise((resolve) => {
      const client = window.globalWebTorrentClient;
      if (!client) return resolve(null);

      const torrent = client.add(
        magnet,
        { name: `${this.sessionId}_${index}` },
        (t) => {
          t.on("done", () => {
            t.files[0].getBuffer(async (err, buf) => {
              if (buf) {
                await warehouse.saveChunk(
                  this.sessionId,
                  index,
                  new Uint8Array(buf)
                );
                resolve(buf);
              } else resolve(null);
            });
          });
        }
      );

      setTimeout(() => {
        if (!torrent.done && torrent.numPeers === 0) resolve(null);
      }, 5000);
    });
  }

  async vacuum() {
    // Fulfilling life: only work if really necessary
    if (this.nextIndex > 50) {
      this.addLog("🧹 Janitor doing a quick tidy up...");
      await warehouse.deleteOldChunks(this.sessionId, this.nextIndex - 30);
    }
  }

  stop() {
    clearInterval(this.watchdog);
    clearInterval(this.janitorInterval);
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.remove();
    }
    this.addLog("🛑 Engine Stopped.");
  }
}

export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  availableInWarehouse = []
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
    return () => {
      if (controllerRef.current) controllerRef.current.stop();
    };
  }, []);
  // Inside NeighborhoodLiveStreamPlayer.jsx

  useEffect(() => {
    // Every time the Scout (livestream.tsx) says more chunks are in the Warehouse...
    if (isJoined && controllerRef.current && availableInWarehouse.length > 0) {
      // We convert the "indices" into "Dummy Chunks" for the engine's tray
      const chunksForTray = availableInWarehouse.map((index) => ({
        chunkIndex: index,
        magnetLink: "cached", // The engine will see this and check IndexedDB
      }));

      addLog(
        `🚚 Scout reported ${availableInWarehouse.length} chunks ready on disk.`
      );
      controllerRef.current.addChunks(chunksForTray);
    }
  }, [isJoined, availableInWarehouse]);

  const handleJoinStream = async () => {
    addLog("🚀 Join Clicked...");

    // Pass addLog and an empty fetcher since we aren't using Apollo's refetch here
    const controller = new StreamController(sessionId, addLog);

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    controllerRef.current = controller;
    setIsJoined(true);

    // If we have initial chunks, feed them to the tray immediately
    if (initialChunks.length > 0) {
      controller.addChunks(initialChunks);
    }
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
    backgroundColor: "#151159",
    padding: 20,
    borderRadius: 10,
    alignSelf: "center",
    marginTop: 20,
  },
  buttonText: { color: "white", fontWeight: "bold" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
