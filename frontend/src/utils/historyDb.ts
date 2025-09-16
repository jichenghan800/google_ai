// Lightweight IndexedDB helpers for mirroring history locally

export type HistoryItem = {
  id: string;
  createdAt: number;
  sessionId?: string;
  prompt?: string;
  result?: string;
  resultType?: 'text' | 'image';
  metadata?: any;
  // 新增：来源模块与左侧预览（用于编辑/分析恢复）
  mode?: 'generate' | 'edit' | 'analyze';
  inputPreviews?: string[];
  // 新增：手动隐藏标记（用于抑制自动回填）
  hidden?: boolean;
  hiddenAt?: number;
};

const DB_NAME = 'ai_history_db';
const STORE_NAME = 'history';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        try { store.createIndex('mode', 'mode', { unique: false }); } catch {}
      } else {
        // 迁移：补充缺失索引
        try {
          const store = (req.transaction as IDBTransaction).objectStore(STORE_NAME);
          if (!store.indexNames.contains('mode')) {
            store.createIndex('mode', 'mode', { unique: false });
          }
        } catch {}
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

export async function getHistoryItemById(id: string): Promise<HistoryItem | null> {
  try {
    const db = await openDB();
    const item = await new Promise<HistoryItem | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as HistoryItem) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return item;
  } catch (e) {
    console.warn('getHistoryItemById failed', e);
    return null;
  }
}

// Update hidden flag on a single history record
export async function updateHistoryHidden(id: string, hidden: boolean): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result as HistoryItem | undefined;
        if (!item) { resolve(); return; }
        const updated = { ...item, hidden, hiddenAt: hidden ? Date.now() : undefined } as HistoryItem;
        store.put(updated);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('updateHistoryHidden failed', e);
  }
}

// Delete a single history record by id
export async function deleteHistoryItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('deleteHistoryItem failed', e);
  }
}

// Clear all history records
export async function clearHistory(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('clearHistory failed', e);
  }
}
