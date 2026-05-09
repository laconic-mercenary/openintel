// Consts

const lsKeySaveToCloudDefault = "saveToCloudDefault";
const lsKeyRecentTags = "recentTags";
const lsKeyShowFiltersOnMap = "showFiltersOnMap";
const lsKeyPinnedItems = "pinnedItems";
const lsKeyUseCurrentPosition = "useCurrentPosition";

// Functions

const storageGetBoolean = (key, defaultValue = true) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return defaultValue ? raw !== "false" : raw === "true";
};

const storageSetBoolean = (key, value) => {
    localStorage.setItem(key, String(value));
};

const storageGetJson = (key, defaultValue = null) => {
    try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
        return defaultValue;
    }
};

const storageSetJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

export {
    lsKeySaveToCloudDefault,
    lsKeyRecentTags,
    lsKeyShowFiltersOnMap,
    lsKeyPinnedItems,
    lsKeyUseCurrentPosition,
    storageGetBoolean,
    storageSetBoolean,
    storageGetJson,
    storageSetJson,
};
