
// StreamWarehouse.js
class StreamWarehouse {
  constructor() {
    this.dbName = "StreamWarehouse";
    this.storeName = "chunks";
    this.version = 1;
  }

  
  async _getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // StreamWarehouse.js

  // Update saveChunk to accept sessionId
  async saveChunk(sessionId, index, data) {
    const db = await this._getDB();
    const storageKey = `${sessionId}_${index}`; // Key is now "live_123_-1"
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(data, storageKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Update getChunk to accept sessionId
  async getChunk(sessionId, index) {
    const db = await this._getDB();
    const storageKey = `${sessionId}_${index}`;
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(storageKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  // New method to clear old session data so it doesn't rot
  async clearSession(sessionId) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);
    const range = IDBKeyRange.bound(`${sessionId}_`, `${sessionId}_\uffff`);
    const request = store.openKeyCursor(range);
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        store.delete(cursor.key);
        cursor.continue();
      }
    };
  }

  // StreamWearhouse.js
  async clearOldSessions(activeSessionIds) {
    const db = await this.dbPromise;
    const allKeys = await db.getAllKeys("chunks");

    // A key looks like "session123_chunk_5"
    for (const key of allKeys) {
      const sessionId = key.split("_")[0];
      if (!activeSessionIds.includes(sessionId)) {
        await db.delete("chunks", key);
        console.log(`🧹 Janitor: Deleted stale data for session ${sessionId}`);
      }
    }
  }
  // Prevents the "Infinite Storage" bug on iPhones
  // StreamWarehouse.js
  async deleteOldChunks(sessionId, keepAfterIndex) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);

    // We target only keys belonging to THIS session
    const range = IDBKeyRange.bound(
      `${sessionId}_0`,
      `${sessionId}_${keepAfterIndex - 1}`
    );
    const request = store.openKeyCursor(range);

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        // Double check it's not the header (index -1)
        if (!cursor.key.includes("_-1")) {
          store.delete(cursor.key);
        }
        cursor.continue();
      }
    };
  }

  // Helper to wipe everything except the current session on startup
  async clearAllExcept(currentSessionId) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);
    const request = store.openKeyCursor();

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (!cursor.key.startsWith(currentSessionId)) {
          store.delete(cursor.key);
        }
        cursor.continue();
      }
    };
  }
}

export const warehouse = new StreamWarehouse();
