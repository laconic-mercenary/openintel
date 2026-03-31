import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, Locate, LocateFixed, LocateOff, LogOut } from "lucide-react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";
import EncryptionSetup from "./EncryptionSetup.jsx";

import { currentTimestampMillis } from "../utils/time";
import { storeIntel, listIntel, deleteIntel, getSession, logout } from "../utils/api";
import { loadKey } from "../utils/keystore";
import { encryptText, encryptBytes, decryptText } from "../utils/crypto";
import { coordsToGeohash5, bboxToGeohash5Cells } from "../utils/geo";

import "./Rover.css";

export default function Rover() {

    // Consts

    const loginPath = "/login";
    const minIntelQueryZoom = 10;
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
    const [zoomToNewIntelSignal, setZoomToNewIntelSignal] = useState(0);
    const [cryptoKey, setCryptoKey] = useState(null);
    const [encSalt, setEncSalt] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    // References

    const navigate = useNavigate();
    const positionRef = useRef(position);
    const cryptoKeyRef = useRef(cryptoKey);
    const decryptionWarningShownRef = useRef(false);

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
        setZoomToNewIntelSignal((previous) => previous + 1);
        setIntelIsOpen(false);
    };

    // Events

    const onPositionReady = (position) => {
        positionRef.current = position;
        setPosition(position);
    };

    const onPositionError = (error) => {
        console.error(error);
        setErrorMessage("Check geolocation is enabled — high precision locations may take a few seconds.");
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
                setErrorMessage("Check geolocation is enabled — high precision locations may take a few seconds.");
            },
            geolocationOptions,
        );
    };

    const onIntelError = (error) => {
        console.error(error);
        setErrorMessage("Something went wrong capturing intel — please try again.");
    };

    const onKeepIntel = async (intelPoint) => {
        const key = cryptoKeyRef.current;
        try {
            const geohash = coordsToGeohash5(intelPoint.latitude, intelPoint.longitude);

            const payload = JSON.stringify({
                lat: intelPoint.latitude,
                lon: intelPoint.longitude,
                accuracy: intelPoint.accuracy,
                description: intelPoint.description,
                timestamp: intelPoint.timestamp,
            });
            const encryptedPayload = await encryptText(key, payload);

            let encryptedImage = null;
            if (intelPoint.b64image) {
                const b64 = intelPoint.b64image.includes(',')
                    ? intelPoint.b64image.split(',')[1]
                    : intelPoint.b64image;
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const encBytes = await encryptBytes(key, bytes.buffer);
                encryptedImage = btoa(String.fromCharCode(...new Uint8Array(encBytes)));
            }

            const { key: rowKey } = await storeIntel({
                key: intelPoint.key,
                geohash,
                encryptedPayload,
                encryptedImage,
                timestamp: intelPoint.timestamp,
            });

            setIntelPoints((previous) => previous.map((point) => {
                if (point.key !== intelPoint.key) return point;
                return {
                    ...point,
                    key: rowKey,
                    geohash,
                    confirmed: true,
                    b64image: null,
                    hasImage: !!intelPoint.b64image,
                };
            }));
        } catch (error) {
            console.error('failed to store intel:', error);
            setErrorMessage("Failed to save intel — please try again.");
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
            setErrorMessage("Failed to delete intel — please try again.");
        }
    };

    const onBoundsChange = async (minLat, minLon, maxLat, maxLon, zoom) => {
        const key = cryptoKeyRef.current;
        if (!key) return;
        if (zoom < minIntelQueryZoom) return;
        try {
            const items = await listIntel(minLat, minLon, maxLat, maxLon);
            const results = await Promise.allSettled(items.map(async (item) => {
                const plaintext = await decryptText(key, item.encryptedPayload);
                const { lat, lon, accuracy, description, timestamp } = JSON.parse(plaintext);
                return {
                    key: item.key,
                    geohash: item.geohash,
                    latitude: lat,
                    longitude: lon,
                    accuracy,
                    description,
                    timestamp,
                    hasImage: item.hasImage,
                    confirmed: true,
                    b64image: null,
                    fromServer: true,
                };
            }));

            const decrypted = results
                .filter((r) => r.status === 'fulfilled')
                .map((r) => r.value);

            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0 && !decryptionWarningShownRef.current) {
                decryptionWarningShownRef.current = true;
                setErrorMessage("Some intel could not be decrypted with the current password — it may have been stored with a different one.");
            }
            setIntelPoints((previous) => {
                const currentCells = new Set(bboxToGeohash5Cells(minLat, minLon, maxLat, maxLon));
                const inSession = previous.filter((p) => !p.fromServer);
                const retained = previous.filter((p) => p.fromServer && currentCells.has(p.geohash));
                const retainedKeys = new Set(retained.map((p) => p.key));
                const incoming = decrypted.filter((p) => !retainedKeys.has(p.key));
                return [...inSession, ...retained, ...incoming];
            });
        } catch (error) {
            console.error('failed to load intel from server:', error);
            setErrorMessage("Failed to load intel — check your connection and try panning the map.");
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

    const onLogout = async () => {
        try {
            await logout();
            navigate(loginPath);
        } catch (error) {
            console.error('failed to logout:', error);
            setErrorMessage("Failed to logout — please try again.");
        }
    };

    // DOM

    if (!cryptoKey) {
        if (!encSalt) return null;
        return <EncryptionSetup salt={encSalt} onKeyReady={setCryptoKey} />;
    }

    return (
        <div className={`rover-wrapper${errorMessage ? " has-error" : ""}`}>
            { errorMessage && (
                <div className="rover-error-banner">
                    <span>⚠ {errorMessage}</span>
                    <button className="rover-error-banner-dismiss" onClick={() => setErrorMessage(null)}>✕</button>
                </div>
            )}
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
                    onBoundsChange={onBoundsChange}
                    onError={setErrorMessage}
                    zoomToPositionSignal={zoomToPositionSignal}
                    zoomToNewIntelSignal={zoomToNewIntelSignal}
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
                    <button className="rover-menu-item" onClick={onLogout}>
                        <span className="rover-menu-item-label">
                            <LogOut className="rover-menu-item-icon" aria-hidden="true" />
                            Logout
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
         