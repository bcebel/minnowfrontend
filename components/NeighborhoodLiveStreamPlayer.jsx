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

    // 5. THE WATCHDOG (The Hungry Manager)
    // This runs every 2 seconds to bridge gaps or find pre-fetched data
    this.watchdog = setInterval(async () => {
      if (!this.headerLoaded) {
        // Still looking for the start of the stream...
        await this.sweepWarehouse();
      } else if (!this.isProcessing) {
        // Header is in, let's see if the next chunk is ready in the warehouse
        const nextData = await warehouse.getChunk(
          this.sessionId,
          this.nextIndex
        );
        if (nextData) {
          this.addLog(
            `📦 Watchdog found chunk ${this.nextIndex} in warehouse.`
          );
          this.tick(); // Trigger processing
        }
      }
    }, 2000);
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

  async tick() {
    // 1. Check if the "Gates" are open
    if (this.isProcessing) return; // Silent return is fine here

    if (this.ms.readyState !== "open") {
      this.addLog(`⚠️ Tick Blocked: MediaSource is ${this.ms.readyState}`);
      return;
    }

    // Inside tick()
    if (!this.sb && this.detectedMimeType) {
      try {
        // 🔍 PROBE: Ask the iPhone if it actually supports this string
        const support = this.MS.isTypeSupported(this.detectedMimeType);
        this.addLog(`🧪 Codec Probe (${this.detectedMimeType}): ${support}`);

        if (!support) {
          // If the iPhone hates the string, try the most common "Apple-Safe" fallback
          this.detectedMimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
          this.addLog("🔄 Switching to Apple-Safe Fallback codec");
        }

        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.addLog("🛠️ SourceBuffer Created successfully");

        this.sb.addEventListener("updateend", () => {
          this.isProcessing = false;
          this.tick();
        });
      } catch (e) {
        this.addLog("❌ SourceBuffer Fail: " + e.message);
      }
    }

    if (!this.sb) {
      this.addLog("⚠️ Tick Blocked: No SourceBuffer created yet");
      return;
    }

    if (this.sb.updating) return;
    // Inside tick() before appending:
    if (this.sb && this.sb.buffered.length > 0) {
      const totalBuffered = this.sb.buffered.end(0) - this.sb.buffered.start(0);
      if (totalBuffered > 30) {
        // If we have more than 30 seconds of video
        this.addLog("🧹 Buffer Full: Clearing old footage...");
        this.sb.remove(0, this.sb.buffered.end(0) - 15); // Keep only the last 15 seconds
        return; // Wait for the next tick to append once cleared
      }
    }
    // 2. Process Header
    if (!this.headerLoaded) {
      const hasHeaderInWarehouse = await warehouse.getChunk(this.sessionId, -1);
      this.addLog(
        `🔍 Checking Header: Magnet=${!!this
          .setupMagnet}, Warehouse=${!!hasHeaderInWarehouse}`
      );

      if (this.setupMagnet || hasHeaderInWarehouse) {
        this.isProcessing = true;
        try {
          const magnet = this.setupMagnet || "cached";
          const buf = await this.download(magnet, -1);
          if (buf) {
            this.sb.appendBuffer(buf);
            this.headerLoaded = true;
            this.nextIndex = 0;
            this.addLog("✅ Engine Started - Header Appended");
            this.video.play().catch(() => {});
          } else {
            this.isProcessing = false;
            this.addLog("❌ Header download returned null");
          }
        } catch (e) {
          this.addLog("❌ Header Error: " + e.message);
          this.isProcessing = false;
        }
        return;
      }
    }
    // Check BOTH the queue AND the warehouse
    // STEP 2: Process Sequential Chunks (Index 0, 1, 2...)
    // Check BOTH the queue AND the warehouse for the EXACT next index
    const hasInQueue = this.chunkQueue.has(this.nextIndex);
    const hasInWarehouse = await warehouse.getChunk(
      this.sessionId,
      this.nextIndex
    );

    if (this.headerLoaded && (hasInQueue || hasInWarehouse)) {
      // 🚦 STOP! Check if the hardware is still busy with the previous chunk
      if (this.sb.updating || this.isProcessing) {
        // If we log this every time, it gets annoying, so we just return silently.
        // The watchdog or the updateend event will trigger tick() again soon.
        return;
      }
      this.isProcessing = true;

      // If it's in the warehouse, we don't need the magnet
      const magnet = hasInWarehouse
        ? "cached"
        : this.chunkQueue.get(this.nextIndex);

      try {
        this.addLog(`🔍 Attempting to append Chunk ${this.nextIndex}...`);
        const buf = await this.download(magnet, this.nextIndex);

        if (buf) {
          // 🛑 SECONDARY SAFETY: Check one last time before appending
          if (!this.sb.updating) {
            this.sb.appendBuffer(buf);
            this.addLog(`🎬 Appended Chunk ${this.nextIndex}`);

            // 🔓 THE KEY: We only move to nextIndex after 'updateend' fires.
            // You already have a listener for this in createSourceBuffer()
            // that sets isProcessing = false and calls tick()
            this.nextIndex++;
          } else {
            this.isProcessing = false; // Release lock so it can try again
          }
        } else {
          this.isProcessing = false;
          this.addLog(`⚠️ Download returned empty for Chunk ${this.nextIndex}`);
        }
      } catch (e) {
        this.addLog(`❌ Chunk ${this.nextIndex} Append Error: ` + e.message);
        this.isProcessing = false;
      }
      return;
    } else if (this.headerLoaded) {
      // This log helps us see if the engine is "waiting" for a specific number
      this.addLog(`⏳ Engine idle: Waiting for Chunk ${this.nextIndex}`);
    }
  }

  async tryWebTorrentWithTimeout(magnet, timeoutMs) {
    return new Promise((resolve) => {
      let completed = false;

      // 1. Give up and signal "Fallback to Server" if P2P is too slow
      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          this.addLog("🛰️ P2P Priority window closed. Trying server...");
          resolve(null);
        }
      }, timeoutMs);

      // 2. Try the swarm using the global client
      window.globalWebTorrentClient.add(magnet, (torrent) => {
        // If we already found the chunk or timed out, don't do anything
        if (completed) return;

        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            if (!completed) {
              completed = true;
              clearTimeout(timer);
              this.addLog("💎 P2P SUCCESS: Swarm delivered data!");
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
    try {
      this.addLog(`☁️ Fetching Chunk ${index} from Server...`);
      const response = await fetch(
        `${BACKEND_URL}/api/live-chunk/${this.sessionId}/${index}`
      );

      if (response.ok) {
        const serverData = await response.arrayBuffer();
        await warehouse.saveChunk(this.sessionId, index, serverData);

        // OPTIONAL: Seed the server data back to the swarm so YOU become the P2P source
        window.globalWebTorrentClient.seed(serverData, {
          name: `chunk_${index}.mp4`,
        });

        return serverData;
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
    addLog("🚀 Join Clicked: Waking up engine...");

    // 1. Create the engine (Preserves the iPhone click gesture)
    const controller = new StreamController(sessionId, addLog);

    // 2. Attach to DOM immediately
    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    // 3. Link the source (No 'await' gaps here!)
    controller.video.src = URL.createObjectURL(controller.ms);
    controllerRef.current = controller;
    setIsJoined(true);

    // 4. THE MAGIC: Sweep the warehouse.
    // Because the Scout started earlier, it will find the Header and Chunk 0 immediately.
    await controller.sweepWarehouse();

    addLog("✅ Handshake complete. Playing from warehouse.");
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
