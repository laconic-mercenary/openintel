import { DB_NAME, DB_VERSION, TAGS_STORE_NAME } from './keystore.js';

const MAX_TAGS = 1500;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function saveTags(tags) {
    if (!tags || tags.length === 0) return;
    const db = await openDB();
    const now = Date.now();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(TAGS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(TAGS_STORE_NAME);
        tags.forEach((tag) => store.put({ tag, lastUsed: now }));
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
    await trimTags(db);
}

export async function loadTags() {
    const db = await openDB();
    const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(TAGS_STORE_NAME, 'readonly');
        const req = tx.objectStore(TAGS_STORE_NAME).getAll();
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
    records.sort((a, b) => b.lastUsed - a.lastUsed);
    return records.map((r) => r.tag);
}

async function trimTags(db) {
    const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(TAGS_STORE_NAME, 'readonly');
        const req = tx.objectStore(TAGS_STORE_NAME).getAll();
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
    if (records.length <= MAX_TAGS) return;
    console.warn(`tag store exceeded ${MAX_TAGS} entries (${records.length}) — trimming oldest`);
    records.sort((a, b) => a.lastUsed - b.lastUsed);
    const toDelete = records.slice(0, records.length - MAX_TAGS).map((r) => r.tag);
    await new Promise((resolve, reject) => {
        const tx = db.transaction(TAGS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(TAGS_STORE_NAME);
        toDelete.forEach((tag) => store.delete(tag));
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}
