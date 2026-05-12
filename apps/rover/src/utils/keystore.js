const DB_NAME = 'openintel';
const DB_VERSION = 3;
const STORE_NAME = 'keys';
const LEGACY_TAGS_STORE_NAME = 'tags';
const KEY_ID = 'encryption_key';
const SESSION_FLAG = 'openintel_key_session';

const keyId = (region) => region ? `${KEY_ID}.${region}` : KEY_ID;
const sessionFlag = (region) => region ? `${SESSION_FLAG}.${region}` : SESSION_FLAG;

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

export async function saveKey(cryptoKey, persist, region = null) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put({ key: cryptoKey, session: !persist }, keyId(region));
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
    if (!persist) {
        sessionStorage.setItem(sessionFlag(region), '1');
    }
}

export async function loadKey(region = null) {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(keyId(region));
        req.onsuccess = (e) => resolve(e.target.result ?? null);
        req.onerror = (e) => reject(e.target.error);
    });
    if (!record) return null;
    if (record.session && !sessionStorage.getItem(sessionFlag(region))) {
        await clearKey(region);
        return null;
    }
    return record.key;
}

export async function clearKey(region = null) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(keyId(region));
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
    sessionStorage.removeItem(sessionFlag(region));
}
