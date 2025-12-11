// mediaCache.js
import { openDB } from 'idb';

// Database configuration
const DB_NAME = 'MediaCache';
const DB_VERSION = 1;
const STORE_NAME = 'media';

class MediaCache {
  constructor() {
    this.dbPromise = this.#initDB();
  }

  // Private method to initialize/upgrade the database
  async #initDB() {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create the object store with 'cid' as the keyPath
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'cid' });
          // Create an index on 'lastAccessed' for potential cleanup operations
          store.createIndex('lastAccessed', 'lastAccessed');
        }
      },
    });
  }

  // ✅ Save a media blob (video/image) with its metadata
  async saveMedia(cid, blob, mimeType, fileName) {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item = {
        cid,
        blob,
        mimeType, // e.g., 'video/mp4', 'image/jpeg'
        fileName,
        lastAccessed: new Date(), // Track usage for cache management
        storedAt: new Date(),
      };

      await store.put(item);
      await tx.done;
      console.log(`✅ Media cached: ${cid}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save media to IndexedDB:', error);
      return false;
    }
  }

  // ✅ Retrieve media blob by CID (returns null if not found)
  async getMedia(cid) {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const item = await store.get(cid);

      if (item) {
        // Update lastAccessed timestamp on successful read
        item.lastAccessed = new Date();
        const updateTx = db.transaction(STORE_NAME, 'readwrite');
        await updateTx.objectStore(STORE_NAME).put(item);
        await updateTx.done;

        console.log(`✅ Cache HIT for CID: ${cid}`);
        // Return the blob and metadata
        return {
          blob: item.blob,
          mimeType: item.mimeType,
          fileName: item.fileName,
        };
      }

      console.log(`❌ Cache MISS for CID: ${cid}`);
      return null;
    } catch (error) {
      console.error('❌ Failed to retrieve media from IndexedDB:', error);
      return null;
    }
  }

  // ✅ Check if a CID exists in cache (fast check, doesn't load blob)
  async hasMedia(cid) {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const key = await store.getKey(cid);
      return key !== undefined;
    } catch (error) {
      console.error('❌ Failed to check cache existence:', error);
      return false;
    }
  }

  // ✅ Delete a specific item from cache
  async deleteMedia(cid) {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.objectStore(STORE_NAME).delete(cid);
      await tx.done;
      console.log(`🗑️  Deleted from cache: ${cid}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete media from cache:', error);
      return false;
    }
  }

  // ✅ Get cache information (size, items)
  async getCacheInfo() {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const allKeys = await store.getAllKeys();
      const count = allKeys.length;

      // Estimate size (Note: this is approximate)
      let size = 0;
      const allItems = await store.getAll();
      allItems.forEach(item => {
        if (item.blob && item.blob.size) {
          size += item.blob.size;
        }
      });

      return {
        count,
        size: (size / (1024 * 1024)).toFixed(2) + ' MB',
        items: allItems.map(item => ({
          cid: item.cid,
          fileName: item.fileName,
          mimeType: item.mimeType,
          storedAt: item.storedAt,
          lastAccessed: item.lastAccessed,
        })),
      };
    } catch (error) {
      console.error('❌ Failed to get cache info:', error);
      return null;
    }
  }

  // ✅ Optional: Clear entire cache
  async clearCache() {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.objectStore(STORE_NAME).clear();
      await tx.done;
      console.log('🧹 Cache cleared');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const mediaCache = new MediaCache();
