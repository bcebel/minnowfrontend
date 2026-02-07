// utils/webtorrentService.js - ENHANCED VERSION
class WebTorrentService {
  constructor() {
    // Keep your existing trackers
    this.trackers = window.enhancedTrackers || [
      "wss://tracker-0ad4cca9fd92.herokuapp.com",
      // ... other trackers
    ];

    // Add caching
    this.downloadCache = new Map(); // Memory cache
    this.seedingCache = new Map(); // Track what we're seeding
  }

  // THE CHAMP GATEKEEPER - keep this as is
  async ensureClient() {
    let attempts = 0;
    while (!window.globalWebTorrentClient && attempts < 20) {
      console.log(`⏳ Waiting for Champ (Attempt ${attempts})...`);
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (!window.globalWebTorrentClient) {
      throw new Error("WebTorrent Champ failed to enter the building.");
    }

    return window.globalWebTorrentClient;
  }

  // Cache magnet link results
  cacheMagnetResult(magnetUri, result) {
    const cacheKey = this.getCacheKey(magnetUri);

    // Store in memory cache
    this.downloadCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now(),
      url: result.url, // Keep the blob URL
    });

    // Also store in localStorage for persistence
    try {
      const cache = JSON.parse(
        localStorage.getItem("webtorrent_cache") || "{}",
      );
      cache[cacheKey] = {
        magnetUri,
        name: result.name,
        size: result.size,
        infoHash: result.infoHash,
        cachedAt: Date.now(),
        // Don't store blob URL in localStorage (it won't work)
      };
      localStorage.setItem("webtorrent_cache", JSON.stringify(cache));
    } catch (e) {
      console.warn("Could not cache to localStorage:", e);
    }
  }

  // Get cached magnet
  getCachedMagnet(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);

    // Check memory cache first
    if (this.downloadCache.has(cacheKey)) {
      const cached = this.downloadCache.get(cacheKey);
      // Check if cache is fresh (less than 1 hour old)
      if (Date.now() - cached.cachedAt < 60 * 60 * 1000) {
        console.log("🎯 Returning cached torrent from memory");
        return cached;
      }
      // Cache expired
      this.downloadCache.delete(cacheKey);
    }

    return null;
  }

  // Generate cache key from magnet URI
  getCacheKey(magnetUri) {
    // Try to extract info hash
    const match = magnetUri.match(/xt=urn:btih:([^&]+)/i);
    if (match) {
      return `magnet_${match[1].toLowerCase()}`;
    }
    // Fallback: use the whole URI
    return `magnet_${btoa(magnetUri).replace(/[^a-zA-Z0-9]/g, "")}`;
  }

  // ENHANCED seed method with caching
  async seed(data, options = {}) {
    const client = await this.ensureClient();
    return new Promise((resolve, reject) => {
      client.seed(
        data,
        {
          ...options,
          announce: [this.trackers[0]], // Use your primary tracker
        },
        (torrent) => {
          console.log("🌱 Champ is seeding:", torrent.name);

          // Cache this seeding torrent
          this.seedingCache.set(torrent.infoHash, torrent);

          const result = {
            torrent,
            magnetUri: torrent.magnetURI,
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
          };

          resolve(result);
        },
      );

      // Handle seeding errors
      client.on("error", (err) => {
        console.error("❌ Seeding error:", err);
        reject(err);
      });
    });
  }

  // ENHANCED add method with caching and streaming
  async add(magnetUri, options = {}) {
    // Check cache first
    const cached = this.getCachedMagnet(magnetUri);
    if (cached && cached.url) {
      return Promise.resolve({
        ...cached,
        fromCache: true,
      });
    }

    const client = await this.ensureClient();

    // Check if we already have this torrent
    const existing = client.get(magnetUri);
    if (existing) {
      console.log("♻️ Using existing torrent");
      return Promise.resolve({
        torrent: existing,
        fromExisting: true,
      });
    }

    return new Promise((resolve, reject) => {
      // Use sequential strategy for better streaming
      const torrentOptions = {
        ...options,
        announce: [this.trackers[0]], // Your primary tracker
        strategy: "sequential", // Better for media streaming
      };

      client.add(magnetUri, torrentOptions, (torrent) => {
        console.log("✅ Torrent added:", torrent.name);

        // Listen for when torrent is ready
        torrent.on("ready", () => {
          console.log("🎯 Torrent ready for playback");

          if (torrent.files[0]) {
            const file = torrent.files[0];

            // Create blob URL for playback
            file.getBlobURL((err, url) => {
              if (err) {
                reject(err);
                return;
              }

              const result = {
                torrent,
                url,
                name: torrent.name,
                size: torrent.length,
                infoHash: torrent.infoHash,
                magnetUri: torrent.magnetURI,
                ready: true,
              };

              // Cache the result
              this.cacheMagnetResult(magnetUri, result);

              // Start seeding when download completes
              torrent.on("done", () => {
                console.log("🌱 Now seeding (cached):", torrent.name);
                this.seedingCache.set(torrent.infoHash, torrent);
              });

              resolve(result);
            });
          } else {
            reject(new Error("No files in torrent"));
          }
        });

        torrent.on("error", (err) => {
          console.error("❌ Torrent error:", err);
          reject(err);
        });

        torrent.on("download", () => {
          const percent = Math.floor(torrent.progress * 100);
          console.log(`📥 Download progress: ${percent}%`);

          // Early playback - try at 5%
          if (
            percent >= 5 &&
            torrent.files[0] &&
            !torrent._earlyPlaybackAttempted
          ) {
            torrent._earlyPlaybackAttempted = true;
            const file = torrent.files[0];
            file.getBlobURL((err, url) => {
              if (!err && url) {
                console.log("🎬 Early playback available at 5%");
                // You could emit an event here for the UI to update
              }
            });
          }
        });
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        reject(new Error("Torrent download timeout (60s)"));
      }, 60000);
    });
  }

  // Method to cache a magnet link (for when you get one from IPFS upload)
  async cacheMagnetLink(magnetUri, metadata = {}) {
    const cacheKey = this.getCacheKey(magnetUri);

    const cacheEntry = {
      magnetUri,
      ...metadata,
      cachedAt: Date.now(),
      source: "ipfs_upload", // Track where this came from
    };

    this.downloadCache.set(cacheKey, cacheEntry);

    // Also store in localStorage
    try {
      const cache = JSON.parse(
        localStorage.getItem("webtorrent_cache") || "{}",
      );
      cache[cacheKey] = cacheEntry;
      localStorage.setItem("webtorrent_cache", JSON.stringify(cache));
    } catch (e) {
      console.warn("Could not cache magnet to localStorage:", e);
    }

    console.log("💾 Cached magnet link:", cacheKey);
  }

  // Method to pre-warm a magnet link (start downloading in background)
  async prewarmMagnet(magnetUri) {
    try {
      const result = await this.add(magnetUri);
      console.log("🔥 Pre-warmed magnet link:", result.name);
      return result;
    } catch (error) {
      console.warn("Could not pre-warm magnet:", error.message);
      return null;
    }
  }

  // Get all cached magnet links
  getCachedMagnets() {
    const cached = [];

    // From memory cache
    for (const [key, value] of this.downloadCache.entries()) {
      cached.push({
        key,
        ...value,
      });
    }

    return cached;
  }

  // Cleanup - keep your existing but add cache clearing
  cleanup(filter = "") {
    if (!window.globalWebTorrentClient) return;

    // Clean torrents
    window.globalWebTorrentClient.torrents.forEach((t) => {
      if (!filter || t.name.includes(filter)) {
        t.destroy();
      }
    });

    // Also clear memory cache for the filter
    if (filter) {
      for (const [key, value] of this.downloadCache.entries()) {
        if (key.includes(filter)) {
          this.downloadCache.delete(key);
        }
      }
    }
  }

  // New: Clear expired cache
  clearExpiredCache(maxAgeHours = 24) {
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const [key, value] of this.downloadCache.entries()) {
      if (now - value.cachedAt > maxAge) {
        this.downloadCache.delete(key);
      }
    }

    // Also clean localStorage
    try {
      const cache = JSON.parse(
        localStorage.getItem("webtorrent_cache") || "{}",
      );
      const newCache = {};
      for (const [key, value] of Object.entries(cache)) {
        if (now - value.cachedAt <= maxAge) {
          newCache[key] = value;
        }
      }
      localStorage.setItem("webtorrent_cache", JSON.stringify(newCache));
    } catch (e) {
      console.warn("Could not clear expired cache from localStorage:", e);
    }
  }
}

const webtorrentService = new WebTorrentService();
export default webtorrentService;
