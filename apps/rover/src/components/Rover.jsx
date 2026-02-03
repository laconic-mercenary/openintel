import { useState } from "react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";

import { currentTimestampMillis } from "../utils/time";

import "./Rover.css";

export default function Rover() {

    // Consts

    // State

    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const [intelIsOpen, setIntelIsOpen] = useState(false);
    const [geolocationIsEnabled, setGeolocationIsEnabled] = useState(true);
    const [position, setPosition] = useState(null);
    const [intelPoints, setIntelPoints] = useState([]);

    // References

    // Effects

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

    // Events

    const onPositionReady = (position) => {
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
        if (!position) {
            console.warn("geolocation (position) is not set");
            return;
        }
        const intelCandidate = newIntelCandidate(description, b64Image, position.coords);
        setIntelPoints((previous) => [...previous, intelCandidate]);
        setIntelIsOpen(false);
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
                    geolocationIsEnabled={geolocationIsEnabled} />
            <div className={menuIsOpen ? "rover-menu is-open" : "rover-menu"}>
                <nav className="rover-menu-nav">
                    <button className="rover-menu-item"
                            onClick={() => setIntelIsOpen((previous) => !previous)}>Get Intel</button>
                    <button className="rover-menu-item">Settings</button>
                    <button className={geolocationIsEnabled ? "rover-menu-item geoloc-toggle is-enabled" : "rover-menu-item geoloc-toggle"} 
                            onClick={() => setGeolocationIsEnabled((previous) => !previous)}>
                        Geolocation
                    </button>
                </nav>
            </div>
            { intelIsOpen && (<Intel onIntelReady={onIntelReady} 
                                        onIntelError={onIntelError} 
                                        onIntelCancel={() => setIntelIsOpen(false)}/>) }
        </div>
    )
}