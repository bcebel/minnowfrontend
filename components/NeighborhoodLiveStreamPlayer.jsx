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
      sessionId
    }
  }
`;
// --- THE NON-REACT CONTROLLER ---
class StreamController {
  constructor(sessionId, setupMagnet, addLog, triggerFetch) {
    if (!window.globalWebTorrentClient) {
      this.addLog("🧰 Creating missing Torrent Client...");
      window.globalWebTorrentClient = new window.WebTorrent();
    }
    this.client = window.globalWebTorrentClient;
    // 1. Prioritize ManagedMediaSource
    this.MS = window.ManagedMediaSource || window.MediaSource;

    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.setupMagnet = setupMagnet;
    this.addLog = addLog;
    this.client = window.globalWebTorrentClient;
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.streamingAllowed = true; // Minimal flag for iPhone flow
    this.chunkBuffer = new Map();
    this.trackers = [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.fastcast.nz",
    ];

    this.ms = new this.MS();
    this.sb = null;
    this.video = document.createElement("video");

    // --- MINIMAL IPHONE REQS ---
    this.video.disableRemotePlayback = true; // Key #1: Unlocks MMS on iOS
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.muted = true;
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.objectFit = "contain";
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("controls", "true");
    this.video.preload = "auto";
    this.video.src = URL.createObjectURL(this.ms);
    this.video.style.zIndex = "1";
    this.video.style.position = "absolute";
    this.video.style.top = "0";
    this.video.style.left = "0";
    this.video.setAttribute("webkit-playsinline", "true"); // Older iOS fix
    this.video.style.visibility = "visible";
    this.video.style.opacity = "1";

    // Key #3: Minimal Start/Stop listeners
    this.ms.addEventListener("startstreaming", () => {
      this.streamingAllowed = true;
      this.tick();
    });
    this.ms.addEventListener("endstreaming", () => {
      this.streamingAllowed = false;
    });

    // Detect correct open event
    const openEvt = window.ManagedMediaSource
      ? "managedsourceopen"
      : "sourceopen";
    this.ms.addEventListener(openEvt, () => {
      try {
        this.sb = this.ms.addSourceBuffer(
          'video/mp4; codecs="avc1.4d401f, mp4a.40.2"'
        );
        this.sb.mode = "sequence";
        this.addLog("MSE Ready");
        this.tick();

        this.watchdog = setInterval(() => {
          if (this.chunkBuffer.size === 0 && !this.isProcessing) {
            this.triggerFetch();
          }
        }, 3000);
      } catch (e) {
        this.addLog("Codec Error: Likely iOS vs WebM");
      }
    });
  }

  unlock() {
    this.addLog("Attempting manual unlock...");
    this.video
      .play()
      .then(() => this.addLog("Playback unblocked!"))
      .catch((err) => this.addLog("Unlock failed: " + err.message));
  }
  // Remember to clean up!
  destroy() {
    clearInterval(this.watchdog);
    // ... rest of destroy ...
  }

  addChunks(chunks) {
    if (chunks.length > 0) {
      // Log the first chunk only once to investigate its "DNA"
      const first = chunks[0];
      console.log("🕵️ Chunk Investigation:", {
        mimeType: first.mimeType,
        fileType: first.fileType,
        fullObject: first, // This lets you click it in console to see all keys
      });
    }

    chunks.forEach((c) => {
      if (
        c.chunkIndex >= this.nextIndex &&
        !this.chunkBuffer.has(c.chunkIndex)
      ) {
        this.chunkBuffer.set(c.chunkIndex, c);
      }
    });

    console.log(
      `📥 Buffer Status: Have [${Array.from(
        this.chunkBuffer.keys()
      )}], Need: #${this.nextIndex}`
    );

    // 2. If we don't have the current index but have higher ones, JUMP.
    if (!this.chunkBuffer.has(this.nextIndex) && this.chunkBuffer.size > 0) {
      const available = Array.from(this.chunkBuffer.keys()).sort(
        (a, b) => a - b
      );
      const nextAvailable = available.find((i) => i > this.nextIndex);
      if (nextAvailable) {
        console.log(
          `⏩ Skipping missing chunk ${this.nextIndex} -> moving to ${nextAvailable}`
        );
        this.nextIndex = nextAvailable;
      }
    }
    this.tick();
  }

  async tick() {
    if (
      !this.sb ||
      this.sb.updating ||
      this.isProcessing ||
      !this.streamingAllowed
    )
      return;

    // Inside tick()
    console.log(
      `Current NextIndex: ${this.nextIndex}, Buffer Size: ${this.chunkBuffer.size}`
    );
    // 1. Setup Header
    if (this.setupMagnet && !this.headerLoaded) {
      this.isProcessing = true;
      try {
        const buf = await this.download(this.setupMagnet);
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
        this.addLog("Headers Appended");
      } catch (e) {
        this.addLog("Header Error");
      } finally {
        this.isProcessing = false;
        this.tick();
      }
      return;
    }
    const isPlaying = !this.video.paused && !this.video.ended;
    if (!isPlaying && this.chunkBuffer.size < 1 && this.nextIndex > 0) {
      console.log(`⏳ Warming up buffer... (${this.chunkBuffer.size}/1)`);
      return;
    }
    // 2. Find Next Chunk (with jump-ahead logic)
    let chunk = this.chunkBuffer.get(this.nextIndex);

    if (!chunk && this.chunkBuffer.size > 0) {
      const indices = Array.from(this.chunkBuffer.keys()).sort((a, b) => a - b);
      const nextAvailable = indices.find((i) => i > this.nextIndex);
      if (nextAvailable) {
        this.addLog(`⏩ Skipping to #${nextAvailable}`);
        this.nextIndex = nextAvailable;
        this.tick();
        return;
      }
    }

    if (chunk) {
      this.isProcessing = true;
      this.addLog(`Fetching #${this.nextIndex}...`);
      try {
        const buf = await this.download(chunk.magnetLink);

        // 1. Append the data to the source buffer immediately
        this.sb.appendBuffer(buf);
        this.addLog(`Appended #${this.nextIndex}`);

        // 2. CHECK THE CUSHION:
        // We only trigger .play() if we have a few seconds banked
        // OR if we are already playing.
        const bufferDuration =
          this.video.buffered.length > 0
            ? this.video.buffered.end(0) - this.video.currentTime
            : 0;

        if (bufferDuration > 2 && this.video.paused) {
          this.addLog("Buffer healthy - Starting Playback");
          this.video.play().catch(() => this.addLog("Tap to play"));
        }

        this.chunkBuffer.delete(this.nextIndex);
        this.nextIndex++;
      } catch (e) {
        if (e.message?.includes("duplicate")) {
          this.nextIndex++;
        } else {
          this.addLog("Append Error: " + e.message);
        }
      } finally {
        this.isProcessing = false;
        // 3. Keep the engine turning
        setTimeout(() => this.tick(), 100);
      }
    }
  }

  download(magnet) {
    return new Promise((resolve, reject) => {
      this.addLog("🧲 Attempting P2P Fetch...");

      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
        this.addLog("📡 Peer Search Started...");

        torrent.on("wire", (wire) => {
          this.addLog("🤝 Connected to a Peer!");
        });

        torrent.on("done", () => {
          this.addLog("✅ Chunk Downloaded!");
          torrent.files[0].getBuffer((err, buf) => {
            this.client.remove(torrent.infoHash);
            err ? reject(err) : resolve(buf);
          });
        });
      });
    });
  }

  destroy() {
    if (this.video.src) URL.revokeObjectURL(this.video.src);
    this.video.remove();
  }
}

// --- THE REACT WRAPPER ---
export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  setupMagnet,
  initialChunks = [], // Chunks coming from the parent (Livestream.tsx)
}) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const [logs, setLogs] = useState([]);
const [isPlaying, setIsPlaying] = useState(false);
  // 1. THE AUTONOMOUS PULL: This query can be refetched manually
  const { data, refetch } = useQuery(GET_STREAM_CHUNKS, {
    variables: { sessionId },
    notifyOnNetworkStatusChange: true,
  });

  const addLog = (msg) => {
    setLogs((prev) => [...prev.slice(-5), msg]);
    console.log(`[Stream] ${msg}`);
  };

  // 2. INITIALIZE CONTROLLER
  useEffect(() => {
    const controller = new StreamController(
      sessionId,
      setupMagnet,
      addLog,
      () => {
        addLog("🤖 Watchdog: Pulling fresh data...");
        refetch();
      }
    );
    controllerRef.current = controller;

    window.controller = controller;

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    return () => {
      delete window.controller; // Clean up on unmount
      controller.destroy();
    };
  }, [sessionId]);

  

  // 3. MERGE DATA SOURCES: Listen to both Parent Props AND Local Query Refetch
  useEffect(() => {
    const allChunks = [...initialChunks];

    // If our autonomous query found chunks, add them to the list
    if (data?.streamChunks) {
      allChunks.push(...data.streamChunks);
    }

    if (allChunks.length > 0 && controllerRef.current) {
      controllerRef.current.addChunks(allChunks);
    }
  }, [initialChunks, data]);

return (
  <View style={styles.container}>
    {/* 1. Fixed Aspect Ratio Container */}
    <div
      ref={containerRef}
      style={{
        width: "100%",
        position: "relative",
        backgroundColor: "#000",
        aspectRatio: "16/9", // Keeps it standard landscape
        overflow: "hidden",
        display: "block" // Ensures it's not a flex-child that might shrink
      }}
    />

    {/* 2. The Interaction Overlay */}
    {!isPlaying && (
      <TouchableOpacity 
        onPress={() => {
          controllerRef.current?.unlock();
          setIsPlaying(true);
        }}
        style={styles.bigJoinButton}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
          🔴 JOIN LIVE STREAM
        </Text>
      </TouchableOpacity>
    )}

    {/* 3. Keep logs minimal (or comment them out for the stress test) */}
    {/* <View style={styles.logBox}>...</View> */}
  </View>
);

}

const styles = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#111" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
