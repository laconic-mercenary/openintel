import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, Locate, LocateFixed, LocateOff } from "lucide-react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";
import EncryptionSetup from "./EncryptionSetup.jsx";

import { currentTimestampMillis } from "../utils/time";
import { storeIntel, deleteIntel, getSession } from "../utils/api";
import { loadKey } from "../utils/keystore";
import { encryptText, encryptBytes } from "../utils/crypto";

import "./Rover.css";

export default function Rover() {

    // Consts

    const loginPath = "/login";
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
    const [cryptoKey, setCryptoKey] = useState(null);
    const [encSalt, setEncSalt] = useState(null);

    // References

    const navigate = useNavigate();
    const positionRef = useRef(position);
    const cryptoKeyRef = useRef(cryptoKey);

    // Effects

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        cryptoKeyRef.current = cryptoKey;
    }, [cryptoKey]);

    useEffect(() => {
        getSession()
            .then((salt) => {
                if (!salt) {
                    navigate(loginPath);
                    return;
                }
                return loadKey().then((key) => {
                    if (key) {
                        setCryptoKey(key);
                    } else {
                        setEncSalt(salt);
                    }
                });
            })
            .catch(console.error);
    }, []);

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

    const onKeepIntel = async (intelPoint) => {
        const key = cryptoKeyRef.current;
        try {
            const encryptedDescription = intelPoint.description
                ? await encryptText(key, intelPoint.description)
                : intelPoint.description;

            let encryptedImage = intelPoint.b64image;
            if (intelPoint.b64image) {
                const b64 = intelPoint.b64image.includes(',')
                    ? intelPoint.b64image.split(',')[1]
                    : intelPoint.b64image;
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const encBytes = await encryptBytes(key, bytes.buffer);
                encryptedImage = btoa(String.fromCharCode(...new Uint8Array(encBytes)));
            }

            const encryptedPoint = { ...intelPoint, description: encryptedDescription, b64image: encryptedImage };
            const { geohash } = await storeIntel(encryptedPoint);
            setIntelPoints((previous) => {
                return previous.map((point) => {
                    if (point.key === intelPoint.key) {
                        return { ...point, confirmed: true, geohash, b64image: null, hasImage: !!point.b64image };
                    }
                    return point;
                });
            });
        } catch (error) {
            console.error('failed to store intel:', error);
            // TODO - render a user message
        }
    };

    const onDeleteConfirmedIntel = async (intelPoint) => {
        try {
            await deleteIntel(intelPoint);
            setIntelPoints((previous) => {
                return previous.filter((point) => point.key !== intelPoint.key);
            });
        } catch (error) {
            console.error('failed to delete intel:', error);
            // TODO - render a user message
        }
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

    if (!cryptoKey) {
        if (!encSalt) return null;
        return <EncryptionSetup salt={encSalt} onKeyReady={setCryptoKey} />;
    }

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
                    cryptoKey={cryptoKey}
                    onKeepIntel={onKeepIntel}
                    onDiscardIntel={onDiscardIntel}
                    onDeleteConfirmedIntel={onDeleteConfirmedIntel}
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
