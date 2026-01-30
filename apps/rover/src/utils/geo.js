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