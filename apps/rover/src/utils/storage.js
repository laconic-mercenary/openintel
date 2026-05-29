// Consts

const lsKeySaveToCloudDefault = "saveToCloudDefault";
const lsKeyRecentTags = "recentTags";
const lsKeyShowFiltersOnMap = "showFiltersOnMap";
const lsKeyPinnedItems = "pinnedItems";
const lsKeyUseCurrentPosition = "useCurrentPosition";
const lsKeySalammboEnabled = "salammboEnabled";

// Functions

const storageGetString = (key, defaultValue = null) => {
    const raw = localStorage.getItem(key);
    return raw !== null ? raw : defaultValue;
};

const storageSetString = (key, value) => {
    if (value === null || value === undefined) {
        localStorage.removeItem(key);
    } else {
        localStorage.setItem(key, value);
    }
};

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

export { storageGetString, storageSetString };
export {
    lsKeySaveToCloudDefault,
    lsKeyRecentTags,
    lsKeyShowFiltersOnMap,
    lsKeyPinnedItems,
    lsKeyUseCurrentPosition,
    lsKeySalammboEnabled,
    storageGetBoolean,
    storageSetBoolean,
    storageGetJson,
    storageSetJson,
};
