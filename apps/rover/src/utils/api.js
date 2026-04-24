// consts and globals

const requestTimeoutMs = 45000;
const requestMaxRetries = 3;

// functions

const fetchWithTimeout = async (url, options = {}, onAttempt) => {
    let lastErr;
    for (let attempt = 0; attempt < requestMaxRetries; attempt++) {
        onAttempt?.(attempt);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (fetchErr) {
            lastErr = fetchErr;
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
};

export const getSession = async () => {
    const response = await fetchWithTimeout('/auth/me');
    if (response.status === 401) return null;
    if (!response.ok) {
        throw new Error(`failed to get session: ${response.status}`);
    }
    const { salt } = await response.json();
    return salt;
};

export const storeIntel = async (intelPoint, onAttempt) => {
    const response = await fetchWithTimeout("/rover/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            key: intelPoint.key,
            geohash: intelPoint.geohash,
            encryptedPayload: intelPoint.encryptedPayload,
            image: intelPoint.encryptedImage,
            timestamp: intelPoint.timestamp,
        }),
    }, onAttempt);
    if (!response.ok) {
        throw new Error(`failed to store intel: ${response.status}`);
    }
    return response.json();
};

export const listIntel = async (minLat, minLon, maxLat, maxLon) => {
    const params = new URLSearchParams({ minLat, minLon, maxLat, maxLon });
    const response = await fetchWithTimeout(`/rover/intel?${params}`);
    if (!response.ok) {
        throw new Error(`failed to list intel: ${response.status}`);
    }
    return response.json();
};

export const getIntelImageUrl = async (intelPoint) => {
    const response = await fetchWithTimeout(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`);
    if (!response.ok) {
        throw new Error(`failed to get intel image url: ${response.status}`);
    }
    const { url } = await response.json();
    return url;
};

export const logout = async () => {
    const response = await fetchWithTimeout('/auth/logout', { method: 'POST' });
    if (!response.ok) {
        throw new Error(`failed to logout: ${response.status}`);
    }
};

export const updateIntel = async (intelPoint) => {
    const response = await fetchWithTimeout(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            encryptedPayload: intelPoint.encryptedPayload,
        }),
    });
    if (!response.ok) {
        throw new Error(`failed to update intel: ${response.status}`);
    }
};

export const deleteIntel = async (intelPoint) => {
    const response = await fetchWithTimeout(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`, {
        method: "DELETE",
    });
    if (response.status === 404) {
        return { alreadyDeleted: true };
    }
    if (!response.ok) {
        throw new Error(`failed to delete intel: ${response.status}`);
    }
    return { alreadyDeleted: false };
};
