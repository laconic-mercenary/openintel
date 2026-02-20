import { useEffect, useRef, useState } from "react";
import { Crosshair, Locate, LocateFixed, LocateOff } from "lucide-react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";

import { currentTimestampMillis } from "../utils/time";

import "./Rover.css";

export default function Rover() {

    // Consts

    const geolocationPositionTimeout = 5000;
    const geolocationOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: geolocationPositionTimeout,
    };

    // State

    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const [intelIsOpen, setIntelIsOpen] = useState(false);
    const [geolocationIsEnabled, setGeolocationIsEnabled] = useState(true);
    const [position, setPosition] = useState(null);
    const [intelPoints, setIntelPoints] = useState([]);
    const [zoomToPositionSignal, setZoomToPositionSignal] = useState(0);

    // References

    const positionRef = useRef(position);

    // Effects

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    // Methods

    const newIntelCandidate = (description, b64image, coords) => {
        return {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            description: description,
            b64image: b64image,
            timestamp: currentTimestampMillis(),
            confirmed: false,
            key: crypto.randomUUID(),
        }
    };

    const addIntelPoint = (description, b64Image, coords) => {
        const intelCandidate = newIntelCandidate(description, b64Image, coords);
        setIntelPoints((previous) => [...previous, intelCandidate]);
        setIntelIsOpen(false);
    };

    // Events

    const onPositionReady = (position) => {
        positionRef.current = position;
        setPosition(position);
    };

    const onPositionError = (error) => {
        // TODO show visual error to user
        console.error(error);
    };

    const onIntelReady = (description, b64Image) => {
        if (!geolocationIsEnabled) {
            console.warn("geolocation is disabled - will not store intel");
            return;
        }
        const latestPosition = positionRef.current;
        if (latestPosition) {
            addIntelPoint(description, b64Image, latestPosition.coords);
            return;
        }

        if (!("geolocation" in navigator)) {
            console.warn("geolocation api not available in browser");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (currentPosition) => {
                positionRef.current = currentPosition;
                setPosition(currentPosition);
                addIntelPoint(description, b64Image, currentPosition.coords);
            },
            (error) => {
                console.error(error);
            },
            geolocationOptions,
        );
    };

    const onIntelError = (error) => {
        console.error(error);
        // TODO - render a user message
    };

    const onKeepIntel = (intelPoint) => {
        setIntelPoints((previous) => {
            return previous.map((point) => {
                if (point.key === intelPoint.key) {
                    return { ...point, confirmed: true };
                }
                return point;
            });
        });
    };

    const onDiscardIntel = (intelPoint) => {
        setIntelPoints((previous) => {
            return previous.filter((point) => point.key !== intelPoint.key)
        });
    };

    const onZoomToMe = () => {
        setZoomToPositionSignal((previous) => previous + 1);
    };

    // DOM
    
    return (
        <div className="rover-wrapper">
            <header className="rover-menu-header">
                <button className="rover-menu-expander"
                        onClick={() => setMenuIsOpen((previous) => !previous)}>≡</button>
            </header>
            <Geolocation onPositionReady={onPositionReady} 
                        onPositionError={onPositionError} 
                        geolocationIsEnabled={geolocationIsEnabled} />
            <MapView position={position} 
                    intelPoints={intelPoints} 
                    onKeepIntel={onKeepIntel}
                    onDiscardIntel={onDiscardIntel}
                    zoomToPositionSignal={zoomToPositionSignal}
                    geolocationIsEnabled={geolocationIsEnabled} />
            <div className={menuIsOpen ? "rover-menu is-open" : "rover-menu"}>
                <nav className="rover-menu-nav">
                    <button className="rover-menu-item"
                            onClick={() => setIntelIsOpen((previous) => !previous)}>
                        <span className="rover-menu-item-label">
                            <Crosshair className="rover-menu-item-icon" aria-hidden="true" />
                            Get Intel
                        </span>
                    </button>
                    <button className="rover-menu-item"
                            onClick={onZoomToMe}>
                        <span className="rover-menu-item-label">
                            <LocateFixed className="rover-menu-item-icon" aria-hidden="true" />
                            Zoom To Me
                        </span>
                    </button>
                    <button className={geolocationIsEnabled ? "rover-menu-item geoloc-toggle is-enabled" : "rover-menu-item geoloc-toggle"} 
                            onClick={() => setGeolocationIsEnabled((previous) => !previous)}>
                        <span className="rover-menu-item-label">
                            {geolocationIsEnabled ? (
                                <Locate className="rover-menu-item-icon" aria-hidden="true" />
                            ) : (
                                <LocateOff className="rover-menu-item-icon" aria-hidden="true" />
                            )}
                            Geolocation
                        </span>
                    </button>
                </nav>
            </div>
            { intelIsOpen && (<Intel onIntelReady={onIntelReady} 
                                        onIntelError={onIntelError} 
                                        onIntelCancel={() => setIntelIsOpen(false)}/>) }
        </div>
    )
}
