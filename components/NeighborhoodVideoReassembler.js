export class NeighborhoodVideoReassembler {
  constructor(neighborhoodId) {
    this.neighborhoodId = neighborhoodId;
    this.client = null;
    this.chunkTorrents = new Map();
    this.reassembledBlobs = [];
    this.onChunkDownload = null; // Callback for progress
  }

  // 🆕 The core function for live MSE playback
  async startLivePlayback(sessionId, onChunkReady) {
    if (typeof window === "undefined") return;
    if (!this.client) await this.init();

    // 1. Create UI
    const container = this.createPlayerUI();
    const video = container.querySelector("video");
    const statusDiv = container.querySelector("#stream-status");

    // 2. Setup MSE with ManagedMediaSource detection
    const getMediaSourceClass = () => {
      if (typeof window.ManagedMediaSource !== "undefined") {
        console.log("📱 Using ManagedMediaSource (Safari)");
        return window.ManagedMediaSource;
      }
      if (typeof window.MediaSource !== "undefined") {
        console.log("🌐 Using standard MediaSource");
        return window.MediaSource;
      }
      throw new Error("MediaSource API is not supported in this browser.");
    };

    const MediaSourceClass = getMediaSourceClass();
    const mediaSource = new MediaSourceClass();
    video.src = URL.createObjectURL(mediaSource);

    let sourceBuffer = null;
    let isBuffering = false;
    let bufferQueue = [];

    mediaSource.addEventListener("sourceopen", () => {
      try {
        // 🛠️ Dynamic Codec Detection (iOS Safari requires MP4/H264; Chrome accepts WebM/VP8)
        const supportedTypes = [
          'video/mp4; codecs="mp4a.40.2, avc1.4d4015"',
          "video/mp4",
        ];

        const mimeType = supportedTypes.find((type) =>
          MediaSourceClass.isTypeSupported(type),
        );

        if (!mimeType) {
          statusDiv.textContent =
            "Error: Stream format not supported on this browser.";
          return;
        }

        console.log(`🎥 MSE initialized using format: ${mimeType}`);
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        statusDiv.textContent = "Waiting for first stream chunk...";

        sourceBuffer.addEventListener("updateend", () => {
          isBuffering = false;
          processBufferQueue();
        });
      } catch (error) {
        statusDiv.textContent = `MSE Error: ${error.message}`;
      }
    });

    // 3. Main buffering loop
    const processBufferQueue = async () => {
      if (
        isBuffering ||
        bufferQueue.length === 0 ||
        !sourceBuffer ||
        sourceBuffer.updating
      ) {
        return;
      }

      isBuffering = true;
      const nextChunk = bufferQueue.shift();

      try {
        statusDiv.textContent = `Downloading chunk ${nextChunk.chunkIndex}...`;
        const buffer = await this.downloadChunkBuffer(nextChunk);

        statusDiv.textContent = `Appending chunk ${nextChunk.chunkIndex}...`;
        sourceBuffer.appendBuffer(buffer);

        // Start playing live stream (must handle muted autoplay for browser permissions)
        if (video.paused) {
          video.play().catch((e) => {
            console.warn(
              "Autoplay blocked, muting video to enable playback:",
              e,
            );
            video.muted = true;
            video.play();
          });
        }
      } catch (error) {
        statusDiv.textContent = `Chunk Error: ${error.message}`;
        isBuffering = false;
      }
    };

    // 4. Expose append function for pub/sub subscription
    this.appendChunk = (chunkMessage) => {
      bufferQueue.push(chunkMessage);
      statusDiv.textContent = `New chunk ${chunkMessage.chunkIndex} received.`;
      processBufferQueue();
    };

    this.stopPlayback = () => {
      if (mediaSource.readyState === "open") {
        try {
          mediaSource.endOfStream();
        } catch (e) {}
      }
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
      const existingContainer = document.getElementById("liveStreamPlayer");
      if (existingContainer && existingContainer.parentNode) {
        existingContainer.parentNode.removeChild(existingContainer);
      }
    };

    return container;
  }

  // 🆕 Standalone Player UI Builder
  createPlayerUI() {
    // Remove existing player if already open
    const oldContainer = document.getElementById("liveStreamPlayer");
    if (oldContainer && oldContainer.parentNode) {
      oldContainer.parentNode.removeChild(oldContainer);
    }

    const container = document.createElement("div");
    container.id = "liveStreamPlayer";
    container.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.95); z-index: 9998;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 20px;
    `;

    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true; // Essential for iOS inline playback
    video.style.cssText = `
        width: 100%; max-width: 800px; max-height: 80vh;
        background: black; border: 2px solid #591155;
        border-radius: 8px; margin-bottom: 10px;
    `;

    const statusDiv = document.createElement("div");
    statusDiv.id = "stream-status";
    statusDiv.style.cssText = `
        color: white; margin-top: 20px; text-align: center;
        font-family: monospace; font-size: 14px;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ CLOSE PLAYER";
    closeBtn.style.cssText = `
        background: #151159; color: white; border: none;
        padding: 10px 20px; border-radius: 6px;
        font-weight: bold; cursor: pointer; margin-top: 20px;
    `;
    closeBtn.onclick = () => this.stopPlayback();

    container.appendChild(video);
    container.appendChild(statusDiv);
    container.appendChild(closeBtn);
    document.body.appendChild(container);

    return container;
  }

  // Download individual chunk arraybuffers
  async downloadChunkBuffer(message) {
    if (!this.client) await this.init();

    return new Promise((resolve, reject) => {
      let torrent = this.client.get(message.magnetLink);

      if (torrent) {
        if (torrent.files.length > 0) {
          torrent.files[0].getBuffer((err, buffer) => {
            if (err) return reject(err);
            resolve(buffer.buffer);
          });
        } else {
          torrent.once("ready", () => {
            torrent.files[0].getBuffer((err, buffer) => {
              if (err) return reject(err);
              resolve(buffer.buffer);
            });
          });
        }
        return;
      }

      this.client.add(message.magnetLink, (newTorrent) => {
        newTorrent.on("error", (err) => reject(err));

        newTorrent.once("ready", () => {
          const file = newTorrent.files[0];
          file.getBuffer((err, buffer) => {
            if (err) return reject(err);
            resolve(buffer.buffer);
          });
        });
      });
    });
  }

  // Initialize WebTorrent Client
  async init() {
    if (typeof window === "undefined") return;

    if (!window.WebTorrent) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    if (!this.client) {
      this.client = new window.WebTorrent();
    }
  }

  // Merge Chunks into a single static Blob (for archive viewing)
  mergeAvailableChunks() {
    const orderedChunks = Array.from(this.chunkTorrents.entries())
      .sort(([indexA], [indexB]) => indexA - indexB)
      .map(([_, data]) => data.blob);

    return new Blob(orderedChunks, { type: "video/mp4" });
  }

  destroy() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.chunkTorrents.clear();
    this.reassembledBlobs = [];
  }
}
