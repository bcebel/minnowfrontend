export class NeighborhoodVideoReassembler {
  constructor(neighborhoodId) {
    this.neighborhoodId = neighborhoodId;
    this.client = null;
    this.chunkTorrents = new Map();
    this.reassembledBlobs = [];
    this.onChunkDownload = null; // Callback for progress
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
