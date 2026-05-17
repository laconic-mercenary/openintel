// consts and globals

const exportVersion = 1;
const maxImagesPerFile = 50;
const maxItemsPerFile = 500;

// functions

const bytesToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

const computeHash = (item) => {
    const input = `${item.latitude}|${item.longitude}|${item.description ?? ''}|${item.timestamp}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

const estimateFileCount = (items) => {
    const imageCount = items.filter((p) => p.hasImage).length;
    const byImages = Math.ceil(imageCount / maxImagesPerFile) || 1;
    const byItems = Math.ceil(items.length / maxItemsPerFile) || 1;
    return Math.max(byImages, byItems);
};

const downloadFile = (filename, data) => {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (downloadErr) {
        throw new Error(`download failed for ${filename}: ${downloadErr.message}`);
    }
};

export const exportIntel = async (items, cryptoKey, getIntelDetails, decryptBytes, getComments, decryptText, onProgress, isCancelled) => {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);
    const totalFiles = estimateFileCount(items);

    let batch = [];
    let imageCount = 0;
    let fileIndex = 1;
    let itemsProcessed = 0;

    const flush = async () => {
        if (batch.length === 0) return;
        const filename = `openintel-export-${timestamp}-${String(fileIndex).padStart(3, '0')}.json`;
        downloadFile(filename, {
            version: exportVersion,
            exported: new Date().toISOString(),
            file: fileIndex,
            items: batch,
        });
        fileIndex++;
        batch = [];
        imageCount = 0;
        await new Promise((r) => setTimeout(r, 300));
    };

    for (const item of items) {
        if (isCancelled?.()) return;
        const wouldExceedImages = item.hasImage && imageCount >= maxImagesPerFile;
        const wouldExceedItems = batch.length >= maxItemsPerFile;

        if (wouldExceedImages || wouldExceedItems) {
            await flush();
        }

        const hash = computeHash(item);

        let b64image = null;
        if (item.hasImage) {
            const details = await getIntelDetails(item);
            if (!details.url) {
                console.warn('export: item has hasImage=true but no url, skipping image', item.key);
            } else {
                const imageResponse = await fetch(details.url);
                if (!imageResponse.ok) throw new Error(`image fetch failed: ${imageResponse.status} for key ${item.key}`);
                const encrypted = await imageResponse.arrayBuffer();
                const decrypted = await decryptBytes(cryptoKey, encrypted);
                b64image = bytesToBase64(decrypted);
            }
            imageCount++;
        }

        let comments = [];
        try {
            const rawComments = await getComments(item);
            for (const comment of rawComments) {
                try {
                    const text = await decryptText(cryptoKey, comment.encryptedText);
                    comments.push({ rowKey: comment.rowKey, text, createdAt: comment.createdAt });
                } catch {
                    console.warn('export: failed to decrypt comment', comment.rowKey);
                }
            }
        } catch {
            console.warn('export: failed to fetch comments for item', item.key);
        }

        batch.push({
            key: item.key,
            geohash: item.geohash,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            description: item.description,
            tags: item.tags ?? [],
            timestamp: item.timestamp,
            planned: item.planned ?? false,
            hasImage: item.hasImage,
            b64image,
            hash,
            comments,
        });

        itemsProcessed++;
        onProgress?.({
            fileIndex,
            totalFiles,
            itemsInBatch: batch.length,
            itemsProcessed,
            totalItems: items.length,
        });
    }

    await flush();
};

export { estimateFileCount };
