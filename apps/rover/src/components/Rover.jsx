import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CloudUpload, Layers, Loader2, Map, Navigation2, NotebookPen, Search, X } from "lucide-react";
import { chipsToFilter, applyFilter } from "../utils/filters";
import { intelTypePlanned } from "../utils/validation";
import { lsKeySaveToCloudDefault, lsKeyRecentTags, lsKeyShowFiltersOnMap, lsKeyPinnedItems, lsKeySalammboEnabled, storageGetBoolean, storageSetBoolean, storageGetJson, storageSetJson } from "../utils/storage";
import MapView from './MapView.jsx';
import Geolocation from './Geolocation.jsx';
import EncryptionSetup from "./EncryptionSetup.jsx";
import PlannedDialog from "./PlannedDialog.jsx";
import ExportIntelDialog from "./ExportIntelDialog.jsx";
import ImportIntelDialog from "./ImportIntelDialog.jsx";
import LocateArrow from "./LocateArrow.jsx";
import NavArrow from "./NavArrow.jsx";
import LocationSearch from "./LocationSearch.jsx";
import TabBar from "./TabBar.jsx";
import IntelListView from "./IntelListView.jsx";
import CollectForm from "./CollectForm.jsx";
import OptionsView from "./OptionsView.jsx";

import { currentTimestampMillis } from "../utils/time";
import { storeIntel, listIntel, deleteIntel, updateIntel, getSession, logout, uploadIntelImage, getImageUploadUrl, getIntelDetails, getComments } from "../utils/api";
import { calculateBearing, calculateDistanceKm, pointInBounds } from "../utils/geo";
import { loadKey, clearKey } from "../utils/keystore";
import { exportIntel, estimateFileCount } from "../utils/export";
import { encryptText, encryptBytes, decryptText, decryptBytes } from "../utils/crypto";
import { coordsToGeohash5, bboxToGeohash5Cells } from "../utils/geo";
import { askSalammbo, deleteSalammboModel, loadSalammboEngine, salammboStatuses } from "../utils/salammbo";
import salammboAvatar from "../assets/salammbo/avatar-64.png";
import salammboMapIcon from "../assets/salammbo/map-icon-48.png";

import "./Rover.css";

export default function Rover() {

    // Consts

    const loginPath = "/login";
    const minIntelQueryZoom = 10;
    const secretTag = "secret";
    const promiseStatusFulfilled = "fulfilled";
    const geolocationPositionTimeout = 5000;
    const geolocationOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: geolocationPositionTimeout,
    };

    // State

    const [activeTab, setActiveTab] = useState("map");
    const [saveToCloudDefault, setSaveToCloudDefault] = useState(() => storageGetBoolean(lsKeySaveToCloudDefault, true));
    const [recentTags, setRecentTags] = useState(() => storageGetJson(lsKeyRecentTags, []));
    const [geolocationIsEnabled, setGeolocationIsEnabled] = useState(true);
    const [position, setPosition] = useState(null);
    const [intelPoints, setIntelPoints] = useState([]);
    const [zoomToPositionSignal, setZoomToPositionSignal] = useState(0);
    const [zoomToNewIntelSignal, setZoomToNewIntelSignal] = useState(0);
    const [cryptoKey, setCryptoKey] = useState(null);
    const [encSalt, setEncSalt] = useState(null);
    const [appError, setAppError] = useState(null);
    const [errorDetailsIsOpen, setErrorDetailsIsOpen] = useState(false);
    const [plannedDialogState, setPlannedDialogState] = useState(null);
    const [keyLoadFailed, setKeyLoadFailed] = useState(false);
    const [flyToLocationSignal, setFlyToLocationSignal] = useState(null);
    const [intelFilter] = useState({ tags: [], text: "" });
    const [cloudSaveMessage, setCloudSaveMessage] = useState(null);
    const [cloudSaveSuccess, setCloudSaveSuccess] = useState(null);
    const [exportIntelPoint, setExportIntelPoint] = useState(null);
    const [importIsOpen, setImportIsOpen] = useState(false);
    const [locateIntelPoint, setLocateIntelPoint] = useState(null);
    const [isSatellite, setIsSatellite] = useState(false);
    const [navTarget, setNavTarget] = useState(null);
    const [saveAllState, setSaveAllState] = useState(null);
    const [collectClearSignal, setCollectClearSignal] = useState(0);
    const [mapCenter, setMapCenter] = useState(null);
    const [placingNote, setPlacingNote] = useState(false);
    const [exportingIntel, setExportingIntel] = useState(false);
    const [exportProgress, setExportProgress] = useState(null);
    const [mapZoom, setMapZoom] = useState(0);
    const [useCurrentPosition, setUseCurrentPosition] = useState(true);
    const [filterChips, setFilterChips] = useState([]);
    const [showFiltersOnMap, setShowFiltersOnMap] = useState(() => storageGetBoolean(lsKeyShowFiltersOnMap, false));
    const [pinnedItems, setPinnedItems] = useState(() => storageGetJson(lsKeyPinnedItems, []));
    const [locationSearchIsOpen, setLocationSearchIsOpen] = useState(false);
    const [salammboEnabled, setSalammboEnabled] = useState(() => storageGetBoolean(lsKeySalammboEnabled, false));
    const [salammboStatus, setSalammboStatus] = useState(salammboStatuses.idle);
    const [salammboProgress, setSalammboProgress] = useState(null);
    const [salammboError, setSalammboError] = useState(null);
    const [salammboPromptIsOpen, setSalammboPromptIsOpen] = useState(false);
    const [salammboQuestion, setSalammboQuestion] = useState("");
    const [salammboAnswer, setSalammboAnswer] = useState(null);

    // Derived

    const pinnedKeys = useMemo(() => new Set(pinnedItems.map((p) => p.key)), [pinnedItems]);
    const salammboIsBusy = salammboStatus === salammboStatuses.loading || salammboStatus === salammboStatuses.processing;

    const allTags = useMemo(() => {
        const coords = position?.coords ?? null;
        const sorted = coords
            ? [...intelPoints].sort((a, b) => calculateDistanceKm(coords.latitude, coords.longitude, a.latitude, a.longitude) - calculateDistanceKm(coords.latitude, coords.longitude, b.latitude, b.longitude))
            : intelPoints;
        const tagSet = new Set();
        sorted.forEach((p) => (p.tags ?? []).filter((t) => t !== secretTag).forEach((t) => tagSet.add(t)));
        return Array.from(tagSet);
    }, [intelPoints, position]);

    // References

    const navigate = useNavigate();
    const positionRef = useRef(position);
    const cryptoKeyRef = useRef(cryptoKey);
    const decryptionWarningShownRef = useRef(false);
    const hasAutoZoomedRef = useRef(false);
    const mapCenterRef = useRef(null);
    const activeTabRef = useRef(activeTab);
    const viewportBoundsRef = useRef(null);
    const exportCancelledRef = useRef(false);
    const lastFetchedGeohashRef = useRef(null);
    const salammboEnabledRef = useRef(salammboEnabled);

    // Effects

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        cryptoKeyRef.current = cryptoKey;
    }, [cryptoKey]);

    useEffect(() => {
        if (!cryptoKey || pinnedItems.length === 0) return;
        loadPinnedIntel(cryptoKey, pinnedItems);
    }, [cryptoKey]);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        salammboEnabledRef.current = salammboEnabled;
        if (salammboEnabled) {
            startSalammbo();
        }
    }, [salammboEnabled]);

    useEffect(() => {
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

    const loadPinnedIntel = async (key, items) => {
        const results = await Promise.allSettled(items.map(async (item) => {
            const { encryptedPayload, hasImage } = await getIntelDetails(item);
            const plaintext = await decryptText(key, encryptedPayload);
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
                planned: type === intelTypePlanned,
                hasImage,
                confirmed: true,
                b64image: null,
                fromServer: true,
            };
        }));
        const loaded = results
            .filter((r) => r.status === promiseStatusFulfilled)
            .map((r) => r.value);
        if (loaded.length === 0) return;
        setIntelPoints((prev) => {
            const existingKeys = new Set(prev.map((p) => p.key));
            return [...prev, ...loaded.filter((p) => !existingKeys.has(p.key))];
        });
    };

    const onPinToggle = (geohash, key) => {
        setPinnedItems((prev) => {
            const next = prev.some((p) => p.key === key)
                ? prev.filter((p) => p.key !== key)
                : [...prev, { geohash, key }];
            storageSetJson(lsKeyPinnedItems, next);
            return next;
        });
    };

    const applyIntelFilter = (point) => {
        const parsed = chipsToFilter(filterChips);
        if (showFiltersOnMap && parsed.tokens.length > 0) {
            return applyFilter(parsed, point);
        }
        return !(point.tags ?? []).includes(secretTag);
    };

    const currentSalammboGeohash = () => {
        if (mapCenter?.latitude != null && mapCenter?.longitude != null) {
            return coordsToGeohash5(mapCenter.latitude, mapCenter.longitude);
        }
        const coords = positionRef.current?.coords;
        if (!coords) return null;
        return coordsToGeohash5(coords.latitude, coords.longitude);
    };

    const geohashForPoint = (point) => {
        if (point.geohash) return point.geohash;
        if (point.latitude == null || point.longitude == null) return null;
        return coordsToGeohash5(point.latitude, point.longitude);
    };

    const salammboContextIntelPoints = () => {
        const geohash = currentSalammboGeohash();
        if (!geohash) return [];
        return intelPoints.filter((point) => applyIntelFilter(point) && geohashForPoint(point) === geohash);
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
        if (activeTabRef.current !== 'map') {
            const currentGeohash = coordsToGeohash5(position.coords.latitude, position.coords.longitude);
            if (currentGeohash !== lastFetchedGeohashRef.current) {
                lastFetchedGeohashRef.current = currentGeohash;
                setZoomToPositionSignal((previous) => previous + 1);
            }
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

    const showSuccess = (message) => setCloudSaveSuccess(message);

    const onPositionError = (error) => {
        console.error(error);
        setError("Error getting geolocation — check that it is enabled or wait a moment (high precision locations may take time).", error, 'geolocation');
    };

    const saveRecentTags = (tags) => {
        const filtered = tags.filter((t) => t !== secretTag);
        storageSetJson(lsKeyRecentTags, filtered);
        setRecentTags(filtered);
    };

    const onSalammboProgress = (progress) => {
        setSalammboProgress(progress);
    };

    const startSalammbo = async () => {
        if (salammboStatus === salammboStatuses.loading || salammboStatus === salammboStatuses.ready) return;
        setSalammboStatus(salammboStatuses.loading);
        setSalammboError(null);
        setSalammboProgress({ progress: 0, text: "Preparing local model..." });
        try {
            await loadSalammboEngine(onSalammboProgress);
            if (!salammboEnabledRef.current) return;
            setSalammboStatus(salammboStatuses.ready);
            setSalammboProgress({ progress: 1, text: "Salammbo ready." });
        } catch (error) {
            console.error("failed to load Salammbo:", error);
            if (error?.salammboUnsupported || `${error?.message ?? ""}`.includes("maxStorageBuffersPerShaderStage")) {
                salammboEnabledRef.current = false;
                storageSetBoolean(lsKeySalammboEnabled, false);
                setSalammboEnabled(false);
                setSalammboPromptIsOpen(false);
                setSalammboAnswer(null);
            } else if (!salammboEnabledRef.current) {
                return;
            }
            setSalammboStatus(salammboStatuses.error);
            setSalammboProgress(null);
            setSalammboError(error?.salammboUnsupported
                ? error.message
                : `${error?.message ?? ""}`.includes("maxStorageBuffersPerShaderStage")
                    ? "Salammbo is not supported on this browser or device yet. Its WebGPU storage-buffer limit is below what the local LLM runtime needs."
                    : error?.message || "Salammbo could not load on this browser.");
        }
    };

    const disableSalammbo = async () => {
        salammboEnabledRef.current = false;
        storageSetBoolean(lsKeySalammboEnabled, false);
        setSalammboEnabled(false);
        setSalammboPromptIsOpen(false);
        setSalammboAnswer(null);
        setSalammboQuestion("");
        setSalammboError(null);
        setSalammboProgress(null);
        setSalammboStatus(salammboStatuses.deleting);
        try {
            await deleteSalammboModel();
            setSalammboStatus(salammboStatuses.idle);
        } catch (error) {
            console.error("failed to delete Salammbo model:", error);
            setSalammboStatus(salammboStatuses.error);
            setSalammboError(error?.message || "Salammbo was disabled, but the local model cache could not be deleted.");
        } finally {
            setSalammboProgress(null);
        }
    };

    const onSalammboToggle = async (enabled) => {
        if (!enabled) {
            await disableSalammbo();
            return;
        }
        salammboEnabledRef.current = enabled;
        storageSetBoolean(lsKeySalammboEnabled, enabled);
        setSalammboEnabled(enabled);
        startSalammbo();
    };

    const onSalammboButtonClick = () => {
        if (salammboStatus === salammboStatuses.loading || salammboStatus === salammboStatuses.processing) return;
        if (salammboStatus === salammboStatuses.error || salammboStatus === salammboStatuses.idle) {
            startSalammbo();
            return;
        }
        setSalammboPromptIsOpen(true);
    };

    const onSalammboQuestionChange = (event) => {
        setSalammboQuestion(event.target.value);
    };

    const onSalammboPromptClose = () => {
        setSalammboPromptIsOpen(false);
        setSalammboQuestion("");
    };

    const onSalammboAnswerClose = () => {
        setSalammboAnswer(null);
    };

    const onSalammboAsk = async () => {
        const question = salammboQuestion.trim();
        if (!question) return;
        setSalammboStatus(salammboStatuses.processing);
        setSalammboError(null);
        try {
            const contextIntelPoints = salammboContextIntelPoints();
            const answer = await askSalammbo({
                question,
                intelPoints: contextIntelPoints,
                position,
                onProgress: onSalammboProgress,
            });
            setSalammboAnswer(answer);
            setSalammboPromptIsOpen(false);
            setSalammboQuestion("");
            setSalammboStatus(salammboStatuses.ready);
        } catch (error) {
            console.error("Salammbo query failed:", error);
            setSalammboStatus(salammboStatuses.error);
            setSalammboError(error?.message || "Salammbo could not answer that question.");
        }
    };

    const onIntelReady = (description, b64Image, tags, saveToCloud) => {
        if (!geolocationIsEnabled) {
            console.warn("geolocation is disabled - will not store intel");
            return;
        }
        saveRecentTags(tags);
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
                        setError("⚠ Photo still not uploaded — description and location were saved but the photo is missing. Tap ↻ to retry.", retryErr, 'imageUpload', retry);
                    }
                };
                setError("⚠ Photo upload failed — description and location were saved but the photo is missing from the cloud. Tap ↻ to retry.", imageErr, 'imageUpload', retry);
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
                geohash,
                encryptedPayload,
                hasImage: !!encryptedImageBuffer,
                timestamp: intelPoint.timestamp,
            }, silent ? undefined : (attempt) => setCloudSaveMessage(attempt === 0 ? "Saving Intel..." : "Trying again..."));

            const confirmedPoint = { key: rowKey, geohash };

            if (silent && presignedPutUrl && encryptedImageBuffer) {
                await uploadIntelImage(presignedPutUrl, encryptedImageBuffer);
            }

            setIntelPoints((previous) => previous.map((point) => {
                if (point.key !== intelPoint.key) return point;
                return {
                    ...point,
                    key: rowKey,
                    geohash,
                    confirmed: true,
                    b64image: null,
                    hasImage: silent ? !!encryptedImageBuffer : false,
                };
            }));
            setAppError((prev) => prev?.type === 'save' ? null : prev);

            if (!silent && presignedPutUrl && encryptedImageBuffer) {
                setCloudSaveMessage("Uploading Image...");
                await uploadConfirmedIntelImage(confirmedPoint, encryptedImageBuffer, presignedPutUrl, false);
            }
            if (!silent) showSuccess("Intel saved.");
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
        if (saved > 0) setCollectClearSignal((prev) => prev + 1);
        if (failed > 0) {
            setSaveAllState(null);
            setError(`${failed} intel point${failed > 1 ? 's' : ''} failed to save — tap Save All to retry.`, null);
        } else {
            setSaveAllState({ saved });
            setTimeout(() => setSaveAllState(null), 4000);
        }
    };

    const onDeleteConfirmedIntel = async (intelPoint) => {
        setCloudSaveMessage("Deleting Intel...");
        try {
            const { alreadyDeleted } = await deleteIntel(intelPoint);
            setIntelPoints((previous) => previous.filter((point) => point.key !== intelPoint.key));
            if (alreadyDeleted) {
                setError("Intel was already deleted elsewhere — removed from map.", null);
            } else {
                showSuccess("Intel deleted.");
            }
        } catch (error) {
            console.error('failed to delete intel:', error);
            setError("Failed to delete intel — please try again.", error);
        } finally {
            setCloudSaveMessage(null);
        }
    };

    const onBoundsChange = async (minLat, minLon, maxLat, maxLon, zoom) => {
        viewportBoundsRef.current = { minLat, minLon, maxLat, maxLon };
        setMapZoom(zoom);
        setMapCenter({ latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2 });
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
                    planned: type === intelTypePlanned,
                    hasImage: item.hasImage,
                    confirmed: true,
                    b64image: null,
                    fromServer: true,
                };
            }));

            const decrypted = results
                .filter((r) => r.status === promiseStatusFulfilled)
                .map((r) => r.value);

            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0 && !decryptionWarningShownRef.current) {
                decryptionWarningShownRef.current = true;
                setError("Some intel could not be decrypted with the current password — it may have been stored with a different one.", null);
            }
            setIntelPoints((previous) => {
                const currentCells = new Set(bboxToGeohash5Cells(minLat, minLon, maxLat, maxLon));
                const inSession = previous.filter((p) => !p.fromServer);
                const retained = previous.filter((p) => p.fromServer && (currentCells.has(p.geohash) || pinnedKeys.has(p.key)));
                const retainedKeys = new Set(retained.map((p) => p.key));
                const inSessionKeys = new Set(inSession.map((p) => p.key));
                const incoming = decrypted.filter((p) => !retainedKeys.has(p.key) && !inSessionKeys.has(p.key));
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

    const onEditIntelTags = async (intelPoint, tags) => {
        const key = cryptoKeyRef.current;
        setCloudSaveMessage("Updating Tags...");
        try {
            const { encryptedPayload: currentEncryptedPayload } = await getIntelDetails(intelPoint);
            const currentPayload = JSON.parse(await decryptText(key, currentEncryptedPayload));
            const encryptedPayload = await encryptText(key, JSON.stringify({
                ...currentPayload,
                tags: tags ?? [],
            }));
            await updateIntel({ geohash: intelPoint.geohash, key: intelPoint.key, encryptedPayload });
            setIntelPoints((prev) => prev.map((p) => {
                if (p.key !== intelPoint.key) return p;
                return { ...p, tags: tags ?? [] };
            }));
            showSuccess("Tags updated.");
        } catch (error) {
            console.error("failed to update intel tags:", error);
            setError("Failed to update tags — please try again.", error);
            throw error;
        } finally {
            setCloudSaveMessage(null);
        }
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
                    lat, lon, accuracy: 0, description, timestamp, tags: tags ?? [], type: intelTypePlanned,
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
                    type: intelTypePlanned,
                });
                const encryptedPayload = await encryptText(key, payload);
                await updateIntel({ geohash: intelPoint.geohash, key: intelPoint.key, encryptedPayload });
                setIntelPoints((prev) => prev.map((p) => {
                    if (p.key !== intelPoint.key) return p;
                    return { ...p, description, tags: tags ?? [] };
                }));
            }
            setPlannedDialogState(null);
            showSuccess(state.mode === "add" ? "Note saved." : "Note updated.");
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
            } else {
                showSuccess("Note deleted.");
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

    const onSaveToCloudDefaultChange = (val) => {
        setSaveToCloudDefault(val);
        storageSetBoolean(lsKeySaveToCloudDefault, val);
    };

    const onViewOnMap = (intelPoint) => {
        setNavTarget(null);
        setActiveTab('map');
        if (intelPoint?.latitude != null && intelPoint?.longitude != null) {
            setFlyToLocationSignal({ lat: intelPoint.latitude, lon: intelPoint.longitude });
        }
    };

    const onOpenLocationSearch = () => {
        setLocationSearchIsOpen(true);
    };

    const onCloseLocationSearch = () => {
        setLocationSearchIsOpen(false);
    };

    const onLocationSearchResult = (result) => {
        setLocationSearchIsOpen(false);
        setActiveTab('map');
        setNavTarget(null);
        setFlyToLocationSignal({ lat: result.lat, lon: result.lon });
    };

    const locationSearchProximity = () => {
        if (mapCenter?.latitude != null && mapCenter?.longitude != null) {
            return { lat: mapCenter.latitude, lon: mapCenter.longitude };
        }
        const coords = position?.coords;
        if (!coords) return null;
        return { lat: coords.latitude, lon: coords.longitude };
    };

    const onStartExport = () => {
        setNavTarget(null);
        setPlacingNote(false);
        setExportingIntel(true);
        setActiveTab('map');
    };

    const onExportCancel = () => {
        exportCancelledRef.current = true;
        setExportingIntel(false);
        setExportProgress(null);
    };

    const onExportConfirm = async () => {
        const bounds = viewportBoundsRef.current;
        const viewportItems = intelPoints.filter((p) =>
            p.confirmed && pointInBounds(p.latitude, p.longitude, bounds)
        );
        if (viewportItems.length === 0) {
            setError('No saved intel in the current viewport to export.', null);
            return;
        }
        exportCancelledRef.current = false;
        setExportingIntel(false);
        setExportProgress({ fileIndex: 1, totalFiles: estimateFileCount(viewportItems), itemsProcessed: 0, totalItems: viewportItems.length, itemsInBatch: 0 });
        try {
            await exportIntel(
                viewportItems,
                cryptoKeyRef.current,
                getIntelDetails,
                decryptBytes,
                getComments,
                decryptText,
                setExportProgress,
                () => exportCancelledRef.current,
            );
            if (!exportCancelledRef.current) {
                storageSetJson(lsKeyPinnedItems, []);
                setPinnedItems([]);
            }
        } catch (exportErr) {
            console.error('export failed:', exportErr);
            if (!exportCancelledRef.current) setError('Export failed — please try again.', exportErr);
        } finally {
            setExportProgress(null);
        }
    };

    const onDiscardAllUnconfirmed = () => {
        setIntelPoints((prev) => prev.filter((p) => p.confirmed || p.planned));
    };

    const onLogout = async () => {
        try {
            await logout();
            await clearKey();
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
            { cloudSaveSuccess && (
                <div className="rover-success-banner">
                    <span>✓ {cloudSaveSuccess}</span>
                    <button className="rover-success-banner-dismiss" onClick={() => setCloudSaveSuccess(null)}>✕</button>
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
            { activeTab !== "map" && (
                <div className="rover-view-overlay">
                    { activeTab === "intel" && (
                        <IntelListView
                            intelPoints={intelPoints}
                            position={position}
                            mapCenter={mapCenter}
                            cryptoKey={cryptoKey}
                            onKeepIntel={onKeepIntel}
                            onDiscardIntel={onDiscardIntel}
                            onDeleteConfirmedIntel={onDeleteConfirmedIntel}
                            onEditPlannedIntel={onEditPlannedIntel}
                            onEditIntelTags={onEditIntelTags}
                            onNavigateTo={onNavigateTo}
                            onViewOnMap={onViewOnMap}
                            tagSuggestions={allTags}
                            filterChips={filterChips}
                            onFilterChipsChange={setFilterChips}
                            pinnedKeys={pinnedKeys}
                            onPinToggle={onPinToggle}
                            onError={(msg) => setError(msg, null)} />
                    )}
                    { activeTab === "collect" && (
                        <CollectForm
                            mode="page"
                            onIntelReady={onIntelReady}
                            tagSuggestions={allTags}
                            initialTags={recentTags}
                            saveToCloudDefault={saveToCloudDefault}
                            clearSignal={collectClearSignal} />
                    )}
                    { activeTab === "options" && (
                        <OptionsView
                            geolocationIsEnabled={geolocationIsEnabled}
                            onGeolocationToggle={() => setGeolocationIsEnabled((prev) => !prev)}
                            saveToCloudDefault={saveToCloudDefault}
                            onSaveToCloudDefaultChange={onSaveToCloudDefaultChange}
                            showFiltersOnMap={showFiltersOnMap}
                            onShowFiltersOnMapChange={(val) => { setShowFiltersOnMap(val); storageSetBoolean(lsKeyShowFiltersOnMap, val); }}
                            salammboEnabled={salammboEnabled}
                            salammboStatus={salammboStatus}
                            salammboProgress={salammboProgress}
                            salammboError={salammboError}
                            onSalammboToggle={onSalammboToggle}
                            onLogout={onLogout}
                            onExportAll={onStartExport}
                            onImportIntel={() => setImportIsOpen(true)} />
                    )}
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
                    onEditIntelTags={onEditIntelTags}
                    onNavigateTo={onNavigateTo}
                    onViewOnMap={onViewOnMap}
                    tagSuggestions={allTags}
                    zoomToPositionSignal={zoomToPositionSignal}
                    zoomToNewIntelSignal={zoomToNewIntelSignal}
                    flyToLocationSignal={flyToLocationSignal}
                    mapCenterRef={mapCenterRef}
                    isSatellite={isSatellite}
                    geolocationIsEnabled={geolocationIsEnabled}
                    navTarget={navTarget}
                    placingNote={placingNote}
                    onNotePlaced={() => setPlacingNote(false)}
                    pinnedKeys={pinnedKeys}
                    onPinToggle={onPinToggle} />
            { activeTab === 'map' && navTarget && (
                <button className="rover-nav-cancel-btn" onClick={() => setNavTarget(null)} aria-label="Cancel navigation">✕</button>
            )}
            { activeTab === 'map' && navTarget && (
                <NavArrow
                    bearing={position ? calculateBearing(position.coords.latitude, position.coords.longitude, navTarget.latitude, navTarget.longitude) : 0}
                    distanceKm={position ? calculateDistanceKm(position.coords.latitude, position.coords.longitude, navTarget.latitude, navTarget.longitude) : 0}
                    hasPosition={!!position}
                    targetLat={navTarget.latitude}
                    targetLon={navTarget.longitude} />
            )}
            { activeTab === 'map' && (
                <>
                    { salammboEnabled && (
                        <button
                            className={`rover-salammbo-btn${salammboStatus === salammboStatuses.error ? " is-error" : ""}`}
                            onClick={onSalammboButtonClick}
                            disabled={salammboIsBusy}
                            aria-label="Ask Salammbo">
                            { salammboIsBusy
                                ? <Loader2 size={24} className="rover-save-all-spinning" aria-hidden="true" />
                                : <img className="rover-salammbo-avatar rover-salammbo-avatar--button" src={salammboMapIcon} alt="" aria-hidden="true" /> }
                        </button>
                    )}
                    <button className="rover-search-location-btn" onClick={onOpenLocationSearch} aria-label="Search location">
                        <Search size={24} aria-hidden="true" />
                    </button>
                    <button
                        className={`rover-add-note-btn${placingNote ? " is-active" : ""}`}
                        onClick={() => setPlacingNote((prev) => !prev)}
                        aria-label="Add note to map">
                        <NotebookPen size={24} aria-hidden="true" />
                    </button>
                    <button className="rover-satellite-btn" onClick={() => setIsSatellite((prev) => !prev)} aria-label="Toggle satellite view">
                        {isSatellite ? <Map size={24} aria-hidden="true" /> : <Layers size={24} aria-hidden="true" />}
                    </button>
                    <button className="rover-locate-btn" onClick={onZoomToMe} aria-label="Zoom to my location">
                        <Navigation2 size={24} aria-hidden="true" />
                    </button>
                </>
            )}
            { activeTab === 'map' && salammboEnabled && salammboPromptIsOpen && (
                <div className="rover-salammbo-panel">
                    <textarea
                        className="rover-salammbo-input"
                        value={salammboQuestion}
                        onChange={onSalammboQuestionChange}
                        placeholder="Ask Salammbo about loaded intel"
                        rows={3} />
                    <div className="rover-salammbo-actions">
                        <button className="rover-salammbo-action rover-salammbo-action--cancel" onClick={onSalammboPromptClose} aria-label="Close Salammbo">
                            <X size={16} aria-hidden="true" />
                        </button>
                        <button className="rover-salammbo-action rover-salammbo-action--send" onClick={onSalammboAsk} disabled={!salammboQuestion.trim() || salammboIsBusy} aria-label="Ask Salammbo">
                            { salammboStatus === salammboStatuses.processing
                                ? <Loader2 size={16} className="rover-save-all-spinning" aria-hidden="true" />
                                : <>
                                    <Check size={14} aria-hidden="true" />
                                    <span>OK</span>
                                </> }
                        </button>
                    </div>
                    { salammboError && (
                        <p className="rover-salammbo-error">{salammboError}</p>
                    )}
                </div>
            )}
            { activeTab === 'map' && salammboEnabled && salammboAnswer && !salammboPromptIsOpen && (
                <div className="rover-salammbo-bubble">
                    <img className="rover-salammbo-avatar rover-salammbo-avatar--bubble" src={salammboAvatar} alt="" aria-hidden="true" />
                    <button className="rover-salammbo-bubble-close" onClick={onSalammboAnswerClose} aria-label="Close Salammbo response">
                        <X size={14} aria-hidden="true" />
                    </button>
                    <p>{salammboAnswer}</p>
                </div>
            )}
            { locationSearchIsOpen && (
                <LocationSearch
                    onResult={onLocationSearchResult}
                    onCancel={onCloseLocationSearch}
                    proximity={locationSearchProximity()} />
            )}
            { activeTab === 'map' && placingNote && (
                <div className="rover-placing-note-banner">
                    <span className="rover-placing-note-primary">Tap map to place note</span>
                    <span className="rover-placing-note-hint">Press Add Note button again to cancel</span>
                </div>
            )}
            { exportProgress && (
                <div className="rover-export-progress-overlay">
                    <div className="rover-export-progress-dialog">
                        <p className="rover-export-progress-title">Exporting Intel</p>
                        <p className="rover-export-progress-subtitle">File {exportProgress.fileIndex} of ~{exportProgress.totalFiles}</p>
                        <div className="rover-export-progress-bar-track">
                            <div
                                className="rover-export-progress-bar-fill"
                                style={{ width: `${exportProgress.totalItems > 0 ? Math.round((exportProgress.itemsProcessed / exportProgress.totalItems) * 100) : 0}%` }} />
                        </div>
                        <p className="rover-export-progress-count">{exportProgress.itemsProcessed} / {exportProgress.totalItems} items</p>
                        <p className="rover-export-progress-warning">Keep this tab open until all files have downloaded</p>
                        <button className="rover-export-progress-cancel" onClick={onExportCancel}>Cancel</button>
                    </div>
                </div>
            )}
            { activeTab === 'map' && exportingIntel && (
                <>
                    <button className="rover-nav-cancel-btn" onClick={onExportCancel} aria-label="Cancel export">✕</button>
                    <div className="rover-export-banner">
                        <span className="rover-export-banner-text">Zoom and pan to the area you want to export — all points in the viewport will be exported</span>
                        { mapZoom >= minIntelQueryZoom
                            ? <button className="rover-export-banner-ok" onClick={onExportConfirm}>Export</button>
                            : <span className="rover-export-banner-zoom-warning">Too far out — zoom in to export</span>
                        }
                    </div>
                </>
            )}
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            { cloudSaveMessage && (
                <div className="rover-save-all-group">
                    <div className="rover-save-all-btn" style={{ cursor: "default" }}>
                        <Loader2 size={16} className="rover-save-all-spinning" aria-hidden="true" />
                        <span>{cloudSaveMessage}</span>
                    </div>
                </div>
            )}
            { (() => {
                const pendingCount = intelPoints.filter((p) => !p.confirmed && !p.planned).length;
                if (cloudSaveMessage) return null;
                if (saveAllState && saveAllState !== 'saving') {
                    return (
                        <div className="rover-save-all-success">
                            <Check size={15} aria-hidden="true" />
                            <span>Saved</span>
                            <button className="rover-save-all-dismiss" onClick={() => setSaveAllState(null)} aria-label="Dismiss">✕</button>
                        </div>
                    );
                }
                if (pendingCount === 0) return null;
                return (
                    <div className="rover-save-all-group">
                        <button className="rover-save-all-btn"
                                onClick={onSaveAllIntel}
                                disabled={saveAllState === 'saving'}
                                aria-label="Save all intel to cloud">
                            { saveAllState === 'saving'
                                ? <Loader2 size={16} className="rover-save-all-spinning" aria-hidden="true" />
                                : <CloudUpload size={16} aria-hidden="true" /> }
                            { saveAllState === 'saving' ? 'Saving...' : `Save All (${pendingCount})` }
                        </button>
                        { saveAllState !== 'saving' && (
                            <button className="rover-save-all-discard" onClick={onDiscardAllUnconfirmed} aria-label="Discard all unsaved intel">✕</button>
                        )}
                    </div>
                );
            })() }
            { importIsOpen && (
                <ImportIntelDialog
                    onImport={onImportIntel}
                    onMassImportComplete={(imported, skipped, failed) => {
                        setImportIsOpen(false);
                        showSuccess(`Imported ${imported} item${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}${failed > 0 ? `, ${failed} failed` : ''}.`);
                    }}
                    cryptoKey={cryptoKey}
                    intelPoints={intelPoints}
                    onCancel={() => setImportIsOpen(false)} />
            )}
            { locateIntelPoint && <LocateArrow onConfirm={onLocateConfirm} /> }
            { exportIntelPoint && (
                <ExportIntelDialog
                    intelPoint={exportIntelPoint}
                    cryptoKey={cryptoKey}
                    onCancel={() => setExportIntelPoint(null)} />
            )}
            { plannedDialogState && (
                <PlannedDialog
                    mode={plannedDialogState.mode}
                    intelPoint={plannedDialogState.mode === "edit" ? plannedDialogState.intelPoint : null}
                    tagSuggestions={allTags}
                    initialTags={plannedDialogState.mode === "edit" ? (plannedDialogState.intelPoint.tags ?? []) : []}
                    onSave={onSavePlannedIntel}
                    onCancel={() => setPlannedDialogState(null)}
                    onDelete={plannedDialogState.mode === "edit" ? onDeletePlannedIntel : null} />
            )}
        </div>
    )
}
         
