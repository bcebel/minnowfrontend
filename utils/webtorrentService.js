// utils/webtorrentService.js - ENHANCED & UNIFIED VERSION

class WebTorrentService {
  constructor() {
    // Default trackers if window.enhancedTrackers isn't ready yet
    this.trackers =
      typeof window !== "undefined" && window.enhancedTrackers
        ? window.enhancedTrackers
        : [
            "wss://tracker-0ad4cca9fd92.herokuapp.com",
            "wss://tracker.files.fm:7073/announce",
            "wss://tracker.webtorrent.dev",
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
          ];

    // Caching layer
    this.downloadCache = new Map(); // In-memory cache for active blob URLs
    this.seedingCache = new Map(); // Track torrents currently being seeded
  }

  /**
   * THE CHAMP GATEKEEPER
   * Polls until the global WebTorrent client from +html.tsx is available.
   */
  async ensureClient() {
    let attempts = 0;
    while (
      typeof window !== "undefined" &&
      !window.globalWebTorrentClient &&
      attempts < 20
    ) {
      console.log(`Waiting for Champ (Attempt ${attempts + 1})...`);
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (typeof window === "undefined" || !window.globalWebTorrentClient) {
      throw new Error("WebTorrent Champ failed to enter the building.");
    }

    return window.globalWebTorrentClient;
  }

  /**
   * Generates a consistent cache key from a magnet URI or infoHash
   */
  getCacheKey(magnetUri) {
    if (!magnetUri) return "";
    const match = magnetUri.match(/xt=urn:btih:([^&]+)/i);
    if (match) {
      return `magnet_${match[1].toLowerCase()}`;
    }
    try {
      return `magnet_${btoa(magnetUri).replace(/[^a-zA-Z0-9]/g, "")}`;
    } catch (e) {
      return `magnet_${magnetUri.slice(0, 32)}`;
    }
  }

  /**
   * Caches magnet result to memory (blob URL) and localStorage (metadata)
   */
  cacheMagnetResult(magnetUri, result) {
    const cacheKey = this.getCacheKey(magnetUri);

    // Store in memory cache
    this.downloadCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now(),
      url: result.url,
    });

    // Store metadata in localStorage for cross-session persistence
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
      };
      localStorage.setItem("webtorrent_cache", JSON.stringify(cache));
    } catch (e) {
      console.warn("Could not cache to localStorage:", e);
    }
  }

  /**
   * Retrieves fresh cached magnet data (freshness threshold: 1 hour)
   */
  getCachedMagnet(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);

    if (this.downloadCache.has(cacheKey)) {
      const cached = this.downloadCache.get(cacheKey);
      // Check if cache is less than 1 hour old
      if (Date.now() - cached.cachedAt < 60 * 60 * 1000) {
        console.log("⚡ Returning cached torrent from memory");
        return cached;
      }
      // Cache expired
      this.downloadCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Seed data across the P2P network using the primary Heroku tracker
   */
  async seed(data, options = {}) {
    const client = await this.ensureClient();

    return new Promise((resolve, reject) => {
      const seedOptions = {
        announce: this.trackers,
        ...options,
      };

      try {
        client.seed(data, seedOptions, (torrent) => {
          console.log("🌱 Champ is seeding:", torrent.name || torrent.infoHash);
          this.seedingCache.set(torrent.infoHash, torrent);

          const result = {
            torrent,
            magnetUri: torrent.magnetURI,
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
          };
          resolve(result);
        });
      } catch (err) {
        console.error("Seeding error:", err);
        reject(err);
      }
    });
  }

  /**
   * ENHANCED add method: Handles memory caching, WebSeeding, sequential loading & blob generation
   */
  async add(magnetUri, options = {}) {
    // 1. Check memory cache first
    const cached = this.getCachedMagnet(magnetUri);
    if (cached && cached.url) {
      return Promise.resolve({
        ...cached,
        fromCache: true,
      });
    }

    const client = await this.ensureClient();

    // 2. Check if the client is already swarming this magnet
    const existing = client.get(magnetUri);
    if (existing) {
      console.log("🔄 Using existing torrent instance");
      const file =
        existing.files.find((f) =>
          f.name.match(/\.(mp4|webm|m4v|jpg|jpeg|png|gif|webp)$/i),
        ) || existing.files[0];

      if (file) {
        return new Promise((resolve) => {
          file.getBlobURL((err, url) => {
            resolve({
              torrent: existing,
              url: err ? null : url,
              name: existing.name,
              size: existing.length,
              infoHash: existing.infoHash,
              magnetUri: existing.magnetURI,
              ready: true,
              fromExisting: true,
            });
          });
        });
      }
      return Promise.resolve({ torrent: existing, fromExisting: true });
    }

    // 3. Initiate new swarm
    return new Promise((resolve, reject) => {
      let isResolved = false;

      const torrentOptions = {
        announce: this.trackers,
        strategy: "sequential", // Essential for video streaming
        ...options,
      };

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error("Torrent download timeout (60s)"));
        }
      }, 60000);

      try {
        client.add(magnetUri, torrentOptions, (torrent) => {
          console.log(
            "🧲 Torrent added to swarm:",
            torrent.name || torrent.infoHash,
          );

          const processReadyTorrent = () => {
            const file =
              torrent.files.find((f) =>
                f.name.match(/\.(mp4|webm|m4v|jpg|jpeg|png|gif|webp)$/i),
              ) || torrent.files[0];

            if (!file) {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                reject(new Error("No valid media files in torrent"));
              }
              return;
            }

            file.getBlobURL((err, url) => {
              if (err) {
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timeoutId);
                  reject(err);
                }
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

              this.cacheMagnetResult(magnetUri, result);

              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                resolve(result);
              }
            });
          };

          if (torrent.ready) {
            processReadyTorrent();
          } else {
            torrent.once("ready", processReadyTorrent);
          }

          torrent.on("done", () => {
            console.log("✅ Torrent complete - now seeding:", torrent.name);
            this.seedingCache.set(torrent.infoHash, torrent);
          });

          torrent.on("error", (err) => {
            console.error("Torrent error:", err);
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              reject(err);
            }
          });

          torrent.on("download", () => {
            const percent = Math.floor(torrent.progress * 100);

            // Early buffer check (at 5% download)
            if (
              percent >= 5 &&
              torrent.files[0] &&
              !torrent._earlyPlaybackAttempted
            ) {
              torrent._earlyPlaybackAttempted = true;
              torrent.files[0].getBlobURL((err, url) => {
                if (!err && url) {
                  console.log("🎬 Early playback available at 5%");
                }
              });
            }
          });
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  /**
   * Register magnet link metadata from IPFS/Pinata uploads
   */
  async cacheMagnetLink(magnetUri, metadata = {}) {
    const cacheKey = this.getCacheKey(magnetUri);
    const cacheEntry = {
      magnetUri,
      ...metadata,
      cachedAt: Date.now(),
      source: "ipfs_upload",
    };

    this.downloadCache.set(cacheKey, cacheEntry);

    try {
      const cache = JSON.parse(
        localStorage.getItem("webtorrent_cache") || "{}",
      );
      cache[cacheKey] = cacheEntry;
      localStorage.setItem("webtorrent_cache", JSON.stringify(cache));
    } catch (e) {
      console.warn("Could not cache magnet to localStorage:", e);
    }
  }

  /**
   * Background pre-fetch for feeds
   */
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

  /**
   * Retrieve all cached magnet records
   */
  getCachedMagnets() {
    const cached = [];
    for (const [key, value] of this.downloadCache.entries()) {
      cached.push({ key, ...value });
    }
    return cached;
  }

  /**
   * Clean up torrent instances by filter string
   */
  cleanup(filter = "") {
    if (typeof window === "undefined" || !window.globalWebTorrentClient) return;

    window.globalWebTorrentClient.torrents.forEach((t) => {
      if (!filter || t.name?.includes(filter) || t.infoHash?.includes(filter)) {
        t.destroy();
      }
    });

    if (filter) {
      for (const [key] of this.downloadCache.entries()) {
        if (key.includes(filter)) {
          this.downloadCache.delete(key);
        }
      }
    }
  }

  /**
   * Purge expired cache entries beyond a given age in hours (default: 24h)
   */
  clearExpiredCache(maxAgeHours = 24) {
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const [key, value] of this.downloadCache.entries()) {
      if (now - value.cachedAt > maxAge) {
        this.downloadCache.delete(key);
      }
    }

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
