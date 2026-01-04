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

  async saveChunk(index, data) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(data, index);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getChunk(index) {
    const db = await this._getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(index);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  // Prevents the "Infinite Storage" bug on iPhones
  async deleteOldChunks(keepAfterIndex) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, "readwrite");
    const store = tx.objectStore(this.storeName);
    const request = store.openKeyCursor(
      IDBKeyRange.upperBound(keepAfterIndex - 1)
    );

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        store.delete(cursor.key);
        cursor.continue();
      }
    };
  }
}

export const warehouse = new StreamWarehouse();
