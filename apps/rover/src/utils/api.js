const SALT_KEY = 'openintel_salt';

export const storeSalt = (salt) => {
    localStorage.setItem(SALT_KEY, salt);
};

export const getSalt = async () => {
    const stored = localStorage.getItem(SALT_KEY);
    if (stored) return stored;
    const response = await fetch('/auth/salt');
    if (!response.ok) {
        throw new Error(`failed to get salt: ${response.status}`);
    }
    const { salt } = await response.json();
    localStorage.setItem(SALT_KEY, salt);
    return salt;
};

export const storeIntel = async (intelPoint) => {
    const response = await fetch("/rover/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            key: intelPoint.key,
            image: intelPoint.b64image,
            description: intelPoint.description,
            latitude: intelPoint.latitude,
            longitude: intelPoint.longitude,
            accuracy: intelPoint.accuracy,
            timestamp: intelPoint.timestamp,
        }),
    });
    if (!response.ok) {
        throw new Error(`failed to store intel: ${response.status}`);
    }
    return response.json();
};

export const getIntelImageUrl = async (intelPoint) => {
    const response = await fetch(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}/image-url`);
    if (!response.ok) {
        throw new Error(`failed to get intel image url: ${response.status}`);
    }
    const { url } = await response.json();
    return url;
};

export const deleteIntel = async (intelPoint) => {
    const response = await fetch(`/rover/intel/${intelPoint.geohash}/${intelPoint.key}`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`failed to delete intel: ${response.status}`);
    }
};
