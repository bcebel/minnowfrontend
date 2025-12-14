// utils/NeighborhoodVideoReassembler.js
export class NeighborhoodVideoReassembler {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.client = window.globalWebTorrentClient || new WebTorrent();
    this.chunks = new Map(); // chunkIndex -> { blob, torrent }
    this.videoElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.isPlaying = false;

    if (!window.globalWebTorrentClient) {
      window.globalWebTorrentClient = this.client;
    }
  }

  // For live streams: start playing immediately, append new chunks as they arrive
  async startLivePlayback() {
    console.log(`🎥 Starting live playback for session: ${this.sessionId}`);

    // Create video player
    this.createVideoPlayer();

    // Subscribe to new chunks (you'll need to implement this based on your chat system)
    this.subscribeToNewChunks();

    // Load existing chunks
    const existingChunks = await this.fetchExistingChunks();
    await this.loadInitialChunks(existingChunks);

    this.isPlaying = true;
  }

  createVideoPlayer() {
    // Remove existing player
    const existing = document.getElementById("liveStreamPlayer");
    if (existing) existing.remove();

    // Create container
    const container = document.createElement("div");
    container.id = "liveStreamPlayer";
    container.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); z-index: 9998;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    `;

    // Create video element
    this.videoElement = document.createElement("video");
    this.videoElement.controls = true;
    this.videoElement.autoplay = true;
    this.videoElement.style.cssText = `
      width: 100%; max-width: 800px; max-height: 80vh;
      background: black; border: 3px solid #00ff00;
      border-radius: 8px;
    `;

    // Create MediaSource for live streaming
    this.mediaSource = new MediaSource();
    this.videoElement.src = URL.createObjectURL(this.mediaSource);

    // Status display
    const statusDiv = document.createElement("div");
    statusDiv.id = "streamStatus";
    statusDiv.style.cssText = `
      color: white; margin-top: 20px; text-align: center;
      font-family: monospace; background: rgba(0,0,0,0.7);
      padding: 10px; border-radius: 6px;
    `;
    statusDiv.innerHTML = `
      <div>🔴 <strong>LIVE STREAM</strong></div>
      <div>Chunks loaded: <span id="chunkCount">0</span></div>
      <div>Buffered: <span id="bufferedTime">0s</span></div>
      <div>Delay: <span id="streamDelay">Live</span></div>
    `;

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ CLOSE";
    closeBtn.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #ff4444; color: white; border: none;
      padding: 10px 20px; border-radius: 6px;
      font-weight: bold; cursor: pointer; z-index: 10000;
    `;
    closeBtn.onclick = () => {
      document.body.removeChild(container);
      this.stopPlayback();
    };

    container.appendChild(this.videoElement);
    container.appendChild(statusDiv);
    container.appendChild(closeBtn);
    document.body.appendChild(container);

    // Setup MediaSource
    this.mediaSource.addEventListener("sourceopen", () => {
      console.log("✅ MediaSource ready");
      this.sourceBuffer = this.mediaSource.addSourceBuffer(
        'video/webm; codecs="vp8,opus"'
      );
      this.sourceBuffer.mode = "sequence";

      this.sourceBuffer.addEventListener("updateend", () => {
        this.updateStatus();
      });
    });
  }

  async loadInitialChunks(chunkMessages) {
    // Sort by chunk index
    const sortedChunks = chunkMessages.sort(
      (a, b) => a.chunkIndex - b.chunkIndex
    );

    console.log(`📦 Loading ${sortedChunks.length} initial chunks`);

    // Download and append first few chunks quickly
    const initialChunks = sortedChunks.slice(0, 3);
    for (const chunkMsg of initialChunks) {
      await this.downloadAndAppendChunk(chunkMsg);
    }

    // Continue loading rest in background
    this.backgroundLoadChunks(sortedChunks.slice(3));
  }

  async downloadAndAppendChunk(chunkMessage) {
    return new Promise((resolve) => {
      this.client.add(chunkMessage.magnetLink, (torrent) => {
        console.log(`⬇️ Downloading chunk ${chunkMessage.chunkIndex}`);

        torrent.files[0].getBlob((err, blob) => {
          if (err) {
            console.error(
              `❌ Chunk ${chunkMessage.chunkIndex} download failed:`,
              err
            );
            resolve(null);
            return;
          }

          // Store chunk
          this.chunks.set(chunkMessage.chunkIndex, { blob, torrent });

          // Append to video if sourceBuffer is ready
          if (this.sourceBuffer && !this.sourceBuffer.updating) {
            this.appendBlobToVideo(blob);
          }

          this.updateStatus();
          resolve(blob);
        });
      });
    });
  }

  appendBlobToVideo(blob) {
    if (!this.sourceBuffer || this.sourceBuffer.updating) {
      // Buffer is busy, try again later
      setTimeout(() => this.appendBlobToVideo(blob), 100);
      return;
    }

    try {
      blob.arrayBuffer().then((buffer) => {
        this.sourceBuffer.appendBuffer(buffer);
      });
    } catch (error) {
      console.error("❌ Failed to append chunk:", error);
    }
  }

  subscribeToNewChunks() {
    // This depends on your chat implementation
    // Options:
    // 1. WebSocket subscription to new messages
    // 2. Polling the chat API
    // 3. Using your existing message subscription

    console.log("📡 Subscribing to new chunks...");

    // Example polling implementation
    this.pollingInterval = setInterval(async () => {
      const newChunks = await this.fetchNewChunks();
      for (const chunkMsg of newChunks) {
        if (!this.chunks.has(chunkMsg.chunkIndex)) {
          await this.downloadAndAppendChunk(chunkMsg);
        }
      }
    }, 2000); // Poll every 2 seconds
  }

  async fetchExistingChunks() {
    // Query your backend for chunks with this sessionId
    // This is a placeholder - implement based on your API
    try {
      const response = await fetch(`/api/chunks?sessionId=${this.sessionId}`);
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to fetch chunks:", error);
      return [];
    }
  }

  async fetchNewChunks() {
    // Get chunks since last known chunk index
    const lastIndex = Math.max(...Array.from(this.chunks.keys()), -1);
    try {
      const response = await fetch(
        `/api/chunks?sessionId=${this.sessionId}&since=${lastIndex}`
      );
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to fetch new chunks:", error);
      return [];
    }
  }

  backgroundLoadChunks(chunkMessages) {
    // Load remaining chunks in background
    chunkMessages.forEach((chunkMsg) => {
      if (!this.chunks.has(chunkMsg.chunkIndex)) {
        this.downloadAndAppendChunk(chunkMsg);
      }
    });
  }

  updateStatus() {
    const statusDiv = document.getElementById("streamStatus");
    if (!statusDiv) return;

    const chunkCount = this.chunks.size;
    const buffered = this.videoElement?.buffered.length
      ? this.videoElement.buffered.end(0) - this.videoElement.buffered.start(0)
      : 0;

    statusDiv.innerHTML = `
      <div>🔴 <strong>LIVE STREAM</strong></div>
      <div>Chunks loaded: <span id="chunkCount">${chunkCount}</span></div>
      <div>Buffered: <span id="bufferedTime">${buffered.toFixed(
        1
      )}s</span></div>
      <div>Delay: <span id="streamDelay">${
        buffered > 5 ? `${buffered.toFixed(0)}s` : "Live"
      }</span></div>
    `;
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    // Clean up torrents
    this.chunks.forEach(({ torrent }) => {
      torrent.destroy();
    });
  }
}
