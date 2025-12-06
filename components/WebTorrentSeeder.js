class WebTorrentSeeder {
  constructor() {
    this.client = null;
    this.activeTorrents = new Map();
  }

  async getClient() {
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
      console.log("🌐 WebTorrent seeder initialized");

      // Keep alive
      this.client.on("error", console.error);
      this.client.on("warning", console.warn);
    }

    return this.client;
  }

  async seedChunks(chunkFiles, sessionId) {
    const client = await this.getClient();

    return new Promise((resolve) => {
      client.seed(
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
          console.log("✅ Seeding started:", torrent.magnetURI);
          this.activeTorrents.set(sessionId, torrent);

          // Log seeding stats
          setInterval(() => {
            console.log("📊 Seeding stats:", {
              sessionId,
              peers: torrent.numPeers,
              uploaded: torrent.uploaded,
              progress: torrent.progress,
            });
          }, 10000);

          resolve(torrent.magnetURI);
        }
      );
    });
  }

  getStats() {
    return {
      activeTorrents: this.activeTorrents.size,
      totalPeers: Array.from(this.activeTorrents.values()).reduce(
        (sum, t) => sum + t.numPeers,
        0
      ),
    };
  }
}

// Singleton instance
const webtorrentSeeder = new WebTorrentSeeder();
window.webtorrentSeeder = webtorrentSeeder; // Make globally available
export default webtorrentSeeder;
