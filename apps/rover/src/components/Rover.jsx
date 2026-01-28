import { useState } from "react";
import MapView from './MapView.jsx';

import "./Rover.css";

export default function Rover() {

    // State
    const [menuIsOpen, setMenuIsOpen] = useState(false);

    // Methods

    // DOM
    return (
        <div className="rover-wrapper">
            <header className="rover-menu-header">
                <button className="rover-menu-expander"
                        onClick={() => setMenuIsOpen((v) => !v)}>≡</button>
            </header>
            <MapView />
            <div className={`rover-menu ${menuIsOpen ? "is-expanded" : ""}`}>
                <nav className="rover-menu-nav">
                    <button className="rover-menu-item">Get Intel</button>
                    <button className="rover-menu-item">Settings</button>
                </nav>
            </div>
        </div>
    )
}