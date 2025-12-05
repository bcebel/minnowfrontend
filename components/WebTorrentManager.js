class WebTorrentManager {
  constructor() {
    this.client = null;
    this.activeTorrents = new Map();
  }

  async init() {
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
      console.log("🌐 WebTorrent manager initialized");
    }

    return this.client;
  }

  async seedChunks(chunkFiles, sessionId, fileName) {
    await this.init();

    // Check if already seeding
    if (this.activeTorrents.has(sessionId)) {
      console.log("✅ Already seeding session:", sessionId);
      return this.activeTorrents.get(sessionId).magnetURI;
    }

    return new Promise((resolve, reject) => {
      this.client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.files.fm:7073/announce",
          ],
        },
        (torrent) => {
          console.log("✅ Torrent seeding started:", torrent.infoHash);
          this.activeTorrents.set(sessionId, torrent);

          // Keep alive
          torrent.on("error", console.error);

          resolve(torrent.magnetURI);
        }
      );
    });
  }

  getTorrent(sessionId) {
    return this.activeTorrents.get(sessionId);
  }

  stopSeeding(sessionId) {
    const torrent = this.activeTorrents.get(sessionId);
    if (torrent) {
      this.activeTorrents.delete(sessionId);
      console.log("🛑 Stopped seeding:", sessionId);
    }
  }

  getStats() {
    return {
      torrents: this.activeTorrents.size,
      client: this.client ? "initialized" : "not initialized",
    };
  }
}

// Singleton instance
export const webtorrentManager = new WebTorrentManager();
