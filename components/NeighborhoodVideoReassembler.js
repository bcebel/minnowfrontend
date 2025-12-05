export class NeighborhoodVideoReassembler {
  constructor(neighborhoodId) {
    this.neighborhoodId = neighborhoodId;
    this.client = null; // Will use global client
    this.chunkTorrents = new Map();
    this.reassembledBlobs = [];
    this.onChunkDownload = null;
  }

  async init() {
    if (typeof window === "undefined") return;

    // ✅ USE GLOBAL CLIENT INSTEAD OF CREATING NEW ONE!
    if (window.globalWebTorrentClient) {
      console.log("🌐 Using existing global WebTorrent client");
      this.client = window.globalWebTorrentClient;
      return;
    }

    // Fallback: Load WebTorrent if global doesn't exist
    if (!window.WebTorrent) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    // Create client with same config as global
    this.client = new window.WebTorrent({
      tracker: {
        pex: true,
        lsd: true,
        announce: window.enhancedTrackers || [
          "wss://tracker.openwebtorrent.com",
          "wss://tracker.btorrent.xyz",
          "wss://tracker.files.fm:7073/announce",
        ],
      },
    });

    console.log("🌐 Created WebTorrent client for playback");
  }

  async watchMultistream(magnetUri, sessionId, totalChunks, onProgress) {
    console.log(
      "🎬 watchMultistream - Using",
      window.globalWebTorrentClient ? "global client" : "local client"
    );

    if (!this.client) await this.init();

    return new Promise((resolve, reject) => {
      console.log("🌐 Adding torrent to WebTorrent...");

      const timeout = setTimeout(() => {
        console.error("⏰ Torrent load timeout (30 seconds)");
        reject(new Error("Torrent load timeout"));
      }, 30000);

      // ✅ Error handlers OUTSIDE the callback
      this.client.on("error", (err) => {
        clearTimeout(timeout);
        console.error("❌ WebTorrent client error:", err);
        reject(err);
      });

      this.client.on("warning", (warning) => {
        console.warn("⚠️ WebTorrent warning:", warning);
      });

      this.client.add(magnetUri, (torrent) => {
        clearTimeout(timeout);

        if (!torrent) {
          reject(new Error("Torrent is null"));
          return;
        }

        console.log("✅ Torrent added to client!");
        console.log("📊 Torrent info:", {
          name: torrent.name,
          infoHash: torrent.infoHash,
          filesCount: torrent.files.length,
          files: torrent.files.map((f) => ({
            name: f.name,
            length: f.length,
            path: f.path,
          })),
          ready: torrent.ready,
        });

        if (torrent.files.length === 0) {
          console.error("❌ No files in torrent!");
          reject(new Error("Torrent has no files"));
          return;
        }

        console.log("✅ Multistream loaded:", torrent.name);
        console.log(
          "📁 Files in torrent:",
          torrent.files.map((f) => f.name)
        );

        // Sort files by chunk number
        const chunkFiles = torrent.files
          .filter((f) => f.name.startsWith("chunk_"))
          .sort((a, b) => {
            const numA = parseInt(a.name.match(/chunk_(\d+)/)[1]);
            const numB = parseInt(b.name.match(/chunk_(\d+)/)[1]);
            return numA - numB;
          });

        console.log(`🎯 Found ${chunkFiles.length} chunks in multistream`);

        // Progressive download
        this.downloadMultistreamChunks(chunkFiles, totalChunks, onProgress)
          .then((blobs) => {
            const finalBlob = new Blob(blobs, { type: "video/mp4" });
            resolve(finalBlob);
          })
          .catch(reject);

        // Torrent-specific events
        torrent.on("done", () => {
          console.log("🎉 Torrent download complete!");
        });

        torrent.on("wire", (wire, addr) => {
          console.log("🔗 Connected to peer:", addr);
        });
      });
    });
  }

  async downloadMultistreamChunks(chunkFiles, totalChunks, onProgress) {
    const blobs = new Array(totalChunks);
    let downloaded = 0;

    // Download first 2 chunks immediately for playback
    const immediateDownloads = [];
    for (let i = 0; i < Math.min(2, chunkFiles.length); i++) {
      immediateDownloads.push(
        this.downloadChunkFile(chunkFiles[i], i, blobs, () => {
          downloaded++;
          if (onProgress) onProgress(downloaded, totalChunks);
        })
      );
    }

    await Promise.all(immediateDownloads);

    // Download remaining chunks
    const remainingDownloads = [];
    for (let i = 2; i < chunkFiles.length; i++) {
      remainingDownloads.push(
        this.downloadChunkFile(chunkFiles[i], i, blobs, () => {
          downloaded++;
          if (onProgress) onProgress(downloaded, totalChunks);
        })
      );
    }

    await Promise.all(remainingDownloads);

    console.log(`✅ All ${downloaded} chunks downloaded from multistream`);
    return blobs;
  }

  downloadChunkFile(chunkFile, index, blobsArray, callback) {
    return new Promise((resolve) => {
      chunkFile.getBlob((err, blob) => {
        if (err) {
          console.error(`❌ Error downloading chunk ${index}:`, err);
          resolve();
          return;
        }

        blobsArray[index] = blob;
        console.log(`⬇️ Downloaded chunk ${index + 1}`);
        callback();
        resolve();
      });
    });
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
}
