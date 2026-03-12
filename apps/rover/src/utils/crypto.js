const PBKDF2_ITERATIONS = 310000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

export async function deriveKey(password, saltHex) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: hexToBytes(saltHex),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

export async function encryptText(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plaintext),
    );
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);
    return btoa(String.fromCharCode(...combined));
}

export async function decryptText(key, base64Ciphertext) {
    const bytes = Uint8Array.from(atob(base64Ciphertext), (c) => c.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, IV_LENGTH) },
        key,
        bytes.slice(IV_LENGTH),
    );
    return new TextDecoder().decode(plaintext);
}

export async function encryptBytes(key, arrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        arrayBuffer,
    );
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);
    return combined.buffer;
}

export async function decryptBytes(key, arrayBuffer) {
    const view = new Uint8Array(arrayBuffer);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: view.slice(0, IV_LENGTH) },
        key,
        view.slice(IV_LENGTH),
    );
}
