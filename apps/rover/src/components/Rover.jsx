import { useState } from "react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";

import "./Rover.css";

export default function Rover() {

    // Consts

    // State

    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const [intelIsOpen, setIntelIsOpen] = useState(false);
    const [geolocationIsEnabled, setGeolocationIsEnabled] = useState(true);
    const [position, setPosition] = useState(null);

    // References

    // Effects

    // Methods

    const onPositionReady = (position) => {
        setPosition(position);
    };

    const onPositionError = (error) => {
        // TODO show visual error to user
        console.error(error);
    };

    const onIntelReady = (description, b64Image) => {
        // TODO - add this as a preview to the map
        // the user will later confirm to keep it or not
    };

    const onIntelError = (error) => {
        console.error(error);
        // TODO - render a user message
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
            <MapView position={position} />
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