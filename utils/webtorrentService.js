// utils/webtorrentService.js - Cleaned version
// Public API preserved from previous version. Changes noted inline.

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
    this.downloadCache = new Map(); // In-memory metadata cache (no blobs)
    this.seedingCache = new Map(); // Track torrents currently being seeded

    // Per-item cap for retaining raw seed data in memory. Anything larger
    // is not stored for re-seeding. Prevents unbounded memory growth when
    // seeding large files.
    this.MAX_SEED_DATA_BYTES = 25 * 1024 * 1024; // 25 MB
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async destroyCleanup(magnetUri) {
    const client = await this.ensureClient();
    if (!client) return;

    // Use client.get() directly with the full magnet URI — WebTorrent parses
    // it correctly, so we don't need to extract the infoHash ourselves.
    const torrent = client.get(magnetUri);
    if (torrent) {
      torrent.destroy();
      console.log("🧹 Cleaned up torrent:", torrent.infoHash);
    }
  }

  // ---------------------------------------------------------------------------
  // Playback helpers
  // ---------------------------------------------------------------------------

  async getPlayableUrl(torrent, file) {
    return new Promise((resolve, reject) => {
      file.getBlobURL((err, url) => {
        if (!err && url) {
          resolve(url);
          return;
        }
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

  // ---------------------------------------------------------------------------
  // Cache keys
  // ---------------------------------------------------------------------------

  /**
   * Generates a consistent cache key from a magnet URI.
   * Uses TextEncoder + base64url so it handles unicode in `dn=` without
   * colliding (the old btoa fallback truncated to 32 chars).
   */
  getCacheKey(magnetUri) {
    if (!magnetUri) return "";
    const match = magnetUri.match(/xt=urn:btih:([^&]+)/i);
    if (match) {
      return `magnet_${match[1].toLowerCase()}`;
    }
    try {
      const bytes = new TextEncoder().encode(magnetUri);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      return `magnet_${b64}`;
    } catch (e) {
      // Last resort — extremely unlikely to be reached with TextEncoder
      return `magnet_${magnetUri.length}_${magnetUri.slice(0, 16)}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------

  /**
   * Stores metadata about a magnet result. Never stores blob URLs (they're
   * device/session-specific) and never stores raw `data` here — that's
   * `storeSeedData`'s job.
   */
  cacheMagnetResult(magnetUri, result) {
    const cacheKey = this.getCacheKey(magnetUri);

    if (result.url && result.url.startsWith("blob:")) {
      // Blob URLs are ephemeral; don't cache them.
      return;
    }

    this.downloadCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now(),
    });

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
   * Returns a cached magnet entry if it's still fresh.
   * The 1-hour TTL is arbitrary but harmless — the map lives only for the
   * lifetime of the tab anyway.
   */
  getCachedMagnet(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);
    const cached = this.downloadCache.get(cacheKey);
    if (!cached) return null;

    if (cached.url && cached.url.startsWith("blob:")) {
      this.downloadCache.delete(cacheKey);
      return null;
    }

    if (Date.now() - cached.cachedAt < 60 * 60 * 1000) {
      return cached;
    }

    this.downloadCache.delete(cacheKey);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  async seed(data, options = {}) {
    const client = await this.ensureClient();

    return new Promise((resolve, reject) => {
      const seedOptions = { announce: this.trackers, ...options };

      try {
        client.seed(data, seedOptions, (torrent) => {
          console.log("🌱 Champ is seeding:", torrent.name || torrent.infoHash);

          // Only retain data if it's under the cap. Large blobs are dropped
          // from memory; the torrent itself continues to seed as long as the
          // tab lives.
          const dataSize =
            typeof data?.size === "number"
              ? data.size
              : typeof data?.byteLength === "number"
                ? data.byteLength
                : 0;

          if (dataSize > 0 && dataSize <= this.MAX_SEED_DATA_BYTES) {
            this.seedingCache.set(torrent.infoHash, {
              torrent,
              data,
              timestamp: Date.now(),
            });
          } else {
            // Still track the torrent, just without the payload
            this.seedingCache.set(torrent.infoHash, {
              torrent,
              timestamp: Date.now(),
            });
            if (dataSize > this.MAX_SEED_DATA_BYTES) {
              console.log(
                `⚠️ Not retaining seed data (${dataSize} bytes > ${this.MAX_SEED_DATA_BYTES})`,
              );
            }
          }

          const result = {
            torrent,
            magnetUri: torrent.magnetURI,
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
          };

          this.cacheMagnetResult(torrent.magnetURI, result);
          resolve(result);
        });
      } catch (err) {
        console.error("Seeding error:", err);
        reject(err);
      }
    });
  }

  /**
   * Re-seed a cached torrent using retained data. Only works if the data
   * was small enough to retain.
   */
  async reSeedCached(magnetUri) {
    const cacheKey = this.getCacheKey(magnetUri);
    const cached = this.downloadCache.get(cacheKey);

    if (cached && cached.data) {
      console.log("🔄 Re-seeding from cached data...");
      return this.seed(cached.data, { name: cached.name || "re-seeded" });
    }

    console.log("❌ No cached data available for re-seeding");
    return null;
  }

  // ---------------------------------------------------------------------------
  // Adding (download)
  // ---------------------------------------------------------------------------

  async add(magnetUri, options = {}) {
    const { forceRefresh = false, _retry = 0, ...torrentOpts } = options;

    // Retry guard — prevents infinite loop if the existing torrent is
    // permanently broken.
    if (_retry > 2) {
      throw new Error("Torrent could not be recovered after 3 attempts");
    }

    if (forceRefresh) {
      this.downloadCache.delete(this.getCacheKey(magnetUri));
    }

    // 1. Memory cache
    const cached = !forceRefresh ? this.getCachedMagnet(magnetUri) : null;
    if (cached && cached.url && !cached.url.startsWith("blob:")) {
      // Note: cacheMagnetResult never stores blob URLs, so this branch is
      // only reached if a caller manually put a non-blob URL in the cache.
      // HEAD check still validates it.
      try {
        const response = await fetch(cached.url, { method: "HEAD" });
        if (response.ok) {
          return { ...cached, fromCache: true, ready: true };
        }
      } catch (e) {
        // fall through to fresh fetch
      }
      this.downloadCache.delete(this.getCacheKey(magnetUri));
    }

    const client = await this.ensureClient();

    // 2. Existing torrent in client
    const existing = client.get(magnetUri);
    if (existing) {
      const file = existing.files?.[0];
      if (file) {
        return new Promise((resolve) => {
          file.getBuffer((err, buffer) => {
            if (err || !buffer) {
              client.remove(existing.infoHash);
              return this.add(magnetUri, {
                ...torrentOpts,
                forceRefresh: true,
                _retry: _retry + 1,
              }).then(resolve);
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

    // 3. New swarm
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let progressTimeoutId = null;
      const NO_PROGRESS_MS = 60_000;

      const armProgressTimeout = () => {
        if (progressTimeoutId) clearTimeout(progressTimeoutId);
        progressTimeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            reject(new Error("Torrent stalled (no progress in 60s)"));
          }
        }, NO_PROGRESS_MS);
      };

      const finish = (fn, value) => {
        if (isResolved) return;
        isResolved = true;
        if (progressTimeoutId) clearTimeout(progressTimeoutId);
        fn(value);
      };

      const torrentOptions = {
        announce: this.trackers,
        strategy: "sequential",
        ...torrentOpts,
      };

      try {
        client.add(magnetUri, torrentOptions, (torrent) => {
          console.log(
            "🧲 Torrent added to swarm:",
            torrent.name || torrent.infoHash,
          );

          // Reset stall timer on any progress
          torrent.on("download", armProgressTimeout);

          const processReadyTorrent = () => {
            const file =
              torrent.files.find((f) =>
                f.name.match(/\.(mp4|webm|m4v|jpg|jpeg|png|gif|webp)$/i),
              ) || torrent.files[0];

            if (!file) {
              return finish(
                reject,
                new Error("No valid media files in torrent"),
              );
            }

            file.getBlobURL((err, url) => {
              if (err) return finish(reject, err);

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
              finish(resolve, result);
            });
          };

          if (torrent.ready) {
            processReadyTorrent();
          } else {
            torrent.once("ready", processReadyTorrent);
          }

          torrent.on("done", () => {
            console.log("✅ Torrent complete - now seeding:", torrent.name);
            this.seedingCache.set(torrent.infoHash, { torrent });
          });

          torrent.on("error", (err) => {
            console.error("Torrent error:", err);
            finish(reject, err);
          });

          armProgressTimeout();
        });
      } catch (err) {
        finish(reject, err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Seed data storage
  // ---------------------------------------------------------------------------

  async storeSeedData(magnetUri, fileData, metadata = {}) {
    const cacheKey = this.getCacheKey(magnetUri);

    const dataSize =
      typeof fileData?.size === "number"
        ? fileData.size
        : typeof fileData?.byteLength === "number"
          ? fileData.byteLength
          : 0;

    if (dataSize > this.MAX_SEED_DATA_BYTES) {
      console.log(
        `⚠️ Skipping storeSeedData (${dataSize} bytes > ${this.MAX_SEED_DATA_BYTES})`,
      );
      return;
    }

    this.downloadCache.set(cacheKey, {
      ...metadata,
      data: fileData,
      isSeedData: true,
      cachedAt: Date.now(),
      magnetUri,
    });
    console.log("💾 Seed data stored for re-seeding");
  }

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

  // ---------------------------------------------------------------------------
  // Pre-warming
  // ---------------------------------------------------------------------------

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

  getCachedMagnets() {
    const cached = [];
    for (const [key, value] of this.downloadCache.entries()) {
      cached.push({ key, ...value });
    }
    return cached;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

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

  cleanupWithData(filter = "") {
    if (typeof window === "undefined" || !window.globalWebTorrentClient) return;

    window.globalWebTorrentClient.torrents.forEach((t) => {
      if (!filter || t.name?.includes(filter) || t.infoHash?.includes(filter)) {
        const cacheKey = this.getCacheKey(t.magnetURI);
        const cached = this.downloadCache.get(cacheKey);

        if (cached && cached.data) {
          console.log("💾 Keeping cached data for:", t.name);
        } else {
          this.downloadCache.delete(cacheKey);
        }

        t.destroy();
      }
    });
  }

  /**
   * Purge expired entries from both memory and localStorage.
   * NOTE: localStorage writes here race with other tabs. If you see entries
   * mysteriously disappearing, this is likely why.
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
