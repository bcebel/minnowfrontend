export class NeighborhoodVideoReassembler {
  constructor(neighborhoodId) {
    this.neighborhoodId = neighborhoodId;
    this.client = null;
    this.chunkTorrents = new Map();
    this.reassembledBlobs = [];
    this.onChunkDownload = null; // Callback for progress
  }


  // 🆕 NEW: Function to create the standalone player UI
  createPlayerUI() {
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
    video.autoplay = true;
    video.style.cssText = `
        width: 100%; max-width: 800px; max-height: 80vh;
        background: black; border: 2px solid #00ff00;
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
        background: #ff4444; color: white; border: none;
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

  // Ensure the necessary utility function is present:
  /*
async downloadChunkBuffer(message) { ... } // (As provided in previous response)
*/
  async downloadChunkBuffer(message) {
    if (!this.client) await this.init();

    return new Promise((resolve, reject) => {
      // 1. Check if torrent already exists (avoid adding duplicates)
      let torrent = this.client.get(message.magnetLink);

      if (torrent) {
        console.log(
          `♻️ Reusing existing torrent for chunk ${message.chunkIndex}`
        );
        if (torrent.files.length > 0) {
          // Already ready, get buffer
          torrent.files[0].getBuffer((err, buffer) => {
            if (err) return reject(err);
            resolve(buffer.buffer); // Resolve with ArrayBuffer
          });
        } else {
          // Wait for file metadata (unlikely for a small chunk but safe)
          torrent.once("ready", () => {
            torrent.files[0].getBuffer((err, buffer) => {
              if (err) return reject(err);
              resolve(buffer.buffer);
            });
          });
        }
        return;
      }

      // 2. Add new torrent
      this.client.add(message.magnetLink, (newTorrent) => {
        newTorrent.on("error", (err) => {
          console.error(`Torrent error for chunk ${message.chunkIndex}:`, err);
          reject(err);
        });

        newTorrent.once("ready", () => {
          const file = newTorrent.files[0];
          console.log(
            `⬇️ Downloading chunk ${message.chunkIndex} (${file.length} bytes)`
          );

          file.getBuffer((err, buffer) => {
            if (err) return reject(err);
            console.log(`✅ Downloaded chunk ${message.chunkIndex}`);
            resolve(buffer.buffer); // Return ArrayBuffer
          });
        });
      });
    });
  }
  // Initialize WebTorrent
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

    this.client = new window.WebTorrent();
  }

  // Main function to watch a chunked video
  async watchNeighborhoodVideo(chunkMessages) {
    if (!this.client) await this.init();

    const totalChunks = chunkMessages.length;
    let downloaded = 0;

    // Download all chunks in parallel
    const downloadPromises = chunkMessages.map(async (message) => {
      return new Promise((resolve) => {
        this.client.add(message.magnetLink, (torrent) => {
          console.log(
            `⬇️ Downloading chunk ${message.chunkIndex + 1}/${totalChunks}`
          );

          torrent.files[0].getBlob((err, blob) => {
            if (err) {
              console.error("Chunk download error:", err);
              resolve(null);
              return;
            }

            // Store chunk
            this.chunkTorrents.set(message.chunkIndex, {
              blob,
              torrent,
              index: message.chunkIndex,
            });

            downloaded++;
            if (this.onChunkDownload) {
              this.onChunkDownload(downloaded, totalChunks);
            }

            resolve(blob);
          });
        });
      });
    });

    await Promise.all(downloadPromises);
    console.log("✅ All chunks downloaded!");

    // Reassemble in order
    return this.mergeAllChunks();
  }

  // Progressive playback (starts after 2 chunks)
  async watchProgressive(chunkMessages, onProgress) {
    if (!this.client) await this.init();

    // Sort chunks by index
    const sortedMessages = [...chunkMessages].sort(
      (a, b) => a.chunkIndex - b.chunkIndex
    );

    // Download first 2 chunks immediately
    for (let i = 0; i < Math.min(2, sortedMessages.length); i++) {
      await this.downloadChunk(sortedMessages[i]);
      if (onProgress) onProgress(i + 1, sortedMessages.length);
    }

    // Return a blob for immediate playback
    let currentBlob = this.mergeAvailableChunks();

    // Continue downloading rest in background
    this.downloadRemainingChunks(sortedMessages.slice(2), onProgress);

    return currentBlob;
  }

  async downloadChunk(message) {
    return new Promise((resolve) => {
      this.client.add(message.magnetLink, (torrent) => {
        torrent.files[0].getBlob((err, blob) => {
          if (!err) {
            this.chunkTorrents.set(message.chunkIndex, {
              blob,
              torrent,
              index: message.chunkIndex,
            });
          }
          resolve(blob);
        });
      });
    });
  }

  downloadRemainingChunks(messages, onProgress) {
    messages.forEach(async (message, i) => {
      await this.downloadChunk(message);
      if (onProgress) {
        onProgress(this.chunkTorrents.size, messages.length + 2);
      }
    });
  }

  mergeAvailableChunks() {
    const orderedChunks = Array.from(this.chunkTorrents.entries())
      .sort(([indexA], [indexB]) => indexA - indexB)
      .map(([_, data]) => data.blob);

    return new Blob(orderedChunks, { type: "video/mp4" });
  }

  mergeAllChunks() {
    return this.mergeAvailableChunks();
  }

  // Clean up
  destroy() {
    if (this.client) {
      this.client.destroy();
    }
    this.chunkTorrents.clear();
    this.reassembledBlobs = [];
  }
}
