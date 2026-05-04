import { useEffect, useRef, useState } from "react";

import "./MapView.css";

import { Map as MLMap, Marker as MLMarker, Popup as MLPopup } from "maplibre-gl";

import markerConfirmedUrl from "../assets/markers/intel-confirmed.svg";
import markerNewUrl from "../assets/markers/intel-new.svg";
import markerCommunityUrl from "../assets/markers/intel-community.svg";
import markerPlannedUrl from "../assets/markers/intel-planned.svg";

import { calculateSimpleCoord } from "../utils/geo";
import ReviewDialog from "./ReviewDialog.jsx";

export default function MapView({ position, intelPoints, cryptoKey, geolocationIsEnabled, onKeepIntel, onDiscardIntel, onDeleteConfirmedIntel, onBoundsChange, onError, onAddPlannedIntel, onEditPlannedIntel, onExportIntel, onNavigateTo, onViewOnMap, zoomToPositionSignal, zoomToNewIntelSignal, flyToLocationSignal, mapCenterRef, isSatellite, navTarget }) {
    
    // Consts
    
    const rasterTileSize = 256;
    const accuracyZonePointsCount = 20;
    const rasterSourceID = "osm";
    const userSourceID = "user";
    const intelSourceID = "intel";
    const streetTileUrl = "https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png";
    const satelliteTileUrl = `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;
    const markerLayerID = "intel-markers";
    const markerHoverCursor = "pointer";
    const intelActionsPopupOffset = 10;
    const debounceEndMills = 300;
    const zoomInLevel = 16;
    const flySpeed = 1.8;
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
            [rasterSourceID]: {
                type: "raster",
                tiles: [streetTileUrl],
                tileSize: rasterTileSize,
                attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://www.maptiler.com/copyright/">MapTiler</a> contributors',
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
                paint: {
                    "icon-opacity": ["get", "iconOpacity"],
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
    const exportIntelRef = useRef(onExportIntel);
    const navigateToRef = useRef(onNavigateTo);
    const activeIntelActionsPopupRef = useRef(null);
    const markerClickConsumedRef = useRef(false);
    const deleteConfirmedIntelRef = useRef(onDeleteConfirmedIntel);
    const onBoundsChangeRef = useRef(onBoundsChange);
    const boundsDebounceRef = useRef(null);
    const onAddPlannedIntelRef = useRef(onAddPlannedIntel);
    const editPlannedIntelRef = useRef(onEditPlannedIntel);
    const navTargetMarkerRef = useRef(null);
    const [reviewIntelPoint, setReviewIntelPoint] = useState(null);

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
        if (reviewIntelPoint && !intelPoints.find((p) => p.key === reviewIntelPoint.key)) {
            setReviewIntelPoint(null);
        }
    }, [intelPoints]);

    useEffect(() => {
        keepIntelRef.current = onKeepIntel;
    }, [onKeepIntel]);

    useEffect(() => {
        discardIntelRef.current = onDiscardIntel;
    }, [onDiscardIntel]);

    useEffect(() => {
        exportIntelRef.current = onExportIntel;
    }, [onExportIntel]);

    useEffect(() => {
        navigateToRef.current = onNavigateTo;
    }, [onNavigateTo]);

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
        if (!map) {
            console.warn("flyToLocationSignal effect: map not ready");
            return;
        }
        map.flyTo({ center: [flyToLocationSignal.lon, flyToLocationSignal.lat], zoom: zoomInLevel, speed: flySpeed });
    }, [flyToLocationSignal]);

    useEffect(() => {
        if (navTargetMarkerRef.current) {
            navTargetMarkerRef.current.remove();
            navTargetMarkerRef.current = null;
        }
        const map = roverMapRef.current;
        if (!navTarget?.latitude || !navTarget?.longitude || !map) return;
        const el = document.createElement('div');
        el.className = 'nav-target-ring';
        navTargetMarkerRef.current = new MLMarker({ element: el, anchor: 'center' })
            .setLngLat([navTarget.longitude, navTarget.latitude])
            .addTo(map);
    }, [navTarget]);

    useEffect(() => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("isSatellite effect: map not ready");
            return;
        }
        const source = map.getSource(rasterSourceID);
        if (!source) {
            console.warn("isSatellite effect: raster source not found");
            return;
        }
        source.setTiles([isSatellite ? satelliteTileUrl : streetTileUrl]);
    }, [isSatellite]);

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
            applyMapClickEvent();
            applyContextMenuEvent();
            fireBoundsChange(map);
        });

        map.on("moveend", () => {
            clearTimeout(boundsDebounceRef.current);
            boundsDebounceRef.current = setTimeout(() => fireBoundsChange(roverMapRef.current), debounceEndMills);
        });

        roverMapRef.current = map;
        if (mapCenterRef) mapCenterRef.current = () => roverMapRef.current?.getCenter();
    };

    const cleanupMap = () => {
        clearTimeout(boundsDebounceRef.current);
        removeIntelActionsPopup();
        removeMarkerClickEvent();
        removeMapClickEvent();
        removeMarkerHoverCursor();
        removeContextMenuEvent();
        navTargetMarkerRef.current?.remove();
        navTargetMarkerRef.current = null;
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

    const applyMapClickEvent = () => {
        const map = roverMapRef.current;
        if (!map) return;
        map.on("click", onMapClick);
    };

    const removeMapClickEvent = () => {
        const map = roverMapRef.current;
        if (!map) return;
        map.off("click", onMapClick);
    };

    const onMapClick = () => {
        if (markerClickConsumedRef.current) {
            markerClickConsumedRef.current = false;
            return;
        }
        removeIntelActionsPopup();
    };

    const onMarkerClick = (event) => {
        markerClickConsumedRef.current = true;
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
            onNewIntelClick(clickedIntel);
            return;
        }
        removeIntelActionsPopup();
        if (intelType === "planned") {
            onPlannedIntelClick(clickedIntel);
            return;
        }
        if (intelType === "confirmed") {
            onConfirmedIntelClick(clickedIntel);
            return;
        }
        if (intelType === "community") {
            onCommunityIntelClick(clickedIntel);
            return;
        }

        console.warn(`unknown intel type clicked: ${intelType}`);
    };

    const onNewIntelClick = (intelPoint) => {
        removeIntelActionsPopup();
        setReviewIntelPoint(intelPoint);
    };

    const onConfirmedIntelClick = (intelPoint) => {
        removeIntelActionsPopup();
        setReviewIntelPoint(intelPoint);
    };

    const onCommunityIntelClick = (_intelPoint) => {

    };

    const onPlannedIntelClick = (intelPoint) => {
        removeIntelActionsPopup();
        setReviewIntelPoint(intelPoint);
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
            }
        });

        activeIntelActionsPopupRef.current = contextPopup;
    };

    const removeIntelActionsPopup = () => {
        activeIntelActionsPopupRef.current?.remove();
        activeIntelActionsPopupRef.current = null;
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
            speed: flySpeed,
        });
    };

    const renderIntelPoints = (points) => {
        const map = roverMapRef.current;
        if (!map) {
            console.warn("map is not ready");
            return;
        }

        const oneYearMs = 365 * 24 * 60 * 60 * 1000;
        const fourYearsMs = 4 * oneYearMs;
        const now = Date.now();

        const features = points.map((point) => {
            let intelType = "new";
            if (point.community) {
                intelType = "community";
            } else if (point.planned) {
                intelType = "planned";
            } else if (point.confirmed) {
                intelType = "confirmed";
            }
            let iconOpacity = 1.0;
            if (point.confirmed && !point.planned && point.timestamp) {
                const age = now - point.timestamp;
                if (age > fourYearsMs) iconOpacity = 0.4;
                else if (age > oneYearMs) iconOpacity = 0.75;
            }
            return {
                type: "Feature",
                properties: {
                    key: point.key,
                    intelType,
                    iconOpacity,
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

    return (
        <>
            <div className="map-rover" ref={roverMapContainerRef}></div>
            { reviewIntelPoint && (
                <ReviewDialog
                    intelPoint={reviewIntelPoint}
                    cryptoKey={cryptoKey}
                    onClose={() => setReviewIntelPoint(null)}
                    onKeep={(point) => keepIntelRef.current?.(point)}
                    onDiscard={(point) => discardIntelRef.current?.(point)}
                    onExport={(point) => exportIntelRef.current?.(point)}
                    onDelete={(point) => deleteConfirmedIntelRef.current?.(point)}
                    onEdit={(point) => editPlannedIntelRef.current?.(point)}
                    onNavigateTo={(point) => navigateToRef.current?.(point)}
                    onViewOnMap={(point) => onViewOnMap?.(point)}
                    onError={onError} />
            )}
        </>
    );
}
