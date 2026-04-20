import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, Locate, LocateFixed, LocateOff, LogOut, Globe, SlidersHorizontal } from "lucide-react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";
import EncryptionSetup from "./EncryptionSetup.jsx";
import PlannedDialog from "./PlannedDialog.jsx";
import LocationSearch from "./LocationSearch.jsx";
import SearchIntel from "./SearchIntel.jsx";
import ProcessingModal from "./ProcessingModal.jsx";

import { currentTimestampMillis } from "../utils/time";
import { storeIntel, listIntel, deleteIntel, updateIntel, getSession, logout } from "../utils/api";
import { loadKey } from "../utils/keystore";
import { encryptText, encryptBytes, decryptText } from "../utils/crypto";
import { saveTags, loadTags } from "../utils/tags";
import { coordsToGeohash5, bboxToGeohash5Cells } from "../utils/geo";

import "./Rover.css";

export default function Rover() {

    // Consts

    const loginPath = "/login";
    const minIntelQueryZoom = 10;
    const secretTag = "secret";
    const geolocationPositionTimeout = 5000;
    const geolocationOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: geolocationPositionTimeout,
    };

    // State

    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const [infoIsOpen, setInfoIsOpen] = useState(false);
    const [intelIsOpen, setIntelIsOpen] = useState(false);
    const [geolocationIsEnabled, setGeolocationIsEnabled] = useState(true);
    const [position, setPosition] = useState(null);
    const [intelPoints, setIntelPoints] = useState([]);
    const [zoomToPositionSignal, setZoomToPositionSignal] = useState(0);
    const [zoomToNewIntelSignal, setZoomToNewIntelSignal] = useState(0);
    const [cryptoKey, setCryptoKey] = useState(null);
    const [encSalt, setEncSalt] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [errorDetailsMessage, setErrorDetailsMessage] = useState(null);
    const [errorDetailsIsOpen, setErrorDetailsIsOpen] = useState(false);
    const [allTags, setAllTags] = useState([]);
    const [lastUsedTags, setLastUsedTags] = useState([]);
    const [plannedDialogState, setPlannedDialogState] = useState(null);
    const [keyLoadFailed, setKeyLoadFailed] = useState(false);
    const [locationSearchIsOpen, setLocationSearchIsOpen] = useState(false);
    const [flyToLocationSignal, setFlyToLocationSignal] = useState(null);
    const [searchIntelIsOpen, setSearchIntelIsOpen] = useState(false);
    const [intelFilter, setIntelFilter] = useState({ tags: [], text: "" });
    const [cloudSaveMessage, setCloudSaveMessage] = useState(null);

    // References

    const navigate = useNavigate();
    const positionRef = useRef(position);
    const cryptoKeyRef = useRef(cryptoKey);
    const decryptionWarningShownRef = useRef(false);
    const hasAutoZoomedRef = useRef(false);

    // Effects

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        cryptoKeyRef.current = cryptoKey;
    }, [cryptoKey]);

    useEffect(() => {
        loadTags()
            .then((tags) => setAllTags(tags))
            .catch((loadTagsErr) => console.error("failed to load tags from indexeddb:", loadTagsErr));

        getSession()
            .then((salt) => {
                if (!salt) {
                    navigate(loginPath);
                    return;
                }
                return loadKey()
                    .then((key) => {
                        if (key) {
                            setCryptoKey(key);
                        } else {
                            setEncSalt(salt);
                        }
                    })
                    // Exception: some browsers (e.g. Brave with Shields) block IndexedDB,
                    // causing openDB() to reject with a SecurityError. Fall back to password
                    // entry so the user is never left on a blank screen. saveKey() will also
                    // be skipped in EncryptionSetup when keyLoadFailed is true.
                    .catch((loadKeyErr) => {
                        console.error("failed to load key from indexeddb:", loadKeyErr);
                        setKeyLoadFailed(true);
                        setEncSalt(salt);
                    });
            })
            .catch(console.error);
    }, []);

    // Methods

    const applyIntelFilter = (point) => {
        const tags = point.tags ?? [];
        if (intelFilter.tags.length === 0) {
            if (tags.includes(secretTag)) return false;
        } else {
            if (!tags.some((t) => intelFilter.tags.includes(t))) return false;
        }
        if (intelFilter.text) {
            const needle = intelFilter.text.toLowerCase();
            const haystack = `${point.description ?? ""} ${tags.join(" ")}`.toLowerCase();
            if (!haystack.includes(needle)) return false;
        }
        return true;
    };

    const newIntelCandidate = (description, b64image, coords, tags) => {
        return {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            description: description,
            b64image: b64image,
            tags: tags ?? [],
            timestamp: currentTimestampMillis(),
            confirmed: false,
            key: crypto.randomUUID(),
        }
    };

    const addIntelPoint = (description, b64Image, coords, tags) => {
        const intelCandidate = newIntelCandidate(description, b64Image, coords, tags);
        setIntelPoints((previous) => [...previous, intelCandidate]);
        setZoomToNewIntelSignal((previous) => previous + 1);
        setIntelIsOpen(false);
        return intelCandidate;
    };

    // Events

    const onPositionReady = (position) => {
        positionRef.current = position;
        setPosition(position);
        if (!hasAutoZoomedRef.current && geolocationIsEnabled) {
            hasAutoZoomedRef.current = true;
            setZoomToPositionSignal((previous) => previous + 1);
        }
    };

    const setError = (message, error) => {
        setErrorMessage(message);
        setErrorDetailsMessage(error ? `${error.name ? error.name + ": " : ""}${error.message || String(error)}` : null);
    };

    const dismissError = () => {
        setErrorMessage(null);
        setErrorDetailsMessage(null);
        setErrorDetailsIsOpen(false);
    };

    const onPositionError = (error) => {
        console.error(error);
        setError("Error getting geolocation — check that it is enabled or wait a moment (high precision locations may take time).", error);
    };

    const onIntelReady = (description, b64Image, tags, saveToCloud) => {
        if (!geolocationIsEnabled) {
            console.warn("geolocation is disabled - will not store intel");
            return;
        }
        const latestPosition = positionRef.current;
        if (latestPosition) {
            const candidate = addIntelPoint(description, b64Image, latestPosition.coords, tags);
            if (saveToCloud) onKeepIntel(candidate);
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
                const candidate = addIntelPoint(description, b64Image, currentPosition.coords, tags);
                if (saveToCloud) onKeepIntel(candidate);
            },
            (error) => {
                console.error(error);
                setError("Error getting geolocation — check that it is enabled or wait a moment (high precision locations may take time).", error);
            },
            geolocationOptions,
        );
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
                tags: intelPoint.tags ?? [],
            });
            const encryptedPayload = await encryptText(key, payload);

            let encryptedImage = null;
            if (intelPoint.b64image) {
                const b64 = intelPoint.b64image.includes(',')
                    ? intelPoint.b64image.split(',')[1]
                    : intelPoint.b64image;
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const encBytes = new Uint8Array(await encryptBytes(key, bytes.buffer));
                let binary = "";
                for (let i = 0; i < encBytes.length; i++) {
                    binary += String.fromCharCode(encBytes[i]);
                }
                encryptedImage = btoa(binary);
            }

            const { key: rowKey } = await storeIntel({
                key: intelPoint.key,
                geohash,
                encryptedPayload,
                encryptedImage,
                timestamp: intelPoint.timestamp,
            }, (attempt) => setCloudSaveMessage(attempt === 0 ? "Saving Intel..." : "Trying again..."));

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

            if (intelPoint.tags?.length > 0) {
                setLastUsedTags(intelPoint.tags);
                saveTags(intelPoint.tags)
                    .then(() => loadTags().then((tags) => setAllTags(tags)))
                    .catch((saveTagsErr) => console.error("failed to save tags:", saveTagsErr));
            }
        } catch (error) {
            console.error('failed to store intel:', error);
            setError("Couldn't save to cloud — intel kept in memory. Tap the marker to retry.", error);
        } finally {
            setCloudSaveMessage(null);
        }
    };

    const onDeleteConfirmedIntel = async (intelPoint) => {
        try {
            const { alreadyDeleted } = await deleteIntel(intelPoint);
            setIntelPoints((previous) => previous.filter((point) => point.key !== intelPoint.key));
            if (alreadyDeleted) {
                setError("Intel was already deleted elsewhere — removed from map.", null);
            }
        } catch (error) {
            console.error('failed to delete intel:', error);
            setError("Failed to delete intel — please try again.", error);
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
                const { lat, lon, accuracy, description, timestamp, tags, type } = JSON.parse(plaintext);
                return {
                    key: item.key,
                    geohash: item.geohash,
                    latitude: lat,
                    longitude: lon,
                    accuracy,
                    description,
                    timestamp,
                    tags: tags ?? [],
                    planned: type === "planned",
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
                setError("Some intel could not be decrypted with the current password — it may have been stored with a different one.", null);
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
            setError("Failed to load intel — check your connection and try panning the map.", error);
        }
    };

    const onDiscardIntel = (intelPoint) => {
        setIntelPoints((previous) => {
            return previous.filter((point) => point.key !== intelPoint.key)
        });
    };

    const onAddPlannedIntel = (lat, lon) => {
        setPlannedDialogState({ mode: "add", lat, lon });
    };

    const onEditPlannedIntel = (intelPoint) => {
        setPlannedDialogState({ mode: "edit", intelPoint });
    };

    const onSavePlannedIntel = async (description, tags) => {
        const key = cryptoKeyRef.current;
        const state = plannedDialogState;
        try {
            if (state.mode === "add") {
                const { lat, lon } = state;
                const geohash = coordsToGeohash5(lat, lon);
                const intelKey = crypto.randomUUID();
                const timestamp = currentTimestampMillis();
                const payload = JSON.stringify({
                    lat, lon, accuracy: 0, description, timestamp, tags: tags ?? [], type: "planned",
                });
                const encryptedPayload = await encryptText(key, payload);
                const { key: rowKey } = await storeIntel({
                    key: intelKey,
                    geohash,
                    encryptedPayload,
                    encryptedImage: null,
                    timestamp,
                });
                setIntelPoints((prev) => [...prev, {
                    key: rowKey,
                    geohash,
                    latitude: lat,
                    longitude: lon,
                    accuracy: 0,
                    description,
                    timestamp,
                    tags: tags ?? [],
                    planned: true,
                    confirmed: true,
                    hasImage: false,
                    b64image: null,
                    fromServer: false,
                }]);
            } else {
                const intelPoint = state.intelPoint;
                const payload = JSON.stringify({
                    lat: intelPoint.latitude,
                    lon: intelPoint.longitude,
                    accuracy: 0,
                    description,
                    timestamp: intelPoint.timestamp,
                    tags: tags ?? [],
                    type: "planned",
                });
                const encryptedPayload = await encryptText(key, payload);
                await updateIntel({ geohash: intelPoint.geohash, key: intelPoint.key, encryptedPayload });
                setIntelPoints((prev) => prev.map((p) => {
                    if (p.key !== intelPoint.key) return p;
                    return { ...p, description, tags: tags ?? [] };
                }));
            }
            setPlannedDialogState(null);
            if (tags?.length > 0) {
                setLastUsedTags(tags);
                saveTags(tags)
                    .then(() => loadTags().then((t) => setAllTags(t)))
                    .catch((saveTagsErr) => console.error("failed to save tags:", saveTagsErr));
            }
        } catch (error) {
            console.error("failed to save planned intel:", error);
            setError("Failed to save note — please try again.", error);
        }
    };

    const onDeletePlannedIntel = async () => {
        const intelPoint = plannedDialogState?.intelPoint;
        if (!intelPoint) return;
        try {
            const { alreadyDeleted } = await deleteIntel(intelPoint);
            setIntelPoints((prev) => prev.filter((p) => p.key !== intelPoint.key));
            setPlannedDialogState(null);
            if (alreadyDeleted) {
                setError("Note was already deleted elsewhere — removed from map.", null);
            }
        } catch (error) {
            console.error("failed to delete planned intel:", error);
            setError("Failed to delete note — please try again.", error);
        }
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
            setError("Failed to logout — please try again.", error);
        }
    };

    // DOM

    if (!cryptoKey) {
        if (!encSalt) return null;
        return <EncryptionSetup salt={encSalt} onKeyReady={setCryptoKey} keyLoadFailed={keyLoadFailed} />;
    }

    return (
        <div className={`rover-wrapper${errorMessage ? " has-error" : ""}`}>
            { errorMessage && (
                <div className="rover-error-banner">
                    <span>⚠ {errorMessage}</span>
                    <span className="rover-error-banner-actions">
                        { errorDetailsMessage && (
                            <button className="rover-error-banner-details" onClick={() => setErrorDetailsIsOpen(true)}>Details</button>
                        )}
                        <button className="rover-error-banner-dismiss" onClick={dismissError}>✕</button>
                    </span>
                </div>
            )}
            { errorDetailsIsOpen && (
                <div className="rover-error-details-overlay" onClick={() => setErrorDetailsIsOpen(false)}>
                    <div className="rover-error-details-popup" onClick={(e) => e.stopPropagation()}>
                        <p className="rover-error-details-title">Error Details</p>
                        <p className="rover-error-details-message">{errorDetailsMessage}</p>
                        <button className="rover-error-details-close" onClick={() => setErrorDetailsIsOpen(false)}>Close</button>
                    </div>
                </div>
            )}
            <header className="rover-menu-header">
                <button className="rover-menu-expander"
                        onClick={() => setMenuIsOpen((previous) => !previous)}>≡</button>
                <button className="rover-menu-favicon-btn"
                        onClick={() => setInfoIsOpen((previous) => !previous)}>
                    <img src="/favicon.png" alt="Info" className="rover-menu-favicon" />
                </button>
            </header>
            { infoIsOpen && (
                <div className="rover-info-popup">
                    <button className="rover-info-popup-close" onClick={() => setInfoIsOpen(false)}>✕</button>
                    <p className="rover-info-popup-title">Security</p>
                    <ul className="rover-info-popup-list">
                        <li>Algorithm: AES-256-GCM</li>
                        <li>Key derivation: PBKDF2 / SHA-256</li>
                        <li>Encrypted: photos, descriptions, coordinates</li>
                        <li>Encryption is client-side only — the server never sees your data in plaintext</li>
                    </ul>
                </div>
            )}
            <Geolocation onPositionReady={onPositionReady} 
                        onPositionError={onPositionError} 
                        geolocationIsEnabled={geolocationIsEnabled} />
            <MapView position={position}
                    intelPoints={intelPoints.filter(applyIntelFilter)}
                    cryptoKey={cryptoKey}
                    onKeepIntel={onKeepIntel}
                    onDiscardIntel={onDiscardIntel}
                    onDeleteConfirmedIntel={onDeleteConfirmedIntel}
                    onBoundsChange={onBoundsChange}
                    onError={setErrorMessage}
                    onAddPlannedIntel={onAddPlannedIntel}
                    onEditPlannedIntel={onEditPlannedIntel}
                    zoomToPositionSignal={zoomToPositionSignal}
                    zoomToNewIntelSignal={zoomToNewIntelSignal}
                    flyToLocationSignal={flyToLocationSignal}
                    geolocationIsEnabled={geolocationIsEnabled} />
            <div className={menuIsOpen ? "rover-menu is-open" : "rover-menu"}>
                <nav className="rover-menu-nav">
                    <button className="rover-menu-item"
                            onClick={() => { setIntelIsOpen((previous) => !previous); setMenuIsOpen(false); }}>
                        <span className="rover-menu-item-label">
                            <Crosshair className="rover-menu-item-icon" aria-hidden="true" />
                            Get Intel
                        </span>
                    </button>
                    <button className="rover-menu-item"
                            onClick={() => { onZoomToMe(); setMenuIsOpen(false); }}>
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
                    <button className="rover-menu-item"
                            onClick={() => { setLocationSearchIsOpen(true); setMenuIsOpen(false); }}>
                        <span className="rover-menu-item-label">
                            <Globe className="rover-menu-item-icon" aria-hidden="true" />
                            Search Location
                        </span>
                    </button>
                    <button className="rover-menu-item"
                            onClick={() => { setSearchIntelIsOpen(true); setMenuIsOpen(false); }}>
                        <span className="rover-menu-item-label">
                            <SlidersHorizontal className="rover-menu-item-icon" aria-hidden="true" />
                            Search Intel
                        </span>
                    </button>
                    <button className="rover-menu-item" onClick={() => { onLogout(); setMenuIsOpen(false); }}>
                        <span className="rover-menu-item-label">
                            <LogOut className="rover-menu-item-icon" aria-hidden="true" />
                            Logout
                        </span>
                    </button>
                </nav>
            </div>
            { cloudSaveMessage && <ProcessingModal message={cloudSaveMessage} /> }
            { locationSearchIsOpen && (
                <LocationSearch
                    onResult={({ lat, lon }) => { setFlyToLocationSignal({ lat, lon }); setLocationSearchIsOpen(false); }}
                    onCancel={() => setLocationSearchIsOpen(false)} />
            )}
            { searchIntelIsOpen && (
                <SearchIntel
                    filterTags={intelFilter.tags}
                    allTags={allTags}
                    onTagsChange={(tags) => setIntelFilter((prev) => ({ ...prev, tags }))}
                    onTextSearch={(text) => { setIntelFilter((prev) => ({ ...prev, text })); setSearchIntelIsOpen(false); }}
                    onClose={() => setSearchIntelIsOpen(false)} />
            )}
            { intelIsOpen && (<Intel onIntelReady={onIntelReady}
                                        onIntelCancel={() => setIntelIsOpen(false)}
                                        tagSuggestions={allTags}
                                        initialTags={lastUsedTags} />) }
            { plannedDialogState && (
                <PlannedDialog
                    mode={plannedDialogState.mode}
                    intelPoint={plannedDialogState.mode === "edit" ? plannedDialogState.intelPoint : null}
                    tagSuggestions={allTags}
                    initialTags={plannedDialogState.mode === "edit" ? (plannedDialogState.intelPoint.tags ?? []) : lastUsedTags}
                    onSave={onSavePlannedIntel}
                    onCancel={() => setPlannedDialogState(null)}
                    onDelete={plannedDialogState.mode === "edit" ? onDeletePlannedIntel : null} />
            )}
        </div>
    )
}
         