// --- THE  WHOLE POINT OF THIS FILE IS TO PROVIDE A LIVE STREAM PLAYER THAT USES WEBTORRENT TO STREAM VIDEO CHUNKS FROM A P2P NETWORK --- //
// DONT DEFAULT TO SERVER VIDEO. INSTEAD, USE WEBTORRENT TO PULL VIDEO CHUNKS FROM PEERS. USE SERVER AS FALLBACK ONLY IF NO PEERS HAVE THE DATA READILY AVAILABLE. //
// KEEP TORRENTS ALIVE AS LONG AS POSSIBLE WITHOUT OVERLOADING THE BROWSER. USE A WAREHOUSE TO CACHE VIDEO CHUNKS LOCALLY. //

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { warehouse } from "../components/StreamWearhouse.js";
import webtorrentService from "../utils/webtorrentService.js";
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- THE STREAM CONTROLLER (The Engine) ---
class StreamController {
  constructor(sessionId, addLog, triggerFetch, container) {
    this.container = container;
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.thumbnailUrl = null;
    this.thumbnailLoaded = false;

    // 1. Core State
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.chunkQueue = new Map();
    this.setupMagnet = null;
    this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"'; // Default Apple-Safe codec
    this.CHUNK_DURATION = 8;

    // 2. MediaSource Setup
    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();

    this.sb = null;
    this.ms.addEventListener("startstreaming", () => {
      this.addLog("✅ ManagedMediaSource started streaming");
      this.sweepWarehouse();
    });

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;
    this.wrapper = wrapper;
    this.container.appendChild(wrapper);
    // 3. Video Element (iPhone Optimized)
    this.video = document.createElement("video");
    this.video.controls = false; // ✅ No native controls
    this.video.disableRemotePlayback = true; // ✅ Set this BEFORE src
    this.video.src = URL.createObjectURL(this.ms);
    this.video.addEventListener("loadedmetadata", () => {
      const rotation = this.video.videoRotation || 0;
      if (rotation === 90 || rotation === 270) {
        this.video.style.transform = `rotate(${rotation}deg)`;
        this.video.style.transformOrigin = "center center";
        this.video.style.objectFit = "contain";
        this.addLog(`🔄 Applied rotation from metadata: ${rotation}°`);
      }
    });
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("webkit-playsinline", "true");
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";
    this.video.poster = "";
    this.wrapper.appendChild(this.video);
    this.createCustomControls();
    if (window.ManagedMediaSource) {
      this.video.setAttribute("disableRemotePlayback", "true");
    }
    this.fetchThumbnailFromStreamChunk = async () => {
      try {
        // Try to get thumbnail from StreamChunk backend
        const response = await fetch(
          `${BACKEND_URL}/api/stream-chunk/thumbnail/${sessionId}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.thumbnailUrl) {
            this.thumbnailUrl = data.thumbnailUrl;
            this.thumbnailLoaded = true;
            this.addLog("✅ Thumbnail loaded from StreamChunk");

            // Trigger any callback to update UI
            if (this.onThumbnailLoaded) {
              this.onThumbnailLoaded(this.thumbnailUrl);
            }
            return true;
          }
        }
      } catch (error) {
        //   this.addLog("⚠️ Could not fetch thumbnail from StreamChunk");
      }
      return false;
    };

    // 4. Unified SourceOpen Handler
    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog(`✅ ${openEvt} fired!`);
      //  this.addLog("✅ MediaSource Open");
      this.sweepWarehouse(); // Immediately look for the header once open
    });

    // 5. THE WATCHDOG (The Hungry Manager)
    // This runs every 2 seconds to bridge gaps or find pre-fetched data
    this.watchdog = setInterval(async () => {
      if (!this.headerLoaded) {
        // Still looking for the start of the stream...
        if (!this.headerLoaded && this.sessionId) {
          //  this.addLog("📢 Broadcasting: Missing Header (-1).");
          // This is where you'd emit to your socket
          // window.globalSocket.emit('request_header', { sessionId: this.sessionId });
        }
      } else if (!this.isProcessing) {
        // Header is in, let's see if the next chunk is ready in the warehouse
        const nextData = await warehouse.getChunk(
          this.sessionId,
          this.nextIndex,
        );
        if (nextData) {
          this.tick(); // Trigger processing
        }
      }
    }, 2000);
  }

  createCustomControls() {
    const controls = document.createElement("div");
    controls.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      z-index: 10;
      pointer-events: none;
    `;
    
    const playBtn = document.createElement("button");
    playBtn.textContent = "▶";
    playBtn.style.cssText = `
      pointer-events: auto;
      padding: 12px 24px;
      background: rgba(255,255,255,0.8);
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
    `;
    playBtn.onclick = () => {
      if (this.video.paused) {
        this.video.play();
        playBtn.textContent = "⏸";
      } else {
        this.video.pause();
        playBtn.textContent = "▶";
      }
    };
    
    controls.appendChild(playBtn);
    this.wrapper.appendChild(controls);
    this.playBtn = playBtn;
  }


  // Add this method
  async once(element, event) {
    return new Promise((resolve) => {
      element.addEventListener(event, resolve, { once: true });
    });
  }

  // Add this method to StreamController class
  cleanupResources() {
    clearInterval(this.watchdog);

    // Clean up video element
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.load();

      // Remove event listeners
      this.video.removeAttribute("src");
      this.video.remove();
    }

    // Clean up MediaSource
    if (this.ms && this.ms.readyState === "open") {
      try {
        this.ms.endOfStream();
      } catch (e) {}
    }

    // Clean up SourceBuffer
    if (this.sb) {
      try {
        this.ms.removeSourceBuffer(this.sb);
      } catch (e) {}
    }

    // Revoke object URL
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    // Clear chunk queue
    this.chunkQueue.clear();
  }

  forceTick() {
    // this.addLog("⚡ Force Tick triggered");
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
      //   this.addLog(`🛠️ Attempting SourceBuffer: ${this.detectedMimeType}`);
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";

      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
        this.tick();
      });
      //   this.addLog("✅ SourceBuffer Created!");
    } catch (e) {
      //  this.addLog("❌ SB Error: " + e.message);
      // FALLBACK: If Safari hates the codec, try the most generic one
      if (
        this.detectedMimeType !== 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"'
      ) {
        this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
        this.createSourceBuffer();
      }
    }
  }

  async stitchAndShip() {
    // this.addLog("🧵 Starting Stitch & Ship...");
    const blobParts = [];

    // 1. Get the Header
    const header = await warehouse.getChunk(this.sessionId, -1);
    if (!header) {
      //  this.addLog("❌ Cannot archive: Header missing from warehouse.");
      return;
    }
    blobParts.push(header);

    // 2. Loop through all chunks we've seen
    // (You'll need to keep track of this.maxIndexSeen in your tick function)
    for (let i = 0; i <= this.nextIndex; i++) {
      const chunk = await warehouse.getChunk(this.sessionId, i);
      if (chunk) blobParts.push(chunk);
    }

    // 3. Create the file
    const finalFile = new File(
      blobParts,
      `neighborhood_stream_${this.sessionId}.mp4`,
      { type: "video/mp4" },
    );

    // this.addLog("📦 File ready. Sending to Pinata...");

    // 4. Return the file so your component can call your IPFS upload function
    return finalFile;
  }

  async sweepWarehouse() {
    // 1. Check if the header is actually on the disk
    const header = await warehouse.getChunk(this.sessionId, -1);

    if (header) {
      //  this.addLog("🎯 Header found in Warehouse");

      // 2. iPhone Safety: Ensure we have a codec string
      if (!this.detectedMimeType) {
        this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
      }

      this.setupMagnet = "cached";

      // 3. If the door is open, build the tray (SourceBuffer)
      if (this.ms.readyState === "open" && !this.sb) {
        this.createSourceBuffer();
      }

      // 4. Kick the engine to start processing the header immediately
      this.tick();
    } else {
      // If header isn't found, we don't tick yet
      // The watchdog will call this again in 2 seconds
      console.log("⌛ Warehouse sweep: Header not found yet.");
    }
  }

  getThumbnailUrl() {
    return this.thumbnailUrl;
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      if (c.rotation && c.rotation !== 0) {
        this.rotation = c.rotation;
        this.video.style.transform = `rotate(${c.rotation}deg)`;
        this.video.style.transformOrigin = "center center";
        this.video.style.objectFit = "contain";
        this.addLog(`🔄 Applied rotation: ${c.rotation}°`);
      }
      if (c.thumbnailUrl && !this.thumbnailLoaded) {
        this.thumbnailUrl = c.thumbnailUrl;
        this.thumbnailLoaded = true;
        // this.addLog("🎨 Thumbnail found in chunk data");
      }
      // Handle Header
      if (c.chunkIndex === -1 && !this.headerLoaded) {
        this.setupMagnet = c.magnetLink;
        this.detectedMimeType =
          c.mimeType?.replace(/['"]+/g, '"') ||
          'video/mp4; codecs="mp4a.40.2, avc1.4d4015"'; // this.addLog("🎯 Header Found");
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
    if (this.ms.readyState !== "open") {
      await this.once(this.ms, "sourceopen");
    }
    // 1. Check if the "Gates" are open
    if (this.isProcessing) return; // Silent return is fine here

    if (
      this.sb &&
      this.sb.updating === false &&
      this.video.buffered.length > 0
    ) {
      // If the playhead is stuck at the end of the buffer, kick it!
      if (
        this.video.currentTime >=
        this.video.buffered.end(this.video.buffered.length - 1)
      ) {
        //  this.addLog("🥾 Buffer gap detected. Nudging playhead...");
        this.video.currentTime += 0.1;
      }
    }
    if (this.ms.readyState !== "open") {
      //  this.addLog(`⚠️ Tick Blocked: MediaSource is ${this.ms.readyState}`);
      return;
    }

    // Inside tick()
    if (!this.sb && this.detectedMimeType) {
      try {
        // 🔍 PROBE: Ask the iPhone if it actually supports this string
        const support = this.MS.isTypeSupported(this.detectedMimeType);
        // this.addLog(`🧪 Codec Probe (${this.detectedMimeType}): ${support}`);

        if (!support) {
          // If the iPhone hates the string, try the most common "Apple-Safe" fallback
          this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
          //  this.addLog("🔄 Switching to Apple-Safe Fallback codec");
        }

        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        // this.addLog("🛠️ SourceBuffer Created successfully");

        this.sb.addEventListener("updateend", () => {
          this.isProcessing = false;
          this.tick();
        });
      } catch (e) {
        // this.addLog("❌ SourceBuffer Fail: " + e.message);
      }
    }

    if (!this.sb) {
      // this.addLog("⚠️ Tick Blocked: No SourceBuffer created yet");
      return;
    }

    if (this.sb.updating) return;

    // 2. Process Header
    if (!this.headerLoaded) {
      const hasHeaderInWarehouse = await warehouse.getChunk(this.sessionId, -1);
      /* this.addLog(
        `🔍 Checking Header: Magnet=${!!this
          .setupMagnet}, Warehouse=${!!hasHeaderInWarehouse}`,
      );*/

      if (this.setupMagnet || hasHeaderInWarehouse) {
        this.isProcessing = true;
        try {
          const magnet = this.setupMagnet || "cached";
          const buf = await this.download(magnet, -1);
          if (buf) {
            this.sb.appendBuffer(buf);
            this.headerLoaded = true;
            this.nextIndex = 0;

            // ✅ Retry play with backoff
            const playWithRetry = (delay = 100) => {
              this.video.play().catch(() => {
                if (delay < 5000) {
                  setTimeout(() => playWithRetry(delay * 1.5), delay);
                }
              });
            };
            playWithRetry();

            this.addLog("✅ Engine Started - Header Appended");
          } else {
            this.isProcessing = false;
            //   this.addLog("❌ Header download returned null");
          }
        } catch (e) {
          //  this.addLog("❌ Header Error: " + e.message);
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
      this.nextIndex,
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
        // this.addLog(`🔍 Attempting to append Chunk ${this.nextIndex}...`);
        const buf = await this.download(magnet, this.nextIndex);

        if (buf) {
          // 🛑 SECONDARY SAFETY: Check one last time before appending
          if (!this.sb.updating) {
            this.sb.appendBuffer(buf);
            //  this.addLog(`🎬 Appended Chunk ${this.nextIndex}`);

            // 🔓 THE KEY: We only move to nextIndex after 'updateend' fires.
            // You already have a listener for this in createSourceBuffer()
            // that sets isProcessing = false and calls tick()
            this.nextIndex++;
          } else {
            this.isProcessing = false; // Release lock so it can try again
          }
        } else {
          this.isProcessing = false;
          //  this.addLog(`⚠️ Download returned empty for Chunk ${this.nextIndex}`);
        }
      } catch (e) {
        //  this.addLog(`❌ Chunk ${this.nextIndex} Append Error: ` + e.message);
        this.isProcessing = false;
      }
      return;
    } else if (this.headerLoaded) {
      // This log helps us see if the engine is "waiting" for a specific number
      //  this.addLog(`⏳ Engine idle: Waiting for Chunk ${this.nextIndex}`);
    }
  }

  async download(magnet, index) {
    // 1. Instant Check: Is it already in our local Warehouse?
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    // 2. Swarm Priority: Try WebTorrent
    this.addLog(`📡 Swarm search for Chunk ${index}...`);

    const p2pData = await new Promise(async (resolve) => {
      let handled = false;

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

      try {
        // Use the service instead of ensureWebTorrent
        const client = await webtorrentService.ensureClient();

        client.add(
          magnet,
          { announce: ["wss://tracker-0ad4cca9fd92.herokuapp.com"] },
          (torrent) => {
            torrent.on("done", () => {
              torrent.files[0].getBuffer(async (err, buf) => {
                if (!handled) {
                  handled = true;
                  clearTimeout(swarmTimeout);
                  this.addLog(`💎 Swarm delivered Chunk ${index}!`);
                  resolve(buf);
                }
                client.remove(torrent.infoHash);
              });
            });

            // Fast-fail if the tracker says no one has it
            torrent.on("warning", (err) => {
              if (err.message.includes("no peers")) {
                // We don't resolve null yet, let the 5s timeout handle it
                // to give DHT a chance, but we log it.
                this.addLog(`⚠️ Swarm Warning: ${err.message}`);
              }
            });
          },
        );
      } catch (e) {
        this.addLog("❌ WebTorrent Load Failed: " + e.message);
        resolve(null);
      }
    });

    if (p2pData) {
      this.addLog(`💎 P2P WIN: Saved $ by getting Chunk ${index} from Swarm!`);
      await warehouse.saveChunk(this.sessionId, index, p2pData);
      return p2pData;
    }

    // 3. Server Fallback (Remains the same...)
    // ... rest of your server fetch code
  }

  // Helper for the WebTorrent attempt
  tryWebTorrent = (magnet) => {
    return new Promise((resolve, reject) => {
      if (!magnet || magnet === "cached") return resolve(null);

      // Set a 5-second timeout for P2P before giving up to server
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

      // Use the service
      webtorrentService
        .ensureClient()
        .then((client) => {
          client.add(magnet, (torrent) => {
            torrent.on("done", () => {
              torrent.files[0].getBuffer((err, buf) => {
                clearTimeout(timeout);
                if (err) resolve(null);
                else resolve(buf);
                client.remove(torrent.infoHash);
              });
            });
          });
        })
        .catch(() => resolve(null));
    });
  };

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
// --- THE REACT COMPONENT ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  availableInWarehouse = [],
  onThumbnailLoaded,
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  // Replace your existing auto-join effect with this:
  useEffect(() => {
    // Auto-initialize when we have a sessionId
    const autoInitialize = async () => {
      if (!controllerRef.current && sessionId) {
        addLog("🚀 Auto-initializing player...");

        const controller = new StreamController(
          sessionId,
          addLog,
          () => { },
          containerRef.current,
          initialChunks,
        );

        controller.onThumbnailLoaded = (thumbnailUrl) => {
          setThumbnail(thumbnailUrl);
          if (onThumbnailLoaded) onThumbnailLoaded(thumbnailUrl);
        };

        if (containerRef.current) {
          containerRef.current.appendChild(controller.video);
        }

        controller.video.src = URL.createObjectURL(controller.ms);
        controllerRef.current = controller;

        // Set isJoined to true so existing effects work
        setIsJoined(true);

        if (initialChunks.length > 0) {
          initialChunks.forEach((chunk) => {
            if (chunk.thumbnailUrl && !thumbnail) {
              setThumbnail(chunk.thumbnailUrl);
              if (onThumbnailLoaded) onThumbnailLoaded(chunk.thumbnailUrl);
            }
          });
        }

        await controller.sweepWarehouse();
        addLog("✅ Auto-initialization complete.");
      }
    };

    autoInitialize();
  }, [sessionId]); // Only depend on sessionId

  // Try to get thumbnail from initial chunks
  useEffect(() => {
    if (initialChunks.length > 0) {
      initialChunks.forEach((chunk) => {
        if (chunk.thumbnailUrl && !thumbnail) {
          setThumbnail(chunk.thumbnailUrl);
          if (onThumbnailLoaded) onThumbnailLoaded(chunk.thumbnailUrl);
        }
      });
    }
  }, [initialChunks]);

  useEffect(() => {
    if (controllerRef.current && onThumbnailLoaded) {
      controllerRef.current.onThumbnailLoaded = (thumbnailUrl) => {
        setThumbnail(thumbnailUrl);
        if (onThumbnailLoaded) onThumbnailLoaded(thumbnailUrl);
      };
    }
  }, [onThumbnailLoaded]);

  useEffect(() => {
    if (isJoined && controllerRef.current) {
      controllerRef.current.forceTick();
    }
  }, [availableInWarehouse]);

  useEffect(() => {
    if (isJoined && controllerRef.current) {
      if (initialChunks.length > 0) {
        controllerRef.current.addChunks(initialChunks);
      }
      controllerRef.current.tick();
    }
  }, [isJoined, initialChunks, availableInWarehouse]);

  const handleJoinStream = async () => {
    addLog("🚀 Join Clicked: Waking up engine...");

    const controller = new StreamController(
      sessionId,
      addLog,
      () => {},
      initialChunks,
    );

    controller.onThumbnailLoaded = (thumbnailUrl) => {
      setThumbnail(thumbnailUrl);
      if (onThumbnailLoaded) onThumbnailLoaded(thumbnailUrl);
    };

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
      controller.video.disableRemotePlayback = true;
      controller.video.setAttribute("disableRemotePlayback", "");
    }

    controller.video.src = URL.createObjectURL(controller.ms);
    controllerRef.current = controller;
    setIsJoined(true);

    if (initialChunks.length > 0) {
      initialChunks.forEach((chunk) => {
        if (chunk.thumbnailUrl && !thumbnail) {
          setThumbnail(chunk.thumbnailUrl);
          if (onThumbnailLoaded) onThumbnailLoaded(chunk.thumbnailUrl);
        }
      });
    }

    await controller.sweepWarehouse();
    addLog("✅ Handshake complete. Playing from warehouse.");
  };

  return (
    <View style={styles.container}>
      <div ref={containerRef} style={styles.videoContainer} />

      {/* Remove the button overlay completely

      <View style={styles.logBox}>
        {logs.map((l, i) => (
          <Text key={i} style={styles.logText}>
            {l}
          </Text>
        ))}
      </View>
 */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#111",
    position: "relative",
  },
  videoContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#130720",
  },
  button: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: "-50%" }, { translateY: "-50%" }],
    width: "80%",
    height: "80%",
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 10,
  },
  buttonBackground: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  buttonOverlay: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonWithBackground: {
    backgroundColor: "rgba(21, 17, 89, 0.7)", // Semi-transparent overlay on thumbnail
  },
  buttonWithoutBackground: {
    backgroundColor: "#151159", // Solid color if no thumbnail
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 18,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 8,
  },
  logBox: {
    padding: 10,
    backgroundColor: "#222",
  },
  logText: {
    color: "#0f0",
    fontSize: 10,
    fontFamily: "monospace",
  },
});
