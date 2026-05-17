const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH5_LON_STEP = 360 / 8192;
const GEOHASH5_LAT_STEP = 180 / 4096;

export const MIN_LAT = -90;
export const MAX_LAT = 90;
export const MIN_LON = -180;
export const MAX_LON = 180;

export const coordsToGeohash5 = (lat, lon) => {
    let minLat = MIN_LAT, maxLat = MAX_LAT;
    let minLon = MIN_LON, maxLon = MAX_LON;
    let hash = '';
    let bits = 0;
    let hashValue = 0;
    let isEven = true;
    while (hash.length < 5) {
        if (isEven) {
            const mid = (minLon + maxLon) / 2;
            if (lon >= mid) { hashValue = (hashValue << 1) | 1; minLon = mid; }
            else { hashValue = hashValue << 1; maxLon = mid; }
        } else {
            const mid = (minLat + maxLat) / 2;
            if (lat >= mid) { hashValue = (hashValue << 1) | 1; minLat = mid; }
            else { hashValue = hashValue << 1; maxLat = mid; }
        }
        isEven = !isEven;
        if (++bits === 5) {
            hash += GEOHASH_ALPHABET[hashValue];
            bits = 0;
            hashValue = 0;
        }
    }
    return hash;
};

export const bboxToGeohash5Cells = (minLat, minLon, maxLat, maxLon) => {
    const startLon = Math.floor((minLon - MIN_LON) / GEOHASH5_LON_STEP) * GEOHASH5_LON_STEP + MIN_LON;
    const startLat = Math.floor((minLat - MIN_LAT) / GEOHASH5_LAT_STEP) * GEOHASH5_LAT_STEP + MIN_LAT;
    const cells = [];
    for (let lat = startLat; lat < maxLat + GEOHASH5_LAT_STEP; lat += GEOHASH5_LAT_STEP) {
        for (let lon = startLon; lon < maxLon + GEOHASH5_LON_STEP; lon += GEOHASH5_LON_STEP) {
            const centerLat = lat + GEOHASH5_LAT_STEP / 2;
            const centerLon = lon + GEOHASH5_LON_STEP / 2;
            if (centerLat >= MIN_LAT && centerLat <= MAX_LAT && centerLon >= MIN_LON && centerLon <= MAX_LON) {
                cells.push(coordsToGeohash5(centerLat, centerLon));
            }
        }
    }
    return cells;
};

export const HAVERSINE_EARTH_RADIUS_KM = 6371;

export const degToRad = (degrees) => {
    return degrees * Math.PI / 180.0;
};

export const radToDeg = (radians) => {
    return radians * 180.0 / Math.PI;
};

export const normalizeLongitude = (lon) => {
    return ((lon + 180.0) % 360.0) - 180.0;
};

export const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const lat1Rad = degToRad(lat1);
    const lat2Rad = degToRad(lat2);
    const deltaLonRad = degToRad(lon2 - lon1);
    const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);
    return (radToDeg(Math.atan2(y, x)) + 360) % 360;
};

export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
    const lat1Rad = degToRad(lat1);
    const lat2Rad = degToRad(lat2);
    const deltaLatRad = degToRad(lat2 - lat1);
    const deltaLonRad = degToRad(lon2 - lon1);
    const a = Math.sin(deltaLatRad / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) ** 2;
    return HAVERSINE_EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const calculateSimpleCoord = (lat, lon, distanceInKM, bearing) => {
    const angularDistance = distanceInKM / HAVERSINE_EARTH_RADIUS_KM;
    const lat1Rad = degToRad(lat);
    const bearingRad = degToRad(bearing);
    const lat2Rad = Math.asin(Math.sin(lat1Rad) * Math.cos(angularDistance) + 
        Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad));

    const lon1Rad = degToRad(lon);
    const lon2Rad = lon1Rad + Math.atan2(
            Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad),
            Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
        );
    const lat2Deg = radToDeg(lat2Rad);
    const lon2Deg = radToDeg(lon2Rad);
    const lon2DegNormalized = normalizeLongitude(lon2Deg);
    // TODO: currently problematic at the north and south poles
    // will need a latitude correction if require a wrap around
    return [lon2DegNormalized, lat2Deg];
};

export const pointInBounds = (lat, lon, bounds) => {
    if (!bounds) return true;
    return lat >= bounds.minLat && lat <= bounds.maxLat &&
           lon >= bounds.minLon && lon <= bounds.maxLon;
};