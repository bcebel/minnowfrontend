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

  // In webtorrentService.js - add this helper method

  /**
   * Gets a playable blob URL for a torrent file
   * Handles both full files and sliced videos
   */
  async getPlayableUrl(torrent, file) {
    return new Promise((resolve, reject) => {
      // Try to get a blob URL directly (works for most videos)
      file.getBlobURL((err, url) => {
        if (!err && url) {
          resolve(url);
          return;
        }

        // Fallback: Read file as buffer and create blob
        file.getBuffer((err, buffer) => {
          if (err) {
            reject(err);
            return;
          }
          const blob = new Blob([buffer], { type: "video/mp4" });
          const url = URL.createObjectURL(blob);
          resolve(url);
        });
      });
    });
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

  // In webtorrentService.js - update cacheMagnetResult
  cacheMagnetResult(magnetUri, result) {
    const cacheKey = this.getCacheKey(magnetUri);

    // ✅ DON'T cache blob URLs - they're device-specific!
    // Only cache if it's from a download (has data)
    if (result.url && result.url.startsWith("blob:")) {
      console.log("⚠️ Not caching blob URL (device-specific)");
      return;
    }

    // Store in memory cache
    this.downloadCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now(),
      url: result.url,
      data: result.data,
    });
    // Store metadata in localStorage
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
  // In webtorrentService.js - update getCachedMagnet
  getCachedMagnet(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);

    if (this.downloadCache.has(cacheKey)) {
      const cached = this.downloadCache.get(cacheKey);

      // ✅ If it's a blob URL, treat it as expired (device-specific)
      if (cached.url && cached.url.startsWith("blob:")) {
        console.log("⚠️ Cached blob URL is device-specific, re-downloading");
        this.downloadCache.delete(cacheKey);
        return null;
      }

      // Check if less than 1 hour old
      if (Date.now() - cached.cachedAt < 60 * 60 * 1000) {
        console.log("⚡ Returning cached torrent from memory");
        return cached;
      }
      this.downloadCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Seed data across the P2P network using the primary Heroku tracker
  
  * ENHANCED seed method: Stores data for re-seeding if needed
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

          // ✅ Store the torrent AND the data for re-seeding
          this.seedingCache.set(torrent.infoHash, {
            torrent,
            data: data, // Keep the data alive!
            timestamp: Date.now(),
          });

          const result = {
            torrent,
            magnetUri: torrent.magnetURI,
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
          };

          // ✅ Cache the result with the data
          this.cacheMagnetResult(torrent.magnetURI, {
            ...result,
            data: data, // Store data in cache too
          });

          resolve(result);
        });
      } catch (err) {
        console.error("Seeding error:", err);
        reject(err);
      }
    });
  }

  /**
   * Re-seed a cached torrent if needed
   */
  async reSeedCached(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);
    const cached = this.downloadCache.get(cacheKey);

    if (cached && cached.data) {
      console.log("🔄 Re-seeding from cached data...");
      const result = await this.seed(cached.data, {
        name: cached.name || "re-seeded",
      });
      return result;
    }

    console.log("❌ No cached data available for re-seeding");
    return null;
  }

  /**
   * ENHANCED add method: Handles memory caching, WebSeeding, sequential loading & blob generation
   */
  // In webtorrentService.js - update add method
  async add(magnetUri, options = {}) {
    // 1. Check memory cache first
    const cached = this.getCachedMagnet(magnetUri);

    // ✅ Only use cache for downloads (not seeds)
    if (cached && cached.url && !cached.url.startsWith("blob:")) {
      // Check if the URL is still valid
      try {
        const response = await fetch(cached.url, { method: "HEAD" });
        if (response.ok) {
          console.log("⚡ Returning cached torrent from memory");
          return {
            ...cached,
            fromCache: true,
            ready: true,
          };
        }
      } catch (e) {
        console.log("⚠️ Cache expired, re-downloading...");
        this.downloadCache.delete(this.getCacheKey(magnetUri));
      }
    }

    const client = await this.ensureClient();

    // 2. Check if the client is already swarming this magnet
    const existing = client.get(magnetUri);
    if (existing) {
      console.log("🔄 Using existing torrent instance");

      // ✅ Check if the existing torrent has data
      const file = existing.files[0];
      if (file) {
        // Check if the file is actually downloadable
        return new Promise((resolve) => {
          file.getBuffer((err, buffer) => {
            if (err || !buffer) {
              console.log("⚠️ Existing torrent has no data, re-seeding...");
              // Remove the dead torrent
              client.remove(existing.infoHash);
              // Try again (recursive call but with cache cleared)
              return this.add(magnetUri, { ...options, forceRefresh: true });
            }

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
        });
      }
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

  // In webtorrentService.js - add this method
  async storeSeedData(magnetUri, fileData, metadata = {}) {
    const cacheKey = this.getCacheKey(magnetUri);

    // ✅ Store the raw file data (NOT a blob URL)
    this.downloadCache.set(cacheKey, {
      ...metadata,
      data: fileData, // This is the actual File/Blob data
      isSeedData: true,
      cachedAt: Date.now(),
      magnetUri: magnetUri,
    });
    console.log("💾 Seed data stored for re-seeding");
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
  // In webtorrentService.js - add this method after the existing cleanup method

  /**
   * Clean up torrents but keep data for re-seeding
   */
  cleanupWithData(filter = "") {
    if (typeof window === "undefined" || !window.globalWebTorrentClient) return;

    window.globalWebTorrentClient.torrents.forEach((t) => {
      if (!filter || t.name?.includes(filter) || t.infoHash?.includes(filter)) {
        // ✅ Remove the torrent but keep the data in cache
        const cacheKey = this.getCacheKey(t.magnetURI);
        const cached = this.downloadCache.get(cacheKey);

        // If we have cached data, keep it
        if (cached && cached.data) {
          console.log("💾 Keeping cached data for:", t.name);
          // Don't delete the cache
        } else {
          // Remove from cache if no data
          this.downloadCache.delete(cacheKey);
        }

        t.destroy();
      }
    });
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
