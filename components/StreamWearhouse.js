// StreamWarehouse.js
class StreamWarehouse {
  constructor() {
    this.dbName = "StreamWarehouse";
    this.storeName = "chunks";
    this.metadataStoreName = "stream_metadata"; // New store for stream status
    this.version = 2; // Increment version for new store
    this.CHUNK_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  async _getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
        // Add metadata store for stream status
        if (!db.objectStoreNames.contains(this.metadataStoreName)) {
          db.createObjectStore(this.metadataStoreName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Update saveChunk to include timestamp
  async saveChunk(sessionId, index, data) {
    const db = await this._getDB();
    const storageKey = `${sessionId}_${index}`;

    // Store chunk with metadata
    const chunkData = {
      data: data,
      timestamp: Date.now(),
      sessionId: sessionId,
      index: index,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(chunkData, storageKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Update getChunk to return just the data
  async getChunk(sessionId, index) {
    const db = await this._getDB();
    const storageKey = `${sessionId}_${index}`;
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(storageKey);
      request.onsuccess = () => {
        const chunkData = request.result;
        resolve(chunkData?.data || null);
      };
      request.onerror = () => resolve(null);
    });
  }

  // New: Save stream metadata (status, endedAt, etc)
  async saveStreamMetadata(sessionId, metadata) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metadataStoreName, "readwrite");
      tx.objectStore(this.metadataStoreName).put(
        {
          ...metadata,
          updatedAt: Date.now(),
        },
        sessionId,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // New: Get stream metadata
  async getStreamMetadata(sessionId) {
    const db = await this._getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(this.metadataStoreName, "readonly");
      const request = tx.objectStore(this.metadataStoreName).get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  // New: Mark stream as ended with 1-hour TTL
  async endStream(sessionId) {
    const endedAt = Date.now();
    const expiresAt = endedAt + this.CHUNK_TTL;

    await this.saveStreamMetadata(sessionId, {
      status: "ended",
      endedAt: endedAt,
      expiresAt: expiresAt,
    });

    console.log(`📼 Stream ${sessionId} ended, expires in 1 hour`);
    return expiresAt;
  }

  // New: Check if stream is expired
  async isStreamExpired(sessionId) {
    const metadata = await this.getStreamMetadata(sessionId);
    if (!metadata || metadata.status !== "ended") return false;
    return Date.now() > metadata.expiresAt;
  }

  // New: Get stream status
  async getStreamStatus(sessionId) {
    const metadata = await this.getStreamMetadata(sessionId);
    if (!metadata) return "live"; // Assume live if no metadata

    if (metadata.status === "ended") {
      if (Date.now() > metadata.expiresAt) {
        return "expired";
      }
      return "ended";
    }
    return metadata.status;
  }

  // Modified: Clear session only if expired
  async clearExpiredSession(sessionId) {
    const isExpired = await this.isStreamExpired(sessionId);
    if (!isExpired) return false;

    await this.clearSession(sessionId);

    // Also clear metadata
    const db = await this._getDB();
    const tx = db.transaction(this.metadataStoreName, "readwrite");
    tx.objectStore(this.metadataStoreName).delete(sessionId);

    console.log(`🧹 Cleared expired session: ${sessionId}`);
    return true;
  }

  // Modified: Clear old sessions with TTL check
  async clearOldSessions(activeSessionIds = []) {
    const db = await this._getDB();

    // Get all chunk keys
    const tx1 = db.transaction(this.storeName, "readonly");
    const store = tx1.objectStore(this.storeName);
    const allKeys = await new Promise((resolve) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
    });

    // Group keys by session
    const sessionChunks = {};
    allKeys.forEach((key) => {
      const sessionId = key.split("_")[0];
      if (!sessionChunks[sessionId]) sessionChunks[sessionId] = [];
      sessionChunks[sessionId].push(key);
    });

    // Check each session
    for (const sessionId of Object.keys(sessionChunks)) {
      // Skip active sessions
      if (activeSessionIds.includes(sessionId)) continue;

      const isExpired = await this.isStreamExpired(sessionId);
      if (isExpired) {
        // Delete all chunks for this session
        const tx2 = db.transaction(this.storeName, "readwrite");
        const writeStore = tx2.objectStore(this.storeName);
        sessionChunks[sessionId].forEach((key) => {
          writeStore.delete(key);
        });

        // Delete metadata
        const tx3 = db.transaction(this.metadataStoreName, "readwrite");
        tx3.objectStore(this.metadataStoreName).delete(sessionId);

        console.log(`🧹 Janitor: Deleted expired session ${sessionId}`);
      }
    }
  }

  // Modified: Delete old chunks but keep header and recent chunks
  async deleteOldChunks(sessionId, keepAfterIndex) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);

    const range = IDBKeyRange.bound(
      `${sessionId}_0`,
      `${sessionId}_${keepAfterIndex - 1}`,
    );

    const request = store.openKeyCursor(range);
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        // Keep header (index -1) and chunks after keepAfterIndex
        if (!cursor.key.includes("_-1")) {
          store.delete(cursor.key);
        }
        cursor.continue();
      }
    };
  }

  // New: Get time until expiry for UI
  async getTimeUntilExpiry(sessionId) {
    const metadata = await this.getStreamMetadata(sessionId);
    if (!metadata || metadata.status !== "ended") return null;

    const timeLeft = metadata.expiresAt - Date.now();
    if (timeLeft <= 0) return "expired";

    const minutesLeft = Math.round(timeLeft / (60 * 1000));
    if (minutesLeft < 60) return `${minutesLeft} minutes`;
    return `${Math.round(minutesLeft / 60)} hours`;
  }

  // Keep your existing methods
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
