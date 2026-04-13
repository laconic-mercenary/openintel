export const getSession = async () => {
    const response = await fetch('/auth/me');
    if (response.status === 401) return null;
    if (!response.ok) {
        throw new Error(`failed to get session: ${response.status}`);
    }
    const { salt } = await response.json();
    return salt;
};

export const storeIntel = async (intelPoint) => {
    const response = await fetch("/rover/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            key: intelPoint.key,
            geohash: intelPoint.geohash,
            encryptedPayload: intelPoint.encryptedPayload,
            image: intelPoint.encryptedImage,
            timestamp: intelPoint.timestamp,
        }),
    });
    if (!response.ok) {
        throw new Error(`failed to store intel: ${response.status}`);
    }
    return response.json();
};

export const listIntel = async (minLat, minLon, maxLat, maxLon) => {
    const params = new URLSearchParams({ minLat, minLon, maxLat, maxLon });
    const response = await fetch(`/rover/intel?${params}`);
    if (!response.ok) {
        throw new Error(`failed to list intel: ${response.status}`);
    }
    return response.json();
};

export const getIntelImageUrl = async (intelPoint) => {
    const response = await fetch(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`);
    if (!response.ok) {
        throw new Error(`failed to get intel image url: ${response.status}`);
    }
    const { url } = await response.json();
    return url;
};

export const logout = async () => {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (!response.ok) {
        throw new Error(`failed to logout: ${response.status}`);
    }
};

export const updateIntel = async (intelPoint) => {
    const response = await fetch(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`, {
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
    const response = await fetch(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`failed to delete intel: ${response.status}`);
    }
};
