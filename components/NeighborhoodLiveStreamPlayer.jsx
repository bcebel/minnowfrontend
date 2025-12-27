import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
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
    
    this.sessionId = sessionId;
    this.triggerFetch = triggerFetch;
    this.setupMagnet = setupMagnet;
    this.addLog = addLog;
    this.client = window.globalWebTorrentClient;
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.chunkBuffer = new Map();
    this.trackers = [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.fastcast.nz",
    ];

    this.ms = new MediaSource();
        this.sb = null;
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.controls = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.width = "100%";
    this.video.src = URL.createObjectURL(this.ms);

    this.ms.addEventListener("sourceopen", () => {
      this.sb = this.ms.addSourceBuffer('video/webm; codecs="vp8,opus"');
      this.sb.mode = "sequence";
      this.addLog("MSE Ready");
      this.tick();
 this.watchdog = setInterval(() => {
      if (this.chunkBuffer.size === 0 && !this.isProcessing) {
        console.log(`🤖 Autonomous Player: Buffer empty. Searching for #${this.nextIndex}...`);
        this.triggerFetch(); // Forces the GraphQL Query to refresh
      }
    }, 3000); // Check every 3 seconds

    });
  } 

  // Remember to clean up!
  destroy() {
    clearInterval(this.watchdog);
    // ... rest of destroy ...
  }

  

  
  addChunks(chunks) {
    // 1. Only add chunks we don't already have and haven't played yet
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
    if (!this.sb || this.sb.updating || this.isProcessing) return;
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
        this.sb.appendBuffer(buf);
        this.addLog(`Appended #${this.nextIndex}`);
        this.chunkBuffer.delete(this.nextIndex);
        this.nextIndex++;
      } catch (e) {
        if (e.message.includes("duplicate")) this.nextIndex++;
        else this.addLog("Download Error");
      } finally {
        this.isProcessing = false;
        this.tick();
      }
    }
  }

  download(magnet) {
    return new Promise((resolve, reject) => {
      const existing = this.client.get(magnet);
      if (existing && existing.done) {
        existing.files[0].getBuffer((err, buf) =>
          err ? reject(err) : resolve(buf)
        );
        return;
      }
      this.client.add(magnet, { announce: this.trackers }, (torrent) => {
        torrent.on("done", () => {
          torrent.files[0].getBuffer((err, buf) => {
            this.client.remove(torrent.infoHash);
            err ? reject(err) : resolve(buf);
          });
        });
        torrent.on("error", (err) => {
          this.client.remove(torrent.infoHash);
          reject(err);
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

    if (containerRef.current) {
      containerRef.current.appendChild(controller.video);
    }

    return () => controller.destroy();
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
      <div
        ref={containerRef}
        style={{ width: "100%", backgroundColor: "#000" }}
      />
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
  container: { width: "100%", backgroundColor: "#111" },
  logBox: { padding: 10, backgroundColor: "#222" },
  logText: { color: "#0f0", fontSize: 10, fontFamily: "monospace" },
});
