// utils/webtorrentService.js
class WebTorrentService {
  constructor() {
    this.client = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.connectionAttempts = 0;
    this.MAX_RETRIES = 3;
    this.RECONNECT_DELAY = 5000; // 5 seconds

    // Default trackers - update this array as needed
    this.trackers = [
      "wss://tracker-0ad4cca9fd92.herokuapp.com",
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.btorrent.xyz",
    ];
  }

  async ensureClient() {
    if (this.client && this.client.ready) {
      return this.client;
    }

    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this.initializeClient();

    try {
      const client = await this.initPromise;
      this.isInitializing = false;
      return client;
    } catch (error) {
      this.isInitializing = false;
      this.initPromise = null;
      throw error;
    }
  }

  async initializeClient() {
    // Reset attempts for new initialization
    this.connectionAttempts = 0;

    return new Promise((resolve, reject) => {
      // If we're in a browser environment
      if (typeof window !== "undefined") {
        // Check if WebTorrent is already loaded globally
        if (window.WebTorrent && window.globalWebTorrentClient) {
          this.client = window.globalWebTorrentClient;
          this.client.ready = true;
          console.log("🌪️ Using existing global WebTorrent client");
          resolve(this.client);
          return;
        }

        // Load WebTorrent if not present
        if (!window.WebTorrent) {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
          script.onload = () => this.createAndSetupClient(resolve, reject);
          script.onerror = () => reject(new Error("Failed to load WebTorrent"));
          document.head.appendChild(script);
        } else {
          this.createAndSetupClient(resolve, reject);
        }
      } else {
        // Non-browser environment (React Native)
        reject(new Error("WebTorrent requires a browser environment"));
      }
    });
  }

  createAndSetupClient(resolve, reject) {
    try {
      console.log("🌪️ Creating new WebTorrent client");

      this.client = new window.WebTorrent({
        tracker: {
          pex: true,
          lsd: true,
          announce: this.trackers,
          heartbeat: 15, // Keep Heroku connection alive
        },
        dht: {
          bootstrap: [
            "router.bittorrent.com:6881",
            "dht.transmissionbt.com:6881",
            "dht.libtorrent.org:25401",
          ],
        },
        // Optimize for seeding
        maxConns: 200,
        nodeId: "BubbleBase-" + Math.random().toString(36).substr(2, 9),
        peerId: "BubbleBase-" + Math.random().toString(36).substr(2, 9),
      });

      // Store globally for other components
      window.globalWebTorrentClient = this.client;
      this.client.ready = true;

      // Setup event listeners
      this.setupEventListeners();

      // Health check
      this.startHealthCheck();

      console.log("✅ WebTorrent client ready");
      resolve(this.client);
    } catch (error) {
      console.error("❌ Failed to create WebTorrent client:", error);

      // Retry logic
      if (this.connectionAttempts < this.MAX_RETRIES) {
        this.connectionAttempts++;
        console.log(
          `🔄 Retrying connection (${this.connectionAttempts}/${this.MAX_RETRIES})...`
        );
        setTimeout(
          () => this.createAndSetupClient(resolve, reject),
          this.RECONNECT_DELAY
        );
      } else {
        reject(error);
      }
    }
  }

  setupEventListeners() {
    if (!this.client) return;

    // Track torrent events
    this.client.on("torrent", (torrent) => {
      console.log("🌱 Seeding torrent:", torrent.name);
      console.log("📊 Info Hash:", torrent.infoHash);
      console.log("👥 Peers:", torrent.numPeers);
    });

    // Track swarm stats
    this.client.on("download", (bytes) => {
      const stats = {
        downloadSpeed: this.client.downloadSpeed,
        uploadSpeed: this.client.uploadSpeed,
        progress: this.client.progress,
        ratio: this.client.ratio,
        torrents: this.client.torrents.length,
        peerCount: this.client.torrents.reduce((sum, t) => sum + t.numPeers, 0),
      };

      // Store globally
      window.globalTorrentStats = stats;

      // Emit custom event for other components
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("torrent-stats-update", { detail: stats })
        );
      }
    });

    // Error handling
    this.client.on("error", (err) => {
      console.error("❌ WebTorrent error:", err);
      this.handleConnectionError();
    });

    // Connection state changes
    this.client.on("ready", () => {
      console.log("✅ WebTorrent client ready");
      this.client.ready = true;
    });
  }

  handleConnectionError() {
    console.log("🔌 Connection issue detected");
    this.client.ready = false;

    // Attempt to reconnect
    setTimeout(async () => {
      try {
        console.log("🔄 Attempting to reconnect...");
        await this.reconnect();
      } catch (error) {
        console.error("❌ Reconnect failed:", error);
      }
    }, this.RECONNECT_DELAY);
  }

  async reconnect() {
    if (this.client) {
      // Clean up existing client
      this.client.destroy((err) => {
        if (err) console.error("Error destroying client:", err);
      });
      this.client = null;
      window.globalWebTorrentClient = null;
    }

    // Reinitialize
    return this.ensureClient();
  }

  startHealthCheck() {
    // Periodically check connection health
    setInterval(() => {
      if (this.client && this.client.ready) {
        // Try to ping trackers
        const anyConnected = this.trackers.some((tracker) => {
          // Simple check - in real implementation you'd want to track connection state
          return true; // Placeholder
        });

        if (!anyConnected) {
          console.log("⚠️ No tracker connections, attempting repair...");
          this.handleConnectionError();
        }
      }
    }, 30000); // Every 30 seconds
  }

  // Public API methods
  async seed(data, options = {}) {
    const client = await this.ensureClient();

    return new Promise((resolve, reject) => {
      const seedOptions = {
        ...options,
        announce: [...this.trackers, ...(options.announce || [])],
      };

      client.seed(data, seedOptions, (torrent) => {
        if (!torrent) {
          reject(new Error("Failed to seed torrent"));
          return;
        }
        resolve(torrent);
      });
    });
  }

  async add(magnetUri, options = {}) {
    const client = await this.ensureClient();

    return new Promise((resolve, reject) => {
      const addOptions = {
        ...options,
        announce: [...this.trackers, ...(options.announce || [])],
      };

      client.add(magnetUri, addOptions, (torrent) => {
        if (!torrent) {
          reject(new Error("Failed to add torrent"));
          return;
        }
        resolve(torrent);
      });
    });
  }

  getStats() {
    return (
      window.globalTorrentStats || {
        downloadSpeed: 0,
        uploadSpeed: 0,
        progress: 0,
        ratio: 0,
        torrents: 0,
        peerCount: 0,
      }
    );
  }

  async cleanup(torrentNames = []) {
    if (!this.client) return;

    this.client.torrents.forEach((torrent) => {
      // Destroy specific torrents or all if no filter
      if (
        torrentNames.length === 0 ||
        torrentNames.some((name) => torrent.name?.includes(name))
      ) {
        console.log(`🧹 Destroying torrent: ${torrent.name}`);
        torrent.destroy();
      }
    });
  }
}

// Singleton instance
const webtorrentService = new WebTorrentService();

// Export singleton
export default webtorrentService;
