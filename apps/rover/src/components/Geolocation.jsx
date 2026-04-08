
import { useState, useEffect, useRef } from "react";

import "./Geolocation.css"

export default function Geolocation({ onPositionReady, onPositionError, geolocationIsEnabled }) {

    // Consts

    const geolocationPositionTimeout = 5000;
    const geolocationOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: geolocationPositionTimeout
    };

    // State

    // References

    const geolocationHandle = useRef(null);
    const positionReadyRef = useRef(onPositionReady);
    const positionErrorRef = useRef(onPositionError);

    // Effects

    useEffect(() => {
        positionReadyRef.current = onPositionReady;
    }, [onPositionReady]);

    useEffect(() => {
        positionErrorRef.current = onPositionError;
    }, [onPositionError]);

    useEffect(() => {
        if (geolocationIsEnabled) {
            if ("geolocation" in navigator) {
                startPositionTracking();
            } else {
                positionErrorRef.current?.(new Error("geolocation not available in the browser"));
            }
        } else {
            stopPositionTracking();
        }
        return () => stopPositionTracking();
    }, [geolocationIsEnabled]);

    useEffect(() => {
        if (!("permissions" in navigator)) return;
        let permissionStatus = null;
        navigator.permissions.query({ name: "geolocation" }).then((status) => {
            permissionStatus = status;
            status.onchange = () => {
                if (status.state === "granted" && geolocationIsEnabled) {
                    startPositionTracking();
                }
            };
        }).catch((error) => { console.error("permissions api error:", error); });
        return () => {
            if (permissionStatus) permissionStatus.onchange = null;
        };
    }, [geolocationIsEnabled]);

    // Methods

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

    return null
}