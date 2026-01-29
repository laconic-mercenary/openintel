import { useState } from "react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';

import "./Rover.css";
import { useEffect } from "react";

export default function Rover() {

    // State
    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const [geolocationEnabled, setGeolocationEnabled] = useState(true);

    // Methods
    const onPositionReady = (position) => {
        console.log(position);
    };

    const onPositionError = (error) => {
        console.error(error);
    };

    // DOM
    return (
        <div className="rover-wrapper">
            <header className="rover-menu-header">
                <button className="rover-menu-expander"
                        onClick={() => setMenuIsOpen((v) => !v)}>≡</button>
            </header>
            <Geolocation onPositionReady={onPositionReady} 
                        onPositionError={onPositionError} 
                        geolocationEnabled={geolocationEnabled} />
            <MapView />
            <div className={`rover-menu ${menuIsOpen ? "is-expanded" : ""}`}>
                <nav className="rover-menu-nav">
                    <button className="rover-menu-item">Get Intel</button>
                    <button className="rover-menu-item">Settings</button>
                    <button className={geolocationEnabled ? "rover-menu-item geoloc-toggle is-enabled" : "rover-menu-item geoloc-toggle"} 
                            onClick={() => setGeolocationEnabled(!geolocationEnabled)}>
                        Geolocation
                    </button>
                </nav>
            </div>
        </div>
    )
}