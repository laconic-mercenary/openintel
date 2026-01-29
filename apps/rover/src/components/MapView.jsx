import { useState, useEffect, useRef } from "react";

import "./MapView.css";

import {Map} from 'maplibre-gl';

export default function MapView() {

    // Consts
    const rasterTileSize = 256;
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
                type: "circle",
                source: "user",
                filter: ["==", ["get", "kind"], "accuracy"],
                paint: {
                    "circle-color": "rgba(0, 150, 255, 0.15)",
                    "circle-stroke-color": "rgba(0, 150, 255, 0.5)",
                    "circle-stroke-width": 1,
                    "circle-radius": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        5, 2, 10, 10, 15, 30
                    ],
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
                filter: ["==", ["get", "kind"], "position"],
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
    const [position, setPosition] = useState(null);

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
        const mapFeatures = [];
        const currentLocation = {
            type: "Feature",
            properties: {
                kind: "position"
            },
            geometry: {
                type: "Point",
                coordinates: [
                    position.lng,
                    position.lat,
                ]
            }
        };
        const accuracyZone = {
            type: "Feature",
            properties: {
                kind: "accuracy"
            },
            geometry: {
                type: "Point",
                coordinates: [
                    position.lng,
                    position.lat,
                ]
            }
        };

        mapFeatures.push(currentLocation);
        mapFeatures.push(accuracyZone);

        roverMapRef.current.getSource("user").setData({
            type: "FeatureCollection",
            mapFeatures,
        });

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

    // DOM
    return (
        <div className="map-rover" ref={roverMapContainerRef}>
        </div>
    )
}