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

  unlock(onSuccess) {
    this.addLog("Attempting manual unlock...");
    this.video
      .play()
      .then(() => {
        this.addLog("Playback unblocked!");
        if (onSuccess) onSuccess(); // This will hide the button in React
      })
      .catch((err) => this.addLog("Unlock failed: " + err.message));
  }
  // Remember to clean up!
  destroy() {
    clearInterval(this.watchdog);
    // ... rest of destroy ...
  }

  addChunks(chunks) {
    chunks.forEach((c) => {
      // 🕵️ Check if this is the header based on TYPE, not just index
      if (c.fileType === "video_header" && !this.headerLoaded) {
        this.addLog("🗂️ Header Magnet Found!");
        this.setupMagnet = c.magnetLink;
        this.detectedMimeType = c.mimeType;
      }

      // Standard chunk logic
      if (c.fileType === "video_chunk" && c.chunkIndex >= this.nextIndex) {
        if (!this.chunkBuffer.has(c.chunkIndex)) {
          this.chunkBuffer.set(c.chunkIndex, c);
        }
      }
    });
    this.tick();
  }

  async tick() {
    if (this.sb?.updating || this.isProcessing || !this.streamingAllowed)
      return;

    // 1. INITIALIZE SOURCE BUFFER (Wait for Header/MimeType)
    if (!this.sb && this.ms.readyState === "open" && this.detectedMimeType) {
      try {
        this.addLog(`Initializing Buffer: ${this.detectedMimeType}`);
        this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
        this.sb.mode = "sequence";
      } catch (e) {
        this.addLog("Incompatible Codec: " + this.detectedMimeType);
        return;
      }
    }

    if (!this.sb) return;

    // 2. LOAD THE HEADER FIRST
    if (this.setupMagnet && !this.headerLoaded) {
      this.isProcessing = true;
      try {
        const buf = await this.download(this.setupMagnet);
        this.sb.appendBuffer(buf);
        this.headerLoaded = true;
        this.addLog("✅ Header Segment Appended");
      } catch (e) {
        this.addLog("❌ Header Download Failed");
      } finally {
        this.isProcessing = false;
        this.tick();
      }
      return;
    }

    // 3. LOAD VIDEO CHUNKS
    let chunk = this.chunkBuffer.get(this.nextIndex);
    if (chunk) {
      this.isProcessing = true;
      try {
        const buf = await this.download(chunk.magnetLink);
        this.sb.appendBuffer(buf);

        // Auto-play logic once we have some data
        if (this.video.paused && this.nextIndex > 2) {
          this.video
            .play()
            .catch(() => this.addLog("User interaction required"));
        }

        this.chunkBuffer.delete(this.nextIndex);
        this.nextIndex++;
      } catch (e) {
        this.addLog("Fetch Error: " + this.nextIndex);
      } finally {
        this.isProcessing = false;
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
            //         this.client.remove(torrent.infoHash);
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
    
    // Create the controller ONLY on user tap
    const controller = new StreamController(
      sessionId,
      setupMagnet,
      addLog,
      () => refetch()
    );

    controllerRef.current = controller;
    window.controller = controller; // Force leak to window for debugging

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    setIsJoined(true);
  };

  // 2. DATA HAND-OFF
  useEffect(() => {
    if (isJoined && controllerRef.current) {
      const allChunks = [...initialChunks, ...(data?.streamChunks || [])];
      if (allChunks.length > 0) {
        controllerRef.current.addChunks(allChunks);
      }
    }
  }, [isJoined, initialChunks, data]);

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
          display: isJoined ? "block" : "none" // Hide until joined
        }}
      />

      {!isJoined && (
        <TouchableOpacity 
          onPress={handleJoinStream}
          style={styles.bigJoinButton}
        >
          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
            🔴 JOIN LIVE STREAM
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.logBox}>
        {logs.map((log, i) => (
          <Text key={i} style={styles.logText}>{log}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#111" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
