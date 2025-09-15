// Lightweight IndexedDB helpers for mirroring history locally

export type HistoryItem = {
  id: string;
  createdAt: number;
  sessionId?: string;
  prompt?: string;
  result?: string;
  resultType?: 'text' | 'image';
  metadata?: any;
};

const DB_NAME = 'ai_history_db';
const STORE_NAME = 'history';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHistoryItem(item: HistoryItem): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('saveHistoryItem failed', e);
  }
}

export async function loadHistoryItems(limit = 200): Promise<HistoryItem[]> {
  try {
    const db = await openDB();
    const items: HistoryItem[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      // Iterate descending by createdAt
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && items.length < limit) {
          items.push(cursor.value as HistoryItem);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch (e) {
    console.warn('loadHistoryItems failed', e);
    return [];
  }
}

