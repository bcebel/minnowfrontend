// mediaCache.js - Complete SSR-safe version
import { Platform } from "react-native";

// Constants
const DB_NAME = "MediaCache";
const DB_VERSION = 1;
const STORE_NAME = "media";

// Check if we're in a browser environment
const isBrowser = () => {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined"
  );
};

let MediaCacheClass;

if (isBrowser()) {
  // Browser: Use the real IndexedDB implementation
  const { openDB } = require("idb");

  class BrowserMediaCache {
    constructor() {
      this.dbPromise = this.#initDB();
    }

    async #initDB() {
      return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "cid" });
            store.createIndex("lastAccessed", "lastAccessed");
          }
        },
      });
    }

    // ✅ Save a media blob (video/image) with its metadata
    async saveMedia(cid, blob, mimeType, fileName, isPublic = true) {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        // Convert to ArrayBuffer for Safari stability
        const arrayBuffer = await blob.arrayBuffer();

        const item = {
          cid,
          data: arrayBuffer, // Ditch the 'blob: blob' property
          mimeType,
          fileName,
          isPublic,
          lastAccessed: new Date(),
          storedAt: new Date(),
        };

        await store.put(item);
        await tx.done;
        return true;
      } catch (error) {
        console.error("❌ Save failed:", error);
        return false;
      }
    }

    // ✅ Retrieve media blob by CID (returns null if not found)
    async getMedia(cid) {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);

        const item = await store.get(cid);

   if (item) {
     // 1. Update timestamp
     item.lastAccessed = new Date();
     const updateTx = db.transaction(STORE_NAME, "readwrite");
     await updateTx.objectStore(STORE_NAME).put(item);
     await updateTx.done;

     console.log(`✅ Cache HIT: ${cid}`);

     // 2. RECONSTRUCT the Blob from the stored ArrayBuffer
     // This fresh wrap is what Safari needs to display it after a refresh
     const freshBlob = new Blob([item.data], { type: item.mimeType });

     return {
       blob: freshBlob,
       mimeType: item.mimeType,
       fileName: item.fileName,
       isPublic: item.isPublic,
     };
   }

        console.log(`❌ Cache MISS for CID: ${cid}`);
        return null;
      } catch (error) {
        console.error("❌ Failed to retrieve media from IndexedDB:", error);
        return null;
      }
    }

    // ✅ Check if a CID exists in cache (fast check, doesn't load blob)
    async hasMedia(cid) {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const key = await store.getKey(cid);
        return key !== undefined;
      } catch (error) {
        console.error("❌ Failed to check cache existence:", error);
        return false;
      }
    }

    // ✅ Delete a specific item from cache
    async deleteMedia(cid) {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        await tx.objectStore(STORE_NAME).delete(cid);
        await tx.done;
        console.log(`🗑️  Deleted from cache: ${cid}`);
        return true;
      } catch (error) {
        console.error("❌ Failed to delete media from cache:", error);
        return false;
      }
    }

    // ✅ Get cache information (size, items)
    async getCacheInfo() {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const allKeys = await store.getAllKeys();
        const count = allKeys.length;

        // Estimate size (Note: this is approximate)
        let size = 0;
        const allItems = await store.getAll();
        allItems.forEach((item) => {
          if (item.blob && item.blob.size) {
            size += item.blob.size;
          }
        });

        return {
          count,
          size: (size / (1024 * 1024)).toFixed(2) + " MB",
          items: allItems.map((item) => ({
            cid: item.cid,
            fileName: item.fileName,
            mimeType: item.mimeType,
            isPublic: item.isPublic,
            storedAt: item.storedAt,
            lastAccessed: item.lastAccessed,
          })),
        };
      } catch (error) {
        console.error("❌ Failed to get cache info:", error);
        return null;
      }
    }

    // ✅ Optional: Clear entire cache
    async clearCache() {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        await tx.objectStore(STORE_NAME).clear();
        await tx.done;
        console.log("🧹 Cache cleared");
        return true;
      } catch (error) {
        console.error("❌ Failed to clear cache:", error);
        return false;
      }
    }

    // ✅ Optional: Cleanup old items
    async cleanupOldItems(maxAgeDays = 30, maxSizeMB = 500) {
      try {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("lastAccessed");

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

        let cursor = await index.openCursor();
        while (cursor) {
          if (cursor.value.lastAccessed < cutoffDate) {
            cursor.delete();
          }
          cursor = await cursor.continue();
        }

        await tx.done;
        console.log(`🧹 Cleaned up cache items older than ${maxAgeDays} days`);
        return true;
      } catch (error) {
        console.error("Cache cleanup failed:", error);
        return false;
      }
    }
  }

  MediaCacheClass = BrowserMediaCache;
} else {
  // Server/Node.js or native: Use a mock that doesn't crash
  class ServerMediaCache {
    // Inside mediaCache.saveMedia
    async saveMedia(cid, blob, mimeType, fileName) {
      const db = await this.getDB(); // Ensure DB is open

      // WRONG: const tx = db.transaction(...) -> await something -> tx.store.put()
      // RIGHT:
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("media", "readwrite");
        const store = transaction.objectStore("media");

        const request = store.put({
          cid,
          blob,
          mimeType,
          fileName,
          timestamp: Date.now(),
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async getMedia(cid) {
      console.log("ServerMediaCache: getMedia called (no-op)");
      return null;
    }

    async hasMedia(cid) {
      console.log("ServerMediaCache: hasMedia called (no-op)");
      return false;
    }

    async deleteMedia(cid) {
      console.log("ServerMediaCache: deleteMedia called (no-op)");
      return true;
    }

    async getCacheInfo() {
      console.log("ServerMediaCache: getCacheInfo called (no-op)");
      return {
        count: 0,
        size: "0 MB",
        items: [],
      };
    }

    async clearCache() {
      console.log("ServerMediaCache: clearCache called (no-op)");
      return true;
    }

    async cleanupOldItems() {
      console.log("ServerMediaCache: cleanupOldItems called (no-op)");
      return true;
    }
  }

  MediaCacheClass = ServerMediaCache;
}

// Create singleton instance
const mediaCacheInstance = new MediaCacheClass();
export const mediaCache = mediaCacheInstance;
