import { useEffect, useRef, useState } from "react";

import "./MapView.css";

import { Map as MLMap, Popup as MLPopup } from "maplibre-gl";

import markerConfirmedUrl from "../assets/markers/intel-confirmed.svg";
import markerNewUrl from "../assets/markers/intel-new.svg";
import markerCommunityUrl from "../assets/markers/intel-community.svg";
import markerPlannedUrl from "../assets/markers/intel-planned.svg";

import { calculateSimpleCoord } from "../utils/geo";
import { getIntelImageUrl } from "../utils/api";
import { decryptBytes } from "../utils/crypto";

export default function MapView({ position, intelPoints, cryptoKey, geolocationIsEnabled, onKeepIntel, onDiscardIntel, onDeleteConfirmedIntel, onBoundsChange, onError, onAddPlannedIntel, onEditPlannedIntel, zoomToPositionSignal, zoomToNewIntelSignal, flyToLocationSignal }) {
    
    // Consts
    
    const rasterTileSize = 256;
    const accuracyZonePointsCount = 20;
    const userSourceID = "user";
    const intelSourceID = "intel";
    const markerLayerID = "intel-markers";
    const markerHoverCursor = "pointer";
    const intelActionsPopupOffset = 10;
    const debounceEndMills = 300;
    const zoomInLevel = 16;
    const intelPopupTypes = {
        newActions: "new-actions",
        confirmedActions: "confirmed-actions",
        confirmedDeleteConfirm: "confirmed-delete-confirm",
        plannedActions: "planned-actions",
    };
    const markerImageIDs = {
        confirmed: "marker-confirmed",
        new: "marker-new",
        community: "marker-community",
        planned: "marker-planned",
    };
    const markerImageURLs = {
        [markerImageIDs.confirmed]: markerConfirmedUrl,
        [markerImageIDs.new]: markerNewUrl,
        [markerImageIDs.community]: markerCommunityUrl,
        [markerImageIDs.planned]: markerPlannedUrl,
    };

    const rasterStyle = {
        version: 8,
        sources: {
            osm: {
                type: "raster",
                tiles: ["https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png"],
                tileSize: rasterTileSize,
                attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
            [userSourceID]: {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
            },
            [intelSourceID]: {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: [],
                },
            },
        },
        layers: [
            {
                id: "osm-tiles",
                type: "raster",
                source: "osm",
            },
            {
                id: "accuracy",
                type: "fill",
                source: userSourceID,
                filter: ["==", ["get", "kind"], "accuracy"],
                paint: {
                    "fill-color": "rgba(0, 150, 255, 0.15)",
                    "fill-outline-color": "rgba(0, 150, 255, 0.5)",
                },
            },
            {
                id: "position",
                type: "circle",
                source: userSourceID,
                filter: ["==", ["get", "kind"], "position"],
                paint: {
                    "circle-radius": 6,
                    "circle-color": "blue",
                    "circle-stroke-color": "#fff",
                    "circle-stroke-width": 2,
                },
            },
            {
                id: markerLayerID,
                type: "symbol",
                source: intelSourceID,
                layout: {
                    "icon-image": [
                        "match",
                        ["get", "intelType"],
                        "confirmed",
                        markerImageIDs.confirmed,
                        "community",
                        markerImageIDs.community,
                        "planned",
                        markerImageIDs.planned,
                        markerImageIDs.new,
                    ],
                    "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        10,
                        0.7,
                        16,
                        1.05,
                    ],
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": false,
                    "icon-ignore-placement": false,
                },
            },
        ],
    };

    // Refs

    const roverMapRef = useRef(null);
    const roverMapContainerRef = useRef(null);
    const intelPointsRef = useRef(intelPoints);
    const keepIntelRef = useRef(onKeepIntel);
    const discardIntelRef = useRef(onDiscardIntel);
    const activeIntelActionsPopupRef = useRef(null);
    const activeIntelActionPointKeyRef = useRef(null);
    const activeIntelActionPopupTypeRef = useRef(null);
    const deleteConfirmedIntelRef = useRef(onDeleteConfirmedIntel);
    const onBoundsChangeRef = useRef(onBoundsChange);
    const boundsDebounceRef = useRef(null);
    const onAddPlannedIntelRef = useRef(onAddPlannedIntel);
    const editPlannedIntelRef = useRef(onEditPlannedIntel);
    const [reviewIntelPointKey, setReviewIntelPointKey] = useState(null);
    const [reviewImageUrl, setReviewImageUrl] = useState(null);
    const reviewBlobUrlRef = useRef(null);

    // Effects

    useEffect(() => {
        if (!roverMapContainerRef.current) {
            return;
        }
        if (roverMapRef.current) {
            return;
        }
        initializeMap();
        return () => cleanupMap();
    }, []);

    useEffect(() => {
        intelPointsRef.current = intelPoints;
        const activeIntelActionPointKey = activeIntelActionPointKeyRef.current;
        if (!activeIntelActionPointKey) {
            return;
        }
        const activeIntelPoint = intelPoints.find((point) => point.key === activeIntelActionPointKey);
        if (!activeIntelPoint) {
            removeIntelActionsPopup();
            return;
        }
        const activePopupType = activeIntelActionPopupTypeRef.current;
        if (activePopupType === intelPopupTypes.newActions && (activeIntelPoint.confirmed || activeIntelPoint.community)) {
            removeIntelActionsPopup();
            return;
        }
        if (activePopupType === intelPopupTypes.confirmedActions && !activeIntelPoint.confirmed) {
            removeIntelActionsPopup();
            return;
        }
        if (activePopupType === intelPopupTypes.confirmedDeleteConfirm && !activeIntelPoint.confirmed) {
            removeIntelActionsPopup();
            return;
        }
        if (activePopupType === intelPopupTypes.plannedActions && !activeIntelPoint.planned) {
            removeIntelActionsPopup();
        }
    }, [intelPoints]);

    useEffect(() => {
        if (!reviewIntelPointKey) {
            return;
        }
        const reviewIntelPoint = intelPoints.find((point) => point.key === reviewIntelPointKey);
        if (!reviewIntelPoint || !reviewIntelPoint.confirmed) {
            setReviewIntelPointKey(null);
        }
    }, [intelPoints, reviewIntelPointKey]);

    useEffect(() => {
        keepIntelRef.current = onKeepIntel;
    }, [onKeepIntel]);

    useEffect(() => {
        discardIntelRef.current = onDiscardIntel;
    }, [onDiscardIntel]);

    useEffect(() => {
        deleteConfirmedIntelRef.current = onDeleteConfirmedIntel;
    }, [onDeleteConfirmedIntel]);

    useEffect(() => {
        onBoundsChangeRef.current = onBoundsChange;
    }, [onBoundsChange]);

    useEffect(() => {
        onAddPlannedIntelRef.current = onAddPlannedIntel;
    }, [onAddPlannedIntel]);

    useEffect(() => {
        editPlannedIntelRef.current = onEditPlannedIntel;
    }, [onEditPlannedIntel]);

    useEffect(() => {
        if (!reviewIntelPointKey) {
            if (reviewBlobUrlRef.current) {
                URL.revokeObjectURL(reviewBlobUrlRef.current);
                reviewBlobUrlRef.current = null;
            }
            setReviewImageUrl(null);
            return;
        }
        const point = intelPoints.find((p) => p.key === reviewIntelPointKey);
        if (!point?.hasImage) {
            setReviewImageUrl(null);
            return;
        }
        let cancelled = false;
        getIntelImageUrl(point)
            .then((presignedUrl) => fetch(presignedUrl))
            .then((response) => response.arrayBuffer())
            .then((encryptedBuffer) => decryptBytes(cryptoKey, encryptedBuffer))
            .then((plaintextBuffer) => {
                if (cancelled) return;
                if (reviewBlobUrlRef.current) {
                    URL.revokeObjectURL(reviewBlobUrlRef.current);
                }
                const blobUrl = URL.createObjectURL(new Blob([plaintextBuffer], { type: 'image/jpeg' }));
                reviewBlobUrlRef.current = blobUrl;
                setReviewImageUrl(blobUrl);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error("failed to load intel image:", error);
                    onError?.("Failed to load image — please try again.");
                }
            });
        return () => { cancelled = true; };
    }, [reviewIntelPointKey]);

    useEffect(() => {
        if (!geolocationIsEnabled) {
            clearAllFeatures();
        }
    }, [geolocationIsEnabled]);

    useEffect(() => {
        if (!position) {
            console.warn("position is not ready");
            return;
        }
        renderCurrentPosition(position.coords);
    }, [position]);

    useEffect(() => {
        if (zoomToPositionSignal === 0) {
            return;
        }
        if (!position) {
            console.warn("position is not ready");
            onError?.("Check geolocation is enabled — high precision locations may take a few seconds.");
            return;
        }
        sendMapToPosition(position.coords);
    }, [zoomToPositionSignal]);

    useEffect(() => {
        if (!intelPoints) {
            console.warn("no intel points to put on map");
            return;
        }
        renderIntelPoints(intelPoints);
    }, [intelPoints]);

    useEffect(() => {
        if (zoomToNewIntelSignal === 0) return;
        sendMapToLatest(intelPointsRef.current);
    }, [zoomToNewIntelSignal]);

    useEffect(() => {
        if (!flyToLocationSignal) return;
        const map = roverMapRef.current;
        if (!map) return;
        map.flyTo({ center: [flyToLocationSignal.lon, flyToLocationSignal.lat], zoom: zoomInLevel });
    }, [flyToLocationSignal]);

    // Methods

    const fireBoundsChange = (map) => {
        if (!map) return;
        const bounds = map.getBounds();
        onBoundsChangeRef.current?.(
            bounds.getSouth(),
            bounds.getWest(),
            bounds.getNorth(),
            bounds.getEast(),
            map.getZoom(),
        );
    };

    const initializeMap = () => {
        const map = new MLMap({
            container: roverMapContainerRef.current,
            style: rasterStyle,
            center: [0, 0],
            zoom: 2,
        });

        map.on("load", () => {
            loadMarkerImages();
            applyMarkerHoverCursor();
            applyMarkerClickEvent();
            applyContextMenuEvent();
            fireBoundsChange(map);
        });

        map.on("moveend", () => {
            clearTimeout(boundsDebounceRef.current);
            boundsDebounceRef.current = setTimeout(() => fireBoundsChange(roverMapRef.current), debounceEndMills);
        });

        roverMapRef.current = map;
    };

    const cleanupMap = () => {
        clearTimeout(boundsDebounceRef.current);
        removeIntelActionsPopup();
        removeMarkerClickEvent();
        removeMarkerHoverCursor();
        removeContextMenuEvent();
        roverMapRef.current?.remove();
        roverMapRef.current = null;
    };

    const loadMarkerImages = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        Object.entries(markerImageURLs).forEach(([imageID, imageURL]) => {
            if (map.hasImage(imageID)) {
                return;
            }
            loadMarkerImageData(imageURL)
                .then((imageData) => {
                    if (!map.hasImage(imageID)) {
                        map.addImage(imageID, imageData, { pixelRatio: 2 });
                    }
                })
                .catch((error) => {
                    console.error(error ?? new Error("could not load marker image"));
                });
        });
    };

    const applyMarkerHoverCursor = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.on("mouseenter", markerLayerID, onMarkerMouseEnter);
        map.on("mouseleave", markerLayerID, onMarkerMouseLeave);
    };

    const removeMarkerHoverCursor = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.off("mouseenter", markerLayerID, onMarkerMouseEnter);
        map.off("mouseleave", markerLayerID, onMarkerMouseLeave);
        map.getCanvas().style.cursor = "";
    };

    const onMarkerMouseEnter = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.getCanvas().style.cursor = markerHoverCursor;
    };

    const onMarkerMouseLeave = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.getCanvas().style.cursor = "";
    };

    const applyMarkerClickEvent = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.on("click", markerLayerID, onMarkerClick);
    };

    const removeMarkerClickEvent = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.off("click", markerLayerID, onMarkerClick);
    };

    const onMarkerClick = (event) => {
        const markerFeature = event.features?.[0];
        if (!markerFeature) {
            return;
        }
        const key = markerFeature.properties?.key;
        const intelType = markerFeature.properties?.intelType;
        const clickedIntel = intelPointsRef.current?.find((point) => point.key === key);

        if (!key || !intelType || !clickedIntel) {
            console.warn("clicked marker is missing required intel metadata");
            return;
        }

        if (intelType === "new") {
            onNewIntelClick(clickedIntel, event.lngLat);
            return;
        }
        removeIntelActionsPopup(); // non-new, close any popups first
        if (intelType === "planned") {
            onPlannedIntelClick(clickedIntel, event.lngLat);
            return;
        }
        if (intelType === "confirmed") {
            onConfirmedIntelClick(clickedIntel, event.lngLat);
            return;
        }
        if (intelType === "community") {
            onCommunityIntelClick(clickedIntel);
            return;
        }

        console.warn(`unknown intel type clicked: ${intelType}`);
    };

    const onNewIntelClick = (intelPoint, lngLat) => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        removeIntelActionsPopup();

        const popupContent = createKeepDiscardPopup(
            () => {
                // TODO send this new intel to the backend for 
                // validation and persistence
                keepIntelRef.current?.(intelPoint);
                removeIntelActionsPopup();
            },
            () => {
                // no need for backend calls because new intel 
                // is not persisted
                discardIntelRef.current?.(intelPoint);
                removeIntelActionsPopup();
            },
        );

        const keepDiscardConfirm = new MLPopup({
            className: "intel-point-actions-popup",
            closeButton: false,
            closeOnClick: false,
            closeOnMove: false,
            anchor: "top",
            offset: intelActionsPopupOffset,
        })
            .setLngLat(lngLat)
            .setDOMContent(popupContent)
            .addTo(map);

        keepDiscardConfirm.on("close", () => {
            if (activeIntelActionsPopupRef.current === keepDiscardConfirm) {
                activeIntelActionsPopupRef.current = null;
                activeIntelActionPointKeyRef.current = null;
                activeIntelActionPopupTypeRef.current = null;
            }
        });

        activeIntelActionsPopupRef.current = keepDiscardConfirm;
        activeIntelActionPointKeyRef.current = intelPoint.key;
        activeIntelActionPopupTypeRef.current = intelPopupTypes.newActions;
    };

    const onConfirmedIntelClick = (intelPoint, lngLat) => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        removeIntelActionsPopup();

        const popupContent = createReviewDeletePopup(
            () => {
                setReviewIntelPointKey(intelPoint.key);
                removeIntelActionsPopup();
            },
            () => {
                showConfirmedDeleteConfirmPopup(intelPoint, lngLat);
            },
        );

        const reviewDeletePopup = new MLPopup({
            className: "intel-point-actions-popup",
            closeButton: false,
            closeOnClick: false,
            closeOnMove: false,
            anchor: "top",
            offset: intelActionsPopupOffset,
        })
            .setLngLat(lngLat)
            .setDOMContent(popupContent)
            .addTo(map);

        reviewDeletePopup.on("close", () => {
            if (activeIntelActionsPopupRef.current === reviewDeletePopup) {
                activeIntelActionsPopupRef.current = null;
                activeIntelActionPointKeyRef.current = null;
                activeIntelActionPopupTypeRef.current = null;
            }
        });

        activeIntelActionsPopupRef.current = reviewDeletePopup;
        activeIntelActionPointKeyRef.current = intelPoint.key;
        activeIntelActionPopupTypeRef.current = intelPopupTypes.confirmedActions;
    };

    const showConfirmedDeleteConfirmPopup = (intelPoint, lngLat) => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        removeIntelActionsPopup();

        const popupContent = createConfirmedDeleteConfirmPopup(
            () => {
                deleteConfirmedIntelRef.current?.(intelPoint);
                removeIntelActionsPopup();
            },
            () => {
                removeIntelActionsPopup();
            },
        );

        const deleteConfirmPopup = new MLPopup({
            className: "intel-point-actions-popup",
            closeButton: false,
            closeOnClick: false,
            closeOnMove: false,
            anchor: "top",
            offset: intelActionsPopupOffset,
        })
            .setLngLat(lngLat)
            .setDOMContent(popupContent)
            .addTo(map);

        deleteConfirmPopup.on("close", () => {
            if (activeIntelActionsPopupRef.current === deleteConfirmPopup) {
                activeIntelActionsPopupRef.current = null;
                activeIntelActionPointKeyRef.current = null;
                activeIntelActionPopupTypeRef.current = null;
            }
        });

        activeIntelActionsPopupRef.current = deleteConfirmPopup;
        activeIntelActionPointKeyRef.current = intelPoint.key;
        activeIntelActionPopupTypeRef.current = intelPopupTypes.confirmedDeleteConfirm;
    };

    const onCommunityIntelClick = (_intelPoint) => {

    };

    const onPlannedIntelClick = (intelPoint, lngLat) => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        removeIntelActionsPopup();

        const popupContent = createEditDeletePopup(
            () => {
                removeIntelActionsPopup();
                editPlannedIntelRef.current?.(intelPoint);
            },
            () => {
                showConfirmedDeleteConfirmPopup(intelPoint, lngLat);
            },
        );

        const plannedActionsPopup = new MLPopup({
            className: "intel-point-actions-popup",
            closeButton: false,
            closeOnClick: false,
            closeOnMove: false,
            anchor: "top",
            offset: intelActionsPopupOffset,
        })
            .setLngLat(lngLat)
            .setDOMContent(popupContent)
            .addTo(map);

        plannedActionsPopup.on("close", () => {
            if (activeIntelActionsPopupRef.current === plannedActionsPopup) {
                activeIntelActionsPopupRef.current = null;
                activeIntelActionPointKeyRef.current = null;
                activeIntelActionPopupTypeRef.current = null;
            }
        });

        activeIntelActionsPopupRef.current = plannedActionsPopup;
        activeIntelActionPointKeyRef.current = intelPoint.key;
        activeIntelActionPopupTypeRef.current = intelPopupTypes.plannedActions;
    };

    const applyContextMenuEvent = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.on("contextmenu", onMapContextMenu);
    };

    const removeContextMenuEvent = () => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        map.off("contextmenu", onMapContextMenu);
    };

    const onMapContextMenu = (event) => {
        event.originalEvent?.preventDefault();
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        const features = map.queryRenderedFeatures(event.point, { layers: [markerLayerID] });
        if (features.length > 0) {
            return;
        }
        showAddNoteContextMenu(event.lngLat);
    };

    const showAddNoteContextMenu = (lngLat) => {
        const map = roverMapRef.current;
        if (!map) {
            return;
        }
        removeIntelActionsPopup();

        const wrapper = document.createElement("div");
        wrapper.className = "intel-point-actions";

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "intel-point-action add-note";
        addButton.textContent = "Add Note Here";
        addButton.addEventListener("click", (e) => {
            e.stopPropagation();
            removeIntelActionsPopup();
            onAddPlannedIntelRef.current?.(lngLat.lat, lngLat.lng);
        });

        wrapper.append(addButton);

        const contextPopup = new MLPopup({
            className: "intel-point-actions-popup",
            closeButton: false,
            closeOnClick: true,
            closeOnMove: true,
            anchor: "top",
            offset: intelActionsPopupOffset,
        })
            .setLngLat(lngLat)
            .setDOMContent(wrapper)
            .addTo(map);

        contextPopup.on("close", () => {
            if (activeIntelActionsPopupRef.current === contextPopup) {
                activeIntelActionsPopupRef.current = null;
                activeIntelActionPointKeyRef.current = null;
                activeIntelActionPopupTypeRef.current = null;
            }
        });

        activeIntelActionsPopupRef.current = contextPopup;
        activeIntelActionPointKeyRef.current = null;
        activeIntelActionPopupTypeRef.current = null;
    };

    const removeIntelActionsPopup = () => {
        activeIntelActionsPopupRef.current?.remove();
        activeIntelActionsPopupRef.current = null;
        activeIntelActionPointKeyRef.current = null;
        activeIntelActionPopupTypeRef.current = null;
    };

    const createKeepDiscardPopup = (onKeepClick, onDiscardClick) => {
        const wrapper = document.createElement("div");
        wrapper.className = "intel-point-actions";

        const keepButton = document.createElement("button");
        keepButton.type = "button";
        keepButton.className = "intel-point-action keep";
        keepButton.textContent = "Keep";
        keepButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onKeepClick();
        });

        const discardButton = document.createElement("button");
        discardButton.type = "button";
        discardButton.className = "intel-point-action discard";
        discardButton.textContent = "Discard";
        discardButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onDiscardClick();
        });

        wrapper.append(keepButton, discardButton);
        return wrapper;
    };

    const createReviewDeletePopup = (onReviewClick, onDeleteClick) => {
        const wrapper = document.createElement("div");
        wrapper.className = "intel-point-actions";

        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.className = "intel-point-action review";
        reviewButton.textContent = "Review";
        reviewButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onReviewClick();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "intel-point-action delete";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onDeleteClick();
        });

        wrapper.append(reviewButton, deleteButton);
        return wrapper;
    };

    const createEditDeletePopup = (onEditClick, onDeleteClick) => {
        const wrapper = document.createElement("div");
        wrapper.className = "intel-point-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "intel-point-action edit";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onEditClick();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "intel-point-action delete";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onDeleteClick();
        });

        wrapper.append(editButton, deleteButton);
        return wrapper;
    };

    const createConfirmedDeleteConfirmPopup = (onConfirmDelete, onCancelDelete) => {
        const wrapper = document.createElement("div");
        wrapper.className = "intel-point-delete-confirm";

        const message = document.createElement("p");
        message.className = "intel-point-delete-confirm-message";
        message.textContent = "Delete this intel?";

        const actions = document.createElement("div");
        actions.className = "intel-point-delete-confirm-actions";

        const yesButton = document.createElement("button");
        yesButton.type = "button";
        yesButton.className = "intel-point-action delete";
        yesButton.textContent = "Yes";
        yesButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onConfirmDelete();
        });

        const noButton = document.createElement("button");
        noButton.type = "button";
        noButton.className = "intel-point-action cancel";
        noButton.textContent = "No";
        noButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onCancelDelete();
        });

        actions.append(yesButton, noButton);
        wrapper.append(message, actions);
        return wrapper;
    };

    const formatIntelTimestamp = (timestamp) => {
        if (!timestamp) {
            return "Unknown";
        }
        const parsedTimestamp = new Date(timestamp);
        if (Number.isNaN(parsedTimestamp.getTime())) {
            return "Unknown";
        }
        return parsedTimestamp.toLocaleString();
    };

    const loadMarkerImageData = (imageURL) => {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const width = image.naturalWidth || image.width;
                const height = image.naturalHeight || image.height;
                if (!width || !height) {
                    reject(new Error("marker image has invalid dimensions"));
                    return;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) {
                    reject(new Error("could not create canvas context for marker image"));
                    return;
                }
                context.drawImage(image, 0, 0, width, height);
                resolve(context.getImageData(0, 0, width, height));
            };
            image.onerror = () => {
                reject(new Error(`failed to load marker image: ${imageURL}`));
            };
            image.src = imageURL;
        });
    };

    const calculateAccuracyCircle = (lat, lon, radiusMeters, pointsCount) => {
        if (pointsCount <= 0) {
            console.error("pointsCount is 0 - this would result in div by zero");
            return [];
        }
        const circularDegrees = 360.0;
        const bearingStep = circularDegrees / pointsCount;
        const bearings = Array.from({ length: pointsCount + 1 }, (_, index) => index * bearingStep);
        const radiusInKM = radiusMeters / 1000.0;
        const circleCoords = [];
        for (const bearing of bearings) {
            const coord = calculateSimpleCoord(lat, lon, radiusInKM, bearing);
            circleCoords.push(coord);
        }
        return circleCoords;
    };

    const clearAllFeatures = () => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready yet");
            return;
        }

        const emptyCollection = {
            type: "FeatureCollection",
            features: [],
        };

        if (map.isStyleLoaded()) {
            map.getSource(userSourceID)?.setData(emptyCollection);
            map.getSource(intelSourceID)?.setData(emptyCollection);
        } else {
            map.once("load", () => {
                map.getSource(userSourceID)?.setData(emptyCollection);
                map.getSource(intelSourceID)?.setData(emptyCollection);
            });
        }
    };

    const renderCurrentPosition = (coords) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready yet");
            return;
        }

        const accuracyZonePoints = calculateAccuracyCircle(
            coords.latitude,
            coords.longitude,
            coords.accuracy,
            accuracyZonePointsCount,
        );

        const features = [
            {
                type: "Feature",
                properties: {
                    kind: "position",
                },
                geometry: {
                    type: "Point",
                    coordinates: [
                        coords.longitude,
                        coords.latitude,
                    ],
                },
            },
            {
                type: "Feature",
                properties: {
                    kind: "accuracy",
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [accuracyZonePoints],
                },
            },
        ];

        if (map.isStyleLoaded()) {
            map.getSource(userSourceID)?.setData({
                type: "FeatureCollection",
                features,
            });
        } else {
            map.once("load", () => {
                map.getSource(userSourceID)?.setData({
                    type: "FeatureCollection",
                    features,
                });
            });
        }
    };

    const sendMapToLatest = (points) => {
        const sessionPoints = points.filter((p) => !p.fromServer);
        if (sessionPoints.length === 0) return;
        const lastPoint = sessionPoints.at(-1);
        sendMapToPosition({
            longitude: lastPoint.longitude,
            latitude: lastPoint.latitude,
        });
    };

    const sendMapToPosition = (coords) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready");
            return;
        }
        map.flyTo({
            center: [
                coords.longitude,
                coords.latitude,
            ],
            zoom: zoomInLevel,
        });
    };

    const renderIntelPoints = (points) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready");
            return;
        }

        const features = points.map((point) => {
            let intelType = "new";
            if (point.community) {
                intelType = "community";
            } else if (point.planned) {
                intelType = "planned";
            } else if (point.confirmed) {
                intelType = "confirmed";
            }
            return {
                type: "Feature",
                properties: {
                    key: point.key,
                    intelType,
                },
                geometry: {
                    type: "Point",
                    coordinates: [point.longitude, point.latitude],
                },
            };
        });

        const featureCollection = {
            type: "FeatureCollection",
            features,
        };

        if (map.isStyleLoaded()) {
            map.getSource(intelSourceID)?.setData(featureCollection);
        } else {
            map.once("load", () => {
                map.getSource(intelSourceID)?.setData(featureCollection);
            });
        }
    };

    const reviewIntelPoint = reviewIntelPointKey
        ? intelPoints.find((point) => point.key === reviewIntelPointKey)
        : null;
    const reviewIntelTimestamp = formatIntelTimestamp(reviewIntelPoint?.timestamp);

    return (
        <>
            <div className="map-rover" ref={roverMapContainerRef}></div>
            {reviewIntelPoint && (
                <div className="intel-review-overlay"
                     onClick={() => setReviewIntelPointKey(null)}>
                    <div className="intel-review-dialog"
                         onClick={(event) => event.stopPropagation()}>
                        <button className="intel-review-close"
                                type="button"
                                onClick={() => setReviewIntelPointKey(null)}>
                            X
                        </button>
                        <h3 className="intel-review-title">Intel Review</h3>
                        {reviewImageUrl ? (
                            <img className="intel-review-image"
                                 src={reviewImageUrl}
                                 alt="Captured intel" />
                        ) : (
                            <div className="intel-review-no-image">No image attached</div>
                        )}
                        <p className="intel-review-description">
                            {reviewIntelPoint.description || "No description provided."}
                        </p>
                        <p className="intel-review-meta">
                            Captured: {reviewIntelTimestamp}
                        </p>
                        {reviewIntelPoint.tags?.length > 0 && (
                            <div className="intel-review-tags">
                                {reviewIntelPoint.tags.map((tag) => (
                                    <span key={tag} className="intel-review-tag">{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
