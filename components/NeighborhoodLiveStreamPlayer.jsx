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

class StreamController {
  constructor(sessionId, addLog, triggerFetch, container) {
    this.prefetchQueue = [];
    this.prefetching = false;
    this.bufferQueue = [];
    this.isProcessingQueue = false;

    this.container = container;
    this.addLog = addLog;
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.thumbnailUrl = null;
    this.thumbnailLoaded = false;

    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.chunkQueue = new Map();
    this.setupMagnet = null;
    this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
    this.CHUNK_DURATION = 8;

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

    this.video = document.createElement("video");
    this.video.controls = false;
    this.video.disableRemotePlayback = true;
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
    this.video.controls = false;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.backgroundColor = "black";
    this.video.poster = "";
    this.wrapper.style.transformOrigin = "center center";
    this.wrapper.appendChild(this.video);

    if (window.ManagedMediaSource) {
      this.video.setAttribute("disableRemotePlayback", "true");
    }
    this.fetchThumbnailFromStreamChunk = async () => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/stream-chunk/thumbnail/${sessionId}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.thumbnailUrl) {
            this.thumbnailUrl = data.thumbnailUrl;
            this.thumbnailLoaded = true;
            this.addLog("✅ Thumbnail loaded from StreamChunk");

            if (this.onThumbnailLoaded) {
              this.onThumbnailLoaded(this.thumbnailUrl);
            }
            return true;
          }
        }
      } catch (error) {
        // quiet fail
      }
      return false;
    };

    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      this.addLog(`✅ ${openEvt} fired!`);
      this.sweepWarehouse();
    });

    this.watchdog = setInterval(async () => {
      if (!this.headerLoaded) {
        // waiting
      } else if (!this.isProcessing) {
        const nextData = await warehouse.getChunk(
          this.sessionId,
          this.nextIndex,
        );
        if (nextData) {
          this.tick();
        }
      }
    }, 2000);
  }

  processBufferQueue() {
    if (this.bufferQueue.length === 0 || !this.sb || this.sb.updating) return;
    const nextBuffer = this.bufferQueue.shift();
    try {
      this.sb.appendBuffer(nextBuffer);
    } catch (e) {
      console.error(e);
    }
  }

  async prefetchChunks() {
    if (this.prefetching) return;
    this.prefetching = true;
    const nextIndex = this.nextIndex;
    const maxPrefetch = 5;

    for (let i = nextIndex; i < nextIndex + maxPrefetch; i++) {
      if (!this.chunkQueue.has(i)) {
        const chunk = await warehouse.getChunk(this.sessionId, i);
        if (chunk) {
          this.chunkQueue.set(i, "cached");
          this.prefetchQueue.push({ buffer: chunk, chunkIndex: i });
          this.addLog(`📥 Prefetched chunk ${i}`);
        }
      }
    }
    this.prefetching = false;
    this.processBufferQueue();
  }

  async once(element, event) {
    return new Promise((resolve) => {
      element.addEventListener(event, resolve, { once: true });
    });
  }

  cleanupResources() {
    clearInterval(this.watchdog);
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.load();
      this.video.removeAttribute("src");
      this.video.remove();
    }
    if (this.ms && this.ms.readyState === "open") {
      try {
        this.ms.endOfStream();
      } catch (e) {}
    }
    if (this.sb) {
      try {
        this.ms.removeSourceBuffer(this.sb);
      } catch (e) {}
    }
    this.chunkQueue.clear();
  }

  forceTick() {
    this.tick();
  }

  createSourceBuffer() {
    if (this.sb || !this.detectedMimeType || this.ms.readyState !== "open")
      return;
    try {
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
        this.tick();
      });
    } catch (e) {
      if (
        this.detectedMimeType !== 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"'
      ) {
        this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
        this.createSourceBuffer();
      }
    }
  }

  async stitchAndShip() {
    const blobParts = [];
    const header = await warehouse.getChunk(this.sessionId, -1);
    if (!header) return;
    blobParts.push(header);

    for (let i = 0; i <= this.nextIndex; i++) {
      const chunk = await warehouse.getChunk(this.sessionId, i);
      if (chunk) blobParts.push(chunk);
    }
    return new File(blobParts, `neighborhood_stream_${this.sessionId}.mp4`, {
      type: "video/mp4",
    });
  }

  async sweepWarehouse() {
    const header = await warehouse.getChunk(this.sessionId, -1);
    if (header) {
      if (!this.detectedMimeType) {
        this.detectedMimeType = 'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
      }
      this.setupMagnet = "cached";
      if (this.ms.readyState === "open" && !this.sb) this.createSourceBuffer();
      this.tick();
    }
  }

  getThumbnailUrl() {
    return this.thumbnailUrl;
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      if (c.chunkIndex === -1 && c.rotation) {
        const rot = c.rotation;
        this.addLog(`🔄 Applying CSS rotation: ${rot}°`);
        if (rot === 90 || rot === 270) {
          this.video.style.transform = `rotate(${rot}deg)`;
          this.video.style.transformOrigin = "center center";
          this.video.style.objectFit = "contain";
          this.video.style.width = "100%";
          this.video.style.height = "100%";
        }
      }
      if (c.thumbnailUrl && !this.thumbnailLoaded) {
        this.thumbnailUrl = c.thumbnailUrl;
        this.thumbnailLoaded = true;
      }
      if (c.chunkIndex === -1 && !this.headerLoaded) {
        this.setupMagnet = c.magnetLink;
        this.detectedMimeType =
          c.mimeType?.replace(/['"]+/g, '"') ||
          'video/mp4; codecs="mp4a.40.2, avc1.4d4015"';
        if (this.ms.readyState === "open") this.createSourceBuffer();
      }
      if (c.chunkIndex >= 0) this.chunkQueue.set(c.chunkIndex, c.magnetLink);
    });
    this.tick();
  }

  async tick() {
    if (this.isProcessing) return;
    if (this.ms.readyState !== "open") await this.once(this.ms, "sourceopen");
    if (this.sb?.updating) return;

    if (!this.sb && this.detectedMimeType) {
      try {
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
        this.sb.addEventListener("updateend", () => {
          this.isProcessing = false;
          this.processBufferQueue();
          this.tick();
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (!this.sb || this.sb.updating) return;

    if (!this.headerLoaded) {
      const hasHeaderInWarehouse = await warehouse.getChunk(this.sessionId, -1);
      if (this.setupMagnet || hasHeaderInWarehouse) {
        this.isProcessing = true;
        try {
          const magnet = this.setupMagnet || "cached";
          const buf = await this.download(magnet, -1);
          if (buf) {
            this.sb.appendBuffer(buf);
            this.headerLoaded = true;
            this.nextIndex = 0;
            const tryPlay = (delay = 100) => {
              this.video.play().catch(() => {
                if (delay < 5000) {
                  this.video.currentTime += 0.1;
                  setTimeout(() => tryPlay(delay * 1.5), delay);
                }
              });
            };
            tryPlay();
          } else {
            this.isProcessing = false;
          }
        } catch (e) {
          this.isProcessing = false;
        }
        return;
      }
    }

    const hasInQueue = this.chunkQueue.has(this.nextIndex);
    const hasInWarehouse = await warehouse.getChunk(
      this.sessionId,
      this.nextIndex,
    );

    if (this.headerLoaded && (hasInQueue || hasInWarehouse)) {
      this.isProcessing = true;
      const magnet = hasInWarehouse
        ? "cached"
        : this.chunkQueue.get(this.nextIndex);
      try {
        const buf = await this.download(magnet, this.nextIndex);
        if (buf && !this.sb.updating) {
          this.sb.appendBuffer(buf);
          this.nextIndex++;
        } else {
          this.isProcessing = false;
        }
      } catch (e) {
        this.isProcessing = false;
      }
    }
  }

  async download(magnet, index) {
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    return new Promise(async (resolve) => {
      let handled = false;
      const swarmTimeout = setTimeout(() => {
        if (!handled) {
          handled = true;
          resolve(null);
        }
      }, 5000);

      if (!magnet || magnet === "cached") {
        clearTimeout(swarmTimeout);
        return resolve(null);
      }

      try {
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
                  resolve(buf);
                }
                client.remove(torrent.infoHash);
              });
            });
          },
        );
      } catch (e) {
        resolve(null);
      }
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

export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  availableInWarehouse = [],
  onThumbnailLoaded,
  rotation = 0,
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [logs, setLogs] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  useEffect(() => {
    const autoInitialize = async () => {
      if (!controllerRef.current && sessionId) {
        addLog("🚀 Auto-initializing player...");

        const controller = new StreamController(
          sessionId,
          addLog,
          () => {},
          containerRef.current,
        );

        controller.onThumbnailLoaded = (thumbnailUrl) => {
          setThumbnail(thumbnailUrl);
          if (onThumbnailLoaded) onThumbnailLoaded(thumbnailUrl);
        };

        const vEl = controller.video;
        const syncTime = () => setCurrentTime(vEl.currentTime);
        const syncDuration = () => setDuration(vEl.duration || 0);
        const syncPlayState = () => setIsPlaying(!vEl.paused);

        vEl.addEventListener("timeupdate", syncTime);
        vEl.addEventListener("durationchange", syncDuration);
        vEl.addEventListener("play", syncPlayState);
        vEl.addEventListener("pause", syncPlayState);

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
        addLog("✅ Auto-initialization complete.");
      }
    };

    autoInitialize();

    return () => {
      if (controllerRef.current) {
        controllerRef.current.cleanupResources();
        controllerRef.current = null;
      }
    };
  }, [sessionId]);

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

  const skipTime = (seconds) => {
    if (controllerRef.current?.video) {
      controllerRef.current.video.currentTime += seconds;
    }
  };

  const togglePlay = () => {
    if (controllerRef.current?.video) {
      const video = controllerRef.current.video;
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  };

  const handleScrubChange = (e) => {
    if (controllerRef.current?.video) {
      const newTargetTime = parseFloat(e.target.value);
      controllerRef.current.video.currentTime = newTargetTime;
      setCurrentTime(newTargetTime);
    }
  };

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          ...styles.videoContainer,
          transform: rotation ? `rotate(${rotation}deg)` : "none",
          transformOrigin: "center center",
          width: "100%",
          height: "100%",
        }}
      />

      <div style={styles.controlsOverlay}>
        <div style={styles.buttonCluster}>
          <button style={styles.controlButton} onClick={() => skipTime(-10)}>
            <span style={styles.controlButtonText}>⏪</span>
          </button>

          <button style={styles.controlButton} onClick={togglePlay}>
            <span style={styles.controlButtonText}>
              {isPlaying ? "⏸" : "▶"}
            </span>
          </button>

          <button style={styles.controlButton} onClick={() => skipTime(10)}>
            <span style={styles.controlButtonText}>⏩</span>
          </button>
        </div>

        <div style={styles.timelineWrapper}>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleScrubChange}
            style={styles.scrubBarInput}
          />
        </div>
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "80%",
    height: "80%",
    aspectRatio: 1,
    backgroundColor: "#000",
    position: "relative",
    overflow: "hidden",
  },
  videoContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#130720",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsOverlay: {
    position: "absolute",
    bottom: 25,
    left: 20,
    right: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: 15,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    zIndex: 999,
  },
  buttonCluster: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 25,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    cursor: "pointer",
  },
  controlButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  timelineWrapper: {
    width: "100%",
    paddingHorizontal: 10,
    display: "flex",
    alignItems: "center",
  },
  scrubBarInput: {
    width: "100%",
    cursor: "pointer",
    accentColor: "#ffffff",
  },
});
