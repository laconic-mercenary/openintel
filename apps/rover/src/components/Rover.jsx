import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudUpload, Feather, FileUp, Layers, Loader2, Locate, LocateOff, LogOut, Globe, Map, Navigation2, SlidersHorizontal } from "lucide-react";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import Intel from "./Intel.jsx";
import EncryptionSetup from "./EncryptionSetup.jsx";
import PlannedDialog from "./PlannedDialog.jsx";
import LocationSearch from "./LocationSearch.jsx";
import SearchIntel from "./SearchIntel.jsx";
import ProcessingModal from "./ProcessingModal.jsx";
import ExportIntelDialog from "./ExportIntelDialog.jsx";
import ImportIntelDialog from "./ImportIntelDialog.jsx";
import LocateArrow from "./LocateArrow.jsx";
import NavArrow from "./NavArrow.jsx";

import { currentTimestampMillis } from "../utils/time";
import { storeIntel, listIntel, deleteIntel, updateIntel, getSession, logout, uploadIntelImage, getImageUploadUrl } from "../utils/api";
import { calculateBearing, calculateDistanceKm } from "../utils/geo";
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
    const [appError, setAppError] = useState(null);
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
    const [exportIntelPoint, setExportIntelPoint] = useState(null);
    const [importIsOpen, setImportIsOpen] = useState(false);
    const [locateIntelPoint, setLocateIntelPoint] = useState(null);
    const [isSatellite, setIsSatellite] = useState(false);
    const [navTarget, setNavTarget] = useState(null);
    const [saveAllState, setSaveAllState] = useState(null);

    // References

    const navigate = useNavigate();
    const positionRef = useRef(position);
    const cryptoKeyRef = useRef(cryptoKey);
    const decryptionWarningShownRef = useRef(false);
    const hasAutoZoomedRef = useRef(false);
    const mapCenterRef = useRef(null);

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
        setAppError((prev) => prev?.type === 'geolocation' ? null : prev);
        if (!hasAutoZoomedRef.current && geolocationIsEnabled) {
            hasAutoZoomedRef.current = true;
            setZoomToPositionSignal((previous) => previous + 1);
        }
    };

    const setError = (message, error, type = null, onRetry = null) => {
        setAppError({
            message,
            details: error ? `${error.name ? error.name + ": " : ""}${error.message || String(error)}` : null,
            type,
            onRetry,
        });
    };

    const dismissError = () => {
        setAppError(null);
        setErrorDetailsIsOpen(false);
    };

    const onPositionError = (error) => {
        console.error(error);
        setError("Error getting geolocation — check that it is enabled or wait a moment (high precision locations may take time).", error, 'geolocation');
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
                setError("Error getting geolocation — check that it is enabled or wait a moment (high precision locations may take time).", error, 'geolocation');
            },
            geolocationOptions,
        );
    };


    const uploadConfirmedIntelImage = async (confirmedPoint, encryptedImageBuffer, presignedPutUrl, silent) => {
        try {
            await uploadIntelImage(presignedPutUrl, encryptedImageBuffer);
            setIntelPoints((prev) => prev.map((p) => {
                if (p.key !== confirmedPoint.key) return p;
                return { ...p, hasImage: true };
            }));
        } catch (imageErr) {
            if (!silent) {
                console.error('failed to upload image:', imageErr);
                const retry = async () => {
                    try {
                        const freshUrl = await getImageUploadUrl(confirmedPoint);
                        await uploadConfirmedIntelImage(confirmedPoint, encryptedImageBuffer, freshUrl, false);
                    } catch (retryErr) {
                        console.error('image upload retry failed:', retryErr);
                        setError("Intel saved — image upload failed.", retryErr, 'imageUpload', retry);
                    }
                };
                setError("Intel saved — image upload failed. Tap ↻ to retry.", imageErr, 'imageUpload', retry);
            } else {
                throw imageErr;
            }
        }
    };

    const onKeepIntel = async (intelPoint, silent = false) => {
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

            let encryptedImageBuffer = null;
            if (intelPoint.b64image) {
                const b64 = intelPoint.b64image.includes(',')
                    ? intelPoint.b64image.split(',')[1]
                    : intelPoint.b64image;
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                encryptedImageBuffer = await encryptBytes(key, bytes.buffer);
            }

            const { key: rowKey, presignedPutUrl } = await storeIntel({
                key: intelPoint.key,
                geohash,
                encryptedPayload,
                hasImage: !!encryptedImageBuffer,
                timestamp: intelPoint.timestamp,
            }, silent ? undefined : (attempt) => setCloudSaveMessage(attempt === 0 ? "Saving Intel..." : "Trying again..."));

            setIntelPoints((previous) => previous.map((point) => {
                if (point.key !== intelPoint.key) return point;
                return {
                    ...point,
                    key: rowKey,
                    geohash,
                    confirmed: true,
                    b64image: null,
                    hasImage: false,
                };
            }));
            setAppError((prev) => prev?.type === 'save' ? null : prev);

            if (intelPoint.tags?.length > 0) {
                setLastUsedTags(intelPoint.tags);
                saveTags(intelPoint.tags)
                    .then(() => loadTags().then((tags) => setAllTags(tags)))
                    .catch((saveTagsErr) => console.error("failed to save tags:", saveTagsErr));
            }

            if (presignedPutUrl && encryptedImageBuffer) {
                if (!silent) setCloudSaveMessage("Uploading Image...");
                const confirmedPoint = { key: rowKey, geohash };
                await uploadConfirmedIntelImage(confirmedPoint, encryptedImageBuffer, presignedPutUrl, silent);
            }
        } catch (error) {
            if (!silent) {
                console.error('failed to store intel:', error);
                setError("Couldn't save to cloud — intel kept in memory. Tap the marker to retry.", error, 'save');
            }
            throw error;
        } finally {
            if (!silent) setCloudSaveMessage(null);
        }
    };

    const onSaveAllIntel = async () => {
        const pending = intelPoints.filter((p) => !p.confirmed && !p.planned);
        if (pending.length === 0) return;
        setSaveAllState('saving');
        let saved = 0;
        let failed = 0;
        for (const point of pending) {
            try {
                await onKeepIntel(point, true);
                saved++;
            } catch {
                failed++;
            }
        }
        setSaveAllState({ saved, failed });
        setTimeout(() => setSaveAllState(null), 4000);
    };

    const onDeleteConfirmedIntel = async (intelPoint) => {
        setCloudSaveMessage("Deleting Intel...");
        try {
            const { alreadyDeleted } = await deleteIntel(intelPoint);
            setIntelPoints((previous) => previous.filter((point) => point.key !== intelPoint.key));
            if (alreadyDeleted) {
                setError("Intel was already deleted elsewhere — removed from map.", null);
            }
        } catch (error) {
            console.error('failed to delete intel:', error);
            setError("Failed to delete intel — please try again.", error);
        } finally {
            setCloudSaveMessage(null);
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

    const onImportIntel = (intelPoint, hasLocation) => {
        setImportIsOpen(false);
        if (hasLocation) {
            const candidate = newIntelCandidate(
                intelPoint.description,
                intelPoint.b64image,
                { latitude: intelPoint.latitude, longitude: intelPoint.longitude, accuracy: intelPoint.accuracy ?? 0 },
                intelPoint.tags,
            );
            setIntelPoints((previous) => [...previous, candidate]);
            setZoomToNewIntelSignal((previous) => previous + 1);
        } else {
            setLocateIntelPoint(intelPoint);
        }
    };

    const onLocateConfirm = () => {
        const center = mapCenterRef.current?.();
        if (!center) {
            console.warn("onLocateConfirm: map center not available");
            return;
        }
        const candidate = newIntelCandidate(
            locateIntelPoint.description,
            locateIntelPoint.b64image,
            { latitude: center.lat, longitude: center.lng, accuracy: 0 },
            locateIntelPoint.tags,
        );
        setLocateIntelPoint(null);
        setIntelPoints((previous) => [...previous, { ...candidate, manualLocation: true }]);
    };

    const onSaveIntelToFile = (description, b64image, tags) => {
        const coords = geolocationIsEnabled ? (positionRef.current?.coords ?? null) : null;
        setExportIntelPoint({
            description,
            b64image,
            tags,
            timestamp: currentTimestampMillis(),
            key: crypto.randomUUID(),
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            accuracy: coords?.accuracy ?? null,
        });
        setIntelIsOpen(false);
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
        setCloudSaveMessage(state.mode === "add" ? "Saving Note..." : "Updating Note...");
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
        } finally {
            setCloudSaveMessage(null);
        }
    };

    const onDeletePlannedIntel = async () => {
        const intelPoint = plannedDialogState?.intelPoint;
        if (!intelPoint) return;
        setCloudSaveMessage("Deleting Note...");
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
        } finally {
            setCloudSaveMessage(null);
        }
    };

    const onNavigateTo = (intelPoint) => {
        setNavTarget(intelPoint);
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
        <div className={`rover-wrapper${appError ? " has-error" : ""}`}>
            { appError && (
                <div className="rover-error-banner">
                    <span>⚠ {appError.message}</span>
                    <span className="rover-error-banner-actions">
                        { appError.details && (
                            <button className="rover-error-banner-details" onClick={() => setErrorDetailsIsOpen(true)}>Details</button>
                        )}
                        { appError.onRetry && (
                            <button className="rover-error-banner-retry" onClick={appError.onRetry}>↻</button>
                        )}
                        <button className="rover-error-banner-dismiss" onClick={dismissError}>✕</button>
                    </span>
                </div>
            )}
            { errorDetailsIsOpen && (
                <div className="rover-error-details-overlay" onClick={() => setErrorDetailsIsOpen(false)}>
                    <div className="rover-error-details-popup" onClick={(e) => e.stopPropagation()}>
                        <p className="rover-error-details-title">Error Details</p>
                        <p className="rover-error-details-message">{appError?.details}</p>
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
                    <a className="rover-info-popup-privacy-link"
                       href="https://www.openintel.to/privacy.html"
                       target="_blank"
                       rel="noopener noreferrer">Privacy information →</a>
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
                    onError={(msg) => setError(msg, null)}
                    onAddPlannedIntel={onAddPlannedIntel}
                    onEditPlannedIntel={onEditPlannedIntel}
                    onExportIntel={setExportIntelPoint}
                    onNavigateTo={onNavigateTo}
                    zoomToPositionSignal={zoomToPositionSignal}
                    zoomToNewIntelSignal={zoomToNewIntelSignal}
                    flyToLocationSignal={flyToLocationSignal}
                    mapCenterRef={mapCenterRef}
                    isSatellite={isSatellite}
                    geolocationIsEnabled={geolocationIsEnabled} />
            { navTarget && (
                <button className="rover-nav-cancel-btn" onClick={() => setNavTarget(null)} aria-label="Cancel navigation">✕</button>
            )}
            { navTarget && (
                <NavArrow
                    bearing={position ? calculateBearing(position.coords.latitude, position.coords.longitude, navTarget.latitude, navTarget.longitude) : 0}
                    distanceKm={position ? calculateDistanceKm(position.coords.latitude, position.coords.longitude, navTarget.latitude, navTarget.longitude) : 0}
                    hasPosition={!!position} />
            )}
            <button className="rover-get-intel-btn" onClick={() => setIntelIsOpen((previous) => !previous)} aria-label="Get Intel">
                <Feather size={24} aria-hidden="true" />
            </button>
            <button className="rover-satellite-btn" onClick={() => setIsSatellite((prev) => !prev)} aria-label="Toggle satellite view">
                {isSatellite ? <Map size={24} aria-hidden="true" /> : <Layers size={24} aria-hidden="true" />}
            </button>
            <button className="rover-locate-btn" onClick={onZoomToMe} aria-label="Zoom to my location">
                <Navigation2 size={24} aria-hidden="true" />
            </button>
            <div className={menuIsOpen ? "rover-menu is-open" : "rover-menu"}>
                <nav className="rover-menu-nav">
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
                    <button className="rover-menu-item"
                            onClick={() => { setImportIsOpen(true); setMenuIsOpen(false); }}>
                        <span className="rover-menu-item-label">
                            <FileUp className="rover-menu-item-icon" aria-hidden="true" />
                            Import Intel
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
            { cloudSaveMessage && <ProcessingModal message={cloudSaveMessage} subMessage={cloudSaveMessage === "Saving Intel..." || cloudSaveMessage === "Trying again..." ? "Large images may take longer." : null} /> }
            { (() => {
                const pendingCount = intelPoints.filter((p) => !p.confirmed && !p.planned).length;
                if (saveAllState && saveAllState !== 'saving') {
                    const { saved, failed } = saveAllState;
                    return (
                        <div className="rover-save-all-result">
                            { failed === 0 ? `${saved} intel saved` : `${saved} saved · ${failed} failed` }
                        </div>
                    );
                }
                if (pendingCount === 0) return null;
                return (
                    <button className="rover-save-all-btn"
                            onClick={onSaveAllIntel}
                            disabled={saveAllState === 'saving'}
                            aria-label="Save all intel to cloud">
                        { saveAllState === 'saving'
                            ? <Loader2 size={16} className="rover-save-all-spinning" aria-hidden="true" />
                            : <CloudUpload size={16} aria-hidden="true" /> }
                        { saveAllState === 'saving' ? 'Saving...' : `Save All (${pendingCount})` }
                    </button>
                );
            })() }
            { importIsOpen && (
                <ImportIntelDialog
                    onImport={onImportIntel}
                    cryptoKey={cryptoKey}
                    onCancel={() => setImportIsOpen(false)} />
            )}
            { locateIntelPoint && <LocateArrow onConfirm={onLocateConfirm} /> }
            { exportIntelPoint && (
                <ExportIntelDialog
                    intelPoint={exportIntelPoint}
                    cryptoKey={cryptoKey}
                    onCancel={() => setExportIntelPoint(null)} />
            )}
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
                                        onSaveToFile={onSaveIntelToFile}
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
         