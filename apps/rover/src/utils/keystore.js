const DB_NAME = 'openintel';
const DB_VERSION = 3;
const STORE_NAME = 'keys';
const LEGACY_TAGS_STORE_NAME = 'tags';
const KEY_ID = 'encryption_key';
const SESSION_FLAG = 'openintel_key_session';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (db.objectStoreNames.contains(LEGACY_TAGS_STORE_NAME)) {
                db.deleteObjectStore(LEGACY_TAGS_STORE_NAME);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function saveKey(cryptoKey, persist) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put({ key: cryptoKey, session: !persist }, KEY_ID);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
    if (!persist) {
        sessionStorage.setItem(SESSION_FLAG, '1');
    }
}

export async function loadKey() {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY_ID);
        req.onsuccess = (e) => resolve(e.target.result ?? null);
        req.onerror = (e) => reject(e.target.error);
    });
    if (!record) return null;
    if (record.session && !sessionStorage.getItem(SESSION_FLAG)) {
        await clearKey();
        return null;
    }
    return record.key;
}

export async function clearKey() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(KEY_ID);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
    sessionStorage.removeItem(SESSION_FLAG);
}
