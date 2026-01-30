import { useState, useEffect, useRef } from "react";

import "./MapView.css";

import { Map } from "maplibre-gl";

import { calculateSimpleCoord } from "../utils/geo";

export default function MapView({ position }) {

    // Consts
    
    const rasterTileSize = 256;
    const accuracyZonePointsCount = 10;
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
        if (!roverMapRef.current) {
            return;
        }
        if (!position) {
            return;
        }

        const features = [];
        const accuracyZonePoints = calculateAccuracyCircle(
                                        position.coords.latitude, 
                                        position.coords.longitude, 
                                        position.coords.accuracy, 
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
                    position.coords.longitude,
                    position.coords.latitude,
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

        const map = roverMapRef.current;
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

        return () => { }
    }, [position]);

    // Methods

    const initializeMap = () => {
        roverMapRef.current = new Map({
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

    // DOM
    return (
        <div className="map-rover" ref={roverMapContainerRef}></div>
    )
}