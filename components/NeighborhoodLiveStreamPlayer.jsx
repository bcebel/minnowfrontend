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
    // Inside the constructor
    this.janitorInterval = setInterval(() => {
      // Only clean if we've actually progressed into the stream
      if (this.nextIndex > 20) {
        this.addLog("🧹 Janitor: Vacuuming old chunks...");
        warehouse.deleteOldChunks(this.sessionId, this.nextIndex - 15);
      }
    }, 30000); // Run every 30 seconds
    // 1. Core State
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.chunkQueue = new Map();
    this.setupMagnet = null;
    this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"'; // Default Apple-Safe codec
    this.CHUNK_DURATION = 8;

    // 2. MediaSource Setup
    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();
    this.sb = null;
    // Inside constructor
    this.peerCount = 0;
    this.peerUpdateInterval = setInterval(() => {
      if (window.globalWebTorrentClient) {
        // Check all active torrents for this session
        const torrents = window.globalWebTorrentClient.torrents;
        const count = torrents.reduce((acc, t) => acc + t.numPeers, 0);
        if (count !== this.peerCount) {
          this.peerCount = count;
          this.addLog(`👥 Swarm Members: ${count}`);
        }
      }
    }, 5000);
    // 3. Video Element (iPhone Optimized)
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("webkit-playsinline", "true");
    this.video.disableRemotePlayback = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";

    if (window.ManagedMediaSource) {
      this.video.setAttribute("disableRemotePlayback", "true");
    }

    // 4. Unified SourceOpen Handler
    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog("✅ MediaSource Open");
      this.sweepWarehouse(); // Immediately look for the header once open
    });

    this.janitorInterval = setInterval(() => {
      this.vacuum();
    }, 30000); // Runs every 30 seconds
    // 5. THE WATCHDOG (The Hungry Manager)
    // 1. In the Constructor:
    this.watchdog = setInterval(async () => {
      // ONLY use watchdog to bridge the gap if the engine is stuck
      if (this.headerLoaded && !this.isProcessing && !this.sb?.updating) {
        const nextData = await warehouse.getChunk(
          this.sessionId,
          this.nextIndex
        );
        if (nextData) {
          this.addLog(`📦 Watchdog nudging engine for chunk ${this.nextIndex}`);
          this.tick();
        }
      }
    }, 3000); // Relaxed to 3 seconds to avoid race conditions
  }
  async vacuum() {
    this.addLog("🧹 Janitor: Inspecting warehouse...");

    // We want to keep a small buffer of the "past" just in case,
    // but delete anything older than 20 chunks ago.
    const threshold = this.nextIndex - 20;

    if (threshold > 0) {
      try {
        await warehouse.deleteOldChunks(this.sessionId, threshold);
        this.addLog(`✨ Janitor: Purged chunks older than index ${threshold}`);
      } catch (e) {
        console.error("Janitor failed to clean warehouse:", e);
      }
    }
  }
  stop() {
    this.addLog("🧹 Janitor: Cleaning up session...");
    clearInterval(this.watchdog);
    clearInterval(this.peerUpdateInterval);

    // 1. Stop the Video
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.load(); // Forces hardware release
    }

    // 2. Kill the Swarm for this session
    if (window.globalWebTorrentClient) {
      window.globalWebTorrentClient.torrents.forEach((torrent) => {
        // We check if the torrent name or info belongs to this session
        if (
          torrent.name.includes(this.sessionId) ||
          torrent.name.includes("chunk_")
        ) {
          this.addLog(`🛑 Stopping seed: ${torrent.name}`);
          torrent.destroy();
        }
      });
    }
  }

  forceTick() {
    this.addLog("⚡ Force Tick triggered");
    this.tick();
  }

  createSourceBuffer() {
    if (this.sb || !this.detectedMimeType || this.ms.readyState !== "open") {
      // Log why we aren't creating it
      if (!this.detectedMimeType) console.log("Waiting for MimeType...");
      if (this.ms.readyState !== "open")
        console.log("MediaSource not open yet:", this.ms.readyState);
      return;
    }

    try {
      this.addLog(`🛠️ Attempting SourceBuffer: ${this.detectedMimeType}`);
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";

      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
        this.tick();
      });
      this.addLog("✅ SourceBuffer Created!");
    } catch (e) {
      this.addLog("❌ SB Error: " + e.message);
      // FALLBACK: If Safari hates the codec, try the most generic one
      if (
        this.detectedMimeType !== 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
      ) {
        this.detectedMimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
        this.createSourceBuffer();
      }
    }
  }

  async sweepWarehouse() {
    const header = await warehouse.getChunk(this.sessionId, -1);
    if (header) {
      this.addLog("🎯 Header found in Warehouse");

      // FORCE a MimeType if we don't have one, otherwise createSourceBuffer will never run
      if (!this.detectedMimeType) {
        this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
      }

      this.setupMagnet = "cached";

      // On Safari, we must try to create the buffer the MOMENT the header is found
      if (this.ms.readyState === "open") {
        this.createSourceBuffer();
      }
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

  // 2. The tick() method needs a "Gatekeeper"
  async tick() {
    // Inside tick()
    if (this.headerLoaded && !this.isProcessing) {
      const latestInQueue = Math.max(...Array.from(this.chunkQueue.keys()), -1);

      // ⏩ THE JUMP: If we are more than 3 chunks behind the latest known chunk, skip ahead!
      if (latestInQueue > this.nextIndex + 3) {
        this.addLog(
          `⏩ Jumping from ${this.nextIndex} to Live Edge: ${latestInQueue}`
        );
        this.nextIndex = latestInQueue;

        // Clear the SourceBuffer to prevent the iPad from choking on old data
        if (this.sb && !this.sb.updating) {
          this.sb.abort(); // Stops current appends
          this.addLog("🧹 Buffer reset for jump");
        }
      }
    }
    // If hardware is busy, don't even look at the warehouse
    if (this.isProcessing || (this.sb && this.sb.updating)) return;

    // Ensure MediaSource is actually ready
    if (this.ms.readyState !== "open") return;

    // --- STEP 1: Process Header ---
    if (!this.headerLoaded) {
      const header = await warehouse.getChunk(this.sessionId, -1);

      if (header && this.sb) {
        this.isProcessing = true;
        this.addLog("🎬 Appending Header...");

        if (!this.headerLoaded) {
          const header = await warehouse.getChunk(this.sessionId, -1);
          if (header && this.sb) {
            this.isProcessing = true;
    
            // If we are jumping (e.g., starting at index 100), 
            // we tell the SourceBuffer to expect data at that timestamp.
            if (this.nextIndex > 0) {
              const startTime = this.nextIndex * this.CHUNK_DURATION;
              this.sb.timestampOffset = startTime;
              this.addLog(`⏰ Timeline offset set to ${startTime}s`);
            }

            this.sb.appendBuffer(header);
            this.headerLoaded = true;
            this.nextIndex = 0;
            this.video.play().catch(() => { });
          }
          return;
        }
        const data = await warehouse.getChunk(this.sessionId, this.nextIndex);
        if (data && this.sb) {
          this.isProcessing = true;
          this.addLog(`🎬 Appending Chunk ${this.nextIndex}`);
          try {
            this.sb.appendBuffer(data);
            this.nextIndex++; // Move the pointer ONLY after we successfully start the append
          } catch (e) {
            this.isProcessing = false;
            this.addLog("❌ Append Fail: " + e.message);
          }
        }
      }
    }
  }

  async tryWebTorrentWithTimeout(magnet, timeoutMs) {
    return new Promise((resolve) => {
      let completed = false;
      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          resolve(null);
        }
      }, timeoutMs);

      // Use the GLOBAL client so the Scout and Player share the same peer list
      window.globalWebTorrentClient.add(magnet, (torrent) => {
        if (torrent.done) {
          torrent.files[0].getBuffer((err, buf) => {
            if (!completed) {
              completed = true;
              clearTimeout(timer);
              resolve(buf);
            }
          });
        }

        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            if (!completed) {
              completed = true;
              clearTimeout(timer);
              this.addLog("💎 P2P SUCCESS");
              resolve(buf);
            }
          });
        });
      });
    });
  }

  async download(magnet, index) {
    // 1. Warehouse Check (Instant)
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    // 2. P2P Priority (The 3-second head start)
    if (magnet && magnet !== "cached") {
      const p2pData = await this.tryWebTorrentWithTimeout(magnet, 3000);
      if (p2pData) {
        await warehouse.saveChunk(this.sessionId, index, p2pData);
        return p2pData;
      }
    }

    // 3. Server Fallback (The Safety Net)
    // 3. Server Fallback
    try {
      this.addLog(`☁️ Fetching Chunk ${index} from Server...`);
      const response = await fetch(
        `${BACKEND_URL}/api/live-chunk/${this.sessionId}/${index}`
      );

      if (response.ok) {
        const serverData = await response.arrayBuffer();
        const uint8 = new Uint8Array(serverData);

        await warehouse.saveChunk(this.sessionId, index, uint8);

        // 🚀 AGGRESSIVE SEEDING: Tell the tracker we have this chunk immediately
        if (window.globalWebTorrentClient && magnet !== "cached") {
          window.globalWebTorrentClient.seed(
            uint8,
            { name: `chunk_${this.sessionId}_${index}` },
            (torrent) => {
              this.addLog(`📡 Now seeding index ${index} to swarm.`);
            }
          );
        }

        return uint8;
      }
    } catch (e) {
      this.addLog(`❌ Connection error for Chunk ${index}`);
    }

    return null;
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
  availableInWarehouse = [],
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
    if (isJoined && controllerRef.current) {
      // 🚀 THE FIX: Tell the engine to look at the warehouse RIGHT NOW
      controllerRef.current.forceTick();
    }
  }, [availableInWarehouse]); // This triggers every time a chunk hits the warehouse
  useEffect(() => {
    // This tells the engine: "Hey, something new just hit the warehouse, check it now!"
    if (isJoined && controllerRef.current) {
      if (initialChunks.length > 0) {
        controllerRef.current.addChunks(initialChunks);
      }
      // Force the engine to run its logic because we know the warehouse changed
      controllerRef.current.tick();
    }
  }, [isJoined, initialChunks, availableInWarehouse]); // <--- Watch the warehouse state

const handleJoinStream = async () => {
  addLog("🚀 Join Clicked: Calculating Live Edge...");

  // 1. Find the newest chunk available in the initial list
  const latestIndex = initialChunks.reduce(
    (max, c) => (c.chunkIndex > max ? c.chunkIndex : max),
    0
  );

  // 2. Create the engine
  const controller = new StreamController(sessionId, addLog);

  // 3. 🎯 THE JUMP: Tell the controller to ignore the past
  if (latestIndex > 5) {
    addLog(`⏩ Stream is established. Jumping to Chunk ${latestIndex}`);
    controller.nextIndex = latestIndex;
  }

  // 4. Standard Attachment
  if (containerRef.current) {
    containerRef.current.appendChild(controller.video);
  }
  controller.video.src = URL.createObjectURL(controller.ms);
  controllerRef.current = controller;
  setIsJoined(true);

  // 5. Sweep warehouse for Header (-1) and the Jump Index
  await controller.sweepWarehouse();
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
  videoContainer: { width: "100%", height: "100%", backgroundColor: "#130720" },
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
