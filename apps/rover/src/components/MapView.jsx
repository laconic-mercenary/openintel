import { useState, useEffect, useRef } from "react";

import "./MapView.css";

import { Map as MLMap, Marker } from "maplibre-gl";

import { calculateSimpleCoord } from "../utils/geo";

export default function MapView({ position, intelPoints, onKeepIntel, onDiscardIntel, geolocationIsEnabled }) {

    // Consts
    
    const rasterTileSize = 256;
    const accuracyZonePointsCount = 20;
    const rasterStyle = {
        version: 8,
        sources: {
            osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: rasterTileSize,
                attribution: "(c) OpenStreetMap Contributors",
            },
            user: {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
            },
        },
        layers: [
            { 
                id: "osm-tiles", 
                type: "raster", 
                source: "osm" 
            },
            {
                id: "accuracy",
                type: "fill",
                source: "user",
                filter: ["==", ["get", "kind"], "accuracy"],
                paint: {
                    "fill-color": "rgba(0, 150, 255, 0.15)",
                    "fill-outline-color": "rgba(0, 150, 255, 0.5)",
                },
            },
            {
                id: "position",
                type: "circle",
                source: "user",
                filter: ["==", ["get", "kind"], "position"],
                paint: {
                    "circle-radius": 6,
                    "circle-color": "blue",
                    "circle-stroke-color": "#fff",
                    "circle-stroke-width": 2,
                },
            },
            {
                id: "heading",
                type: "line",
                source: "user",
                filter: ["==", ["get", "kind"], "heading"],
                paint: {
                    "line-color": "blue",
                    "line-width": 2,
                },
            },
        ],
        center: [
            0,
            0,
        ],
        zoom: 14 //TODO - determine algorithmically
    };

    // State

    // References

    const roverMapRef = useRef(null);
    const roverMapContainerRef = useRef(null);
    const roverMarkersRef = useRef(new Map());
    const keepIntelRef = useRef(onKeepIntel);
    const discardIntelRef = useRef(onDiscardIntel);

    // Effects

    useEffect(() => {
        if (!roverMapContainerRef.current) {
            return;
        }
        if (roverMapRef.current) {
            return;
        }
        initializeMap();
        return () => cleanupMap();
    }, []);

    useEffect(() => {
        keepIntelRef.current = onKeepIntel;
    }, [onKeepIntel]);

    useEffect(() => {
        discardIntelRef.current = onDiscardIntel;
    }, [onDiscardIntel]);

    useEffect(() => {
        if (!geolocationIsEnabled) {
            clearAllFeatures();
        }
    }, [geolocationIsEnabled]);

    useEffect(() => {
        if (!position) {
            console.warn("position is not ready");
            return;
        }
        renderCurrentPosition(position.coords);
        return () => null;
    }, [position]);

    useEffect(() => {
        if (!intelPoints) {
            console.warn("no intel points to put on map");
            return;
        }
        renderIntelPoints(intelPoints);
        sendMapToLatest(intelPoints);
        console.debug(intelPoints);
        return () => null;
    }, [intelPoints]);

    // Methods

    const initializeMap = () => {
        roverMapRef.current = new MLMap({
            container: roverMapContainerRef.current,
            style: rasterStyle,
            center: [0, 0],
            zoom: 2
        });
    };

    const cleanupMap = () => {
        roverMapRef.current?.remove();
        roverMapRef.current = null;
    };

    const calculateAccuracyCircle = (lat, lon, radiusMeters, pointsCount) => {
        if (pointsCount <= 0) {
            console.error("pointsCount is 0 - this would result in div by zero");
            return [];
        }
        const circularDegrees = 360.0;
        const bearingStep = circularDegrees / pointsCount;
        const bearings = Array.from({length: pointsCount + 1}, (_, index) => index * bearingStep);
        const radiusInKM = radiusMeters / 1000.0;
        const circleCoords = [];
        for (const bearing of bearings) {
            const coord = calculateSimpleCoord(lat, lon, radiusInKM, bearing);
            circleCoords.push(coord);
        }
        return circleCoords;
    };

    const clearAllFeatures = () => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready yet");
            return;
        }
        const features = [];
        if (map.isStyleLoaded()) {
            map.getSource("user")?.setData({
                type: "FeatureCollection",
                features,
            });
        } else {
            map.once("load", () => {
                map.getSource("user")?.setData({
                    type: "FeatureCollection",
                    features,
                });
            });
        }
    }

    const renderCurrentPosition = (coords) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready yet");
            return;
        }
        if (!position.coords) {
            console.warn("coordinates are not available");
            return;
        }

        const features = [];
        const accuracyZonePoints = calculateAccuracyCircle(
                                        coords.latitude, 
                                        coords.longitude, 
                                        coords.accuracy, 
                                        accuracyZonePointsCount
                                    );
        const currentLocation = {
            type: "Feature",
            properties: {
                kind: "position"
            },
            geometry: {
                type: "Point",
                coordinates: [
                    coords.longitude,
                    coords.latitude,
                ]
            }
        };
        const accuracyZone = {
            type: "Feature",
            properties: {
                kind: "accuracy"
            },
            geometry: {
                type: "Polygon",
                coordinates: [accuracyZonePoints],
            }
        };

        features.push(currentLocation);
        features.push(accuracyZone);

        if (map.isStyleLoaded()) {
            map.getSource("user")?.setData({
                type: "FeatureCollection",
                features,
            });
        } else {
            map.once("load", () => {
                map.getSource("user")?.setData({
                    type: "FeatureCollection",
                    features,
                });
            });
        }
    };

    const sendMapToLatest = (intelPoints) => {
        if (intelPoints.length === 0) {
            console.warn("no points - will not navigate the map");
            return;
        }
        const lastPoint = intelPoints.at(-1);
        sendMapToPosition({ 
            longitude: lastPoint.longitude, 
            latitude: lastPoint.latitude 
        });
    }

    const sendMapToPosition = (coords) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready");
            return;
        }
        map.flyTo({
            center: [
                coords.longitude,
                coords.latitude
            ],
            zoom: 14 // TODO algo determine this
        });
    }

    const renderIntelPoints = (points) => {
        if (!roverMapRef.current) {
            console.warn("map is not ready");
            return;
        }

        const map = roverMapRef.current;
        const mapMarkers = roverMarkersRef.current;

        points.forEach((point) => {
            const existingPoint = mapMarkers.get(point.key);
            if (!existingPoint) {
                mapMarkers.set(
                    point.key,
                    newMapElement(point).addTo(map),
                );
                console.info(`added new point ${point.key} to map`);
            }
        });

        for (const [key, marker] of mapMarkers) {
            const stillExists = points.some(
                (point) => point.key === key
            )
            if (!stillExists) {
                marker.remove();
                mapMarkers.delete(key);
                console.info(`removed old point ${key} to map`);
            }
        }
    };

    const newMapElement = (intelPoint) => {
        const mapElement = document.createElement("div");
        mapElement.className = "intel-marker";
        mapElement.innerHTML = `
        <div class="intel-tab">
            <img class="intel-thumb" src="https://placehold.co/80x80" />
        </div>
        <div class="intel-actions">
            <button class="intel-btn left">Keep</button>
            <button class="intel-btn right">Delete</button>
        </div>
        `;
        mapElement.addEventListener("click", (e) => {
            const action = e.target?.dataset?.action;
            if (action === "keep") {
                invokeKeepIntel(intelPoint);
            } else if (action === "discard") {
                invokeDiscardIntel(intelPoint);
            }
        });
        const longitude = intelPoint.longitude;
        const latitude = intelPoint.latitude;
        return new Marker({ element: mapElement }).setLngLat([longitude, latitude]);
    };

    // Evemts

    const invokeKeepIntel = (intelPoint) => {
        keepIntelRef.current?.(intelPoint);
    };

    const invokeDiscardIntel = (intelPoint) => {
        discardIntelRef.current?.(intelPoint);
    };

    // DOM
    return (
        <div className="map-rover" ref={roverMapContainerRef}></div>
    )
}