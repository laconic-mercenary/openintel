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
        },
        layers: [
            { 
                id: "osm-tiles", 
                type: "raster", 
                source: "osm" 
            }
        ],
    };

    
    // State

    // References
    const roverMapRef = useRef(null);
    const roverMapContainerRef = useRef(null);

    // Effects
    useEffect(() => {
        if (roverMapContainerRef.current) {
            if (!roverMapRef.current) {
                initializeMap();
            }
        }
        return () => cleanupMap();
    }, []);


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