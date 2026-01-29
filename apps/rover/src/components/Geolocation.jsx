
import { useState, useEffect, useRef } from "react";

import "./Geolocation.css"

export default function Geolocation({ onPositionReady, onPositionError, geolocationEnabled }) {

    // State

    // Consts
    const geolocationPositionTimeout = 5000;
    const geolocationOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: geolocationPositionTimeout
    };

    // References
    const geolocationHandle = useRef(null);
    const positionReadyRef = useRef(onPositionReady);
    const positionErrorRef = useRef(onPositionError);

    // Effects
    useEffect(() => {
        initialize();
        return () => cleanup();
    }, []);

    useEffect(() => {
        positionReadyRef.current = onPositionReady;
    }, [onPositionReady]);

    useEffect(() => {
        positionErrorRef.current = onPositionError;
    }, [onPositionError]);

    useEffect(() => {
        if (geolocationEnabled) {
            startPositionTracking();
        } else {
            stopPositionTracking();
        }
    }), [geolocationEnabled];

    // Methods
    const initialize = () => {
        if ("geolocation" in navigator) {
            startPositionTracking();
        } else {
            // TODO show an error to the user
            onPositionError?.(new Error("geolocation not available in the browser"));
        }
    };

    const cleanup = () => {
        stopPositionTracking();
    };

    const startPositionTracking = () => {
        stopPositionTracking();
        geolocationHandle.current = navigator.geolocation.watchPosition(
            positionReadyRef.current,
            positionErrorRef.current, 
            geolocationOptions
        );
    };

    const stopPositionTracking = () => {
        if (geolocationHandle.current) {
            navigator.geolocation.clearWatch(geolocationHandle.current);
            geolocationHandle.current = null;
        }
    };

    // DOM
    return (
        <span id="geolocation-controls" className="do-not-remove-me" />
    )
}