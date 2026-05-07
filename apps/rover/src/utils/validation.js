// Consts

const descriptionMaxLen = 300;
const imageMaxBytes = 10 * 1024 * 1024;
const tagMaxLen = 64;
const tagsMaxCount = 30;
const intelTypeConfirmed = "confirmed";
const intelTypeUnconfirmed = "unconfirmed";

// Functions

const validateDescription = (description) => {
    if (typeof description !== "string") return "Description must be a string.";
    if (description.length > descriptionMaxLen) return `Description must be ${descriptionMaxLen} characters or fewer.`;
    return null;
};

const validateImage = (image) => {
    if (image === null || image === undefined) return null;
    if (typeof image !== "string") return "Image must be a base64 string.";
    const base64 = image.includes(",") ? image.split(",")[1] : image;
    const bytes = Math.ceil((base64.length * 3) / 4);
    if (bytes > imageMaxBytes) return "Image exceeds the maximum size of 10 MB.";
    return null;
};

const validateTags = (tags) => {
    if (!Array.isArray(tags)) return "Tags must be a list.";
    if (tags.length > tagsMaxCount) return `Too many tags — maximum is ${tagsMaxCount}.`;
    if (!tags.every((t) => typeof t === "string")) return "Each tag must be a string.";
    if (tags.some((t) => t.length > tagMaxLen)) return `Each tag must be ${tagMaxLen} characters or fewer.`;
    return null;
};

const validateCoords = (lat, lon) => {
    const latMissing = lat === null || lat === undefined;
    const lonMissing = lon === null || lon === undefined;
    if (latMissing && lonMissing) return null;
    if (latMissing || lonMissing) return "Both latitude and longitude must be provided together.";
    if (typeof lat !== "number" || typeof lon !== "number") return "Coordinates must be numbers.";
    if (lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
    if (lon < -180 || lon > 180) return "Longitude must be between -180 and 180.";
    return null;
};

export { descriptionMaxLen, imageMaxBytes, intelTypeConfirmed, intelTypeUnconfirmed, validateDescription, validateImage, validateTags, validateCoords };
