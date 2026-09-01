import { Platform } from "react-native";

const DB_NAME = "MediaCache";
const DB_VERSION = 1;
const STORE_NAME = "media";

const isBrowser = () => {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined"
  );
};

let MediaCacheClass;

if (isBrowser()) {
  const { openDB } = require("idb");

  class BrowserMediaCache {
    constructor() {
      this.dbPromise = this.#initDB();
      this.isCacheFull = false; // ⚡ CIRCUIT BREAKER
    }

    async #initDB() {
      return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "cid" });
            store.createIndex("lastAccessed", "lastAccessed");
          }
        },
      }).catch((err) => {
        console.warn("⚠️ IndexedDB blocked or failed to init:", err.name);
        return null;
      });
    }

    
    this.dbPromise = this.#initDB();
    // Remove the permanent Circuit Breaker
    this.isCacheFull = false; 
  

  async saveMedia(cid, blob, mimeType, fileName, isPublic = true) {
    if (!blob) return false;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const db = await this.dbPromise;
      if (!db) return false;

      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      await store.put({
        cid,
        data: arrayBuffer,
        mimeType,
        fileName,
        isPublic,
        lastAccessed: new Date(),
        storedAt: new Date(),
      });
      await tx.done;

      console.log(`✅ Saved to Cache: ${cid}`);
      return true;
    } catch (error) {
      // Just log it, don't permanently disable!
      console.warn("❌ Save failed (will retry later):", error.name);
      return false;
    }
  }

        

    async getMedia(cid) {
      try {
        const db = await this.dbPromise;
        if (!db) return null;

        const tx = db.transaction(STORE_NAME, "readonly");
        const item = await tx.objectStore(STORE_NAME).get(cid);

        if (item) {
          // background update (non-blocking)
          this.#updateTimestamp(item);

          const freshBlob = new Blob([item.data], { type: item.mimeType });
          return {
            blob: freshBlob,
            mimeType: item.mimeType,
            fileName: item.fileName,
            isPublic: item.isPublic,
          };
        }
        return null;
      } catch (error) {
        console.warn(`❌ Cache retrieval failed for ${cid}:`, error.name);
        return null;
      }
    }

    async #updateTimestamp(item) {
      try {
        const db = await this.dbPromise;
        item.lastAccessed = new Date();
        const tx = db.transaction(STORE_NAME, "readwrite");
        await tx.objectStore(STORE_NAME).put(item);
      } catch (e) {
        /* ignore timestamp failures */
      }
    }

    // ... (rest of your hasMedia, deleteMedia, etc. stay the same)
    async hasMedia(cid) {
      try {
        const db = await this.dbPromise;
        if (!db) return false;
        const key = await db.getKey(STORE_NAME, cid);
        return key !== undefined;
      } catch (e) {
        return false;
      }
    }

    async clearCache() {
      try {
        const db = await this.dbPromise;
        if (!db) return false;
        await db.clear(STORE_NAME);
        this.isCacheFull = false; // Reset the breaker
        console.log("🧹 Cache cleared");
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  MediaCacheClass = BrowserMediaCache;
} else {
  // Mock for Server/SSR
  class ServerMediaCache {
    async saveMedia() {
      return false;
    }
    async getMedia() {
      return null;
    }
    async hasMedia() {
      return false;
    }
    async deleteMedia() {
      return true;
    }
    async clearCache() {
      return true;
    }
  }
  MediaCacheClass = ServerMediaCache;
}

const mediaCacheInstance = new MediaCacheClass();

export const getMedia = (cid) => mediaCacheInstance.getMedia(cid);
export const saveMedia = (cid, blob, mimeType, fileName) =>
  mediaCacheInstance.saveMedia(cid, blob, mimeType, fileName);
export const mediaCache = mediaCacheInstance;


