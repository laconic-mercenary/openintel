import { useMemo, useState } from "react";
import { AlertTriangle, Camera, CircleCheck, HelpCircle, Map, Navigation, Notebook, Pin } from "lucide-react";
import { calculateDistanceKm } from "../utils/geo";
import { chipsToFilter, applyFilter } from "../utils/filters";
import { lsKeyUseCurrentPosition, storageGetBoolean, storageSetBoolean } from "../utils/storage";
import ChipInput from "./ChipInput.jsx";
import ReviewDialog from "./ReviewDialog.jsx";
import "./IntelListView.css";

// Consts

const maxListEntries = 100;
const distanceThresholdKm = 0.01;

const searchTips = [
    { heading: "Basic search", body: "Type any word to search descriptions and tags." },
    { heading: "AND search", body: "Use 'and' between terms — shows intel matching all of them." },
    { heading: "OR search", body: "Use 'or' between terms — shows intel matching any of them." },
];

export default function IntelListView({ intelPoints, position, mapCenter, cryptoKey, onKeepIntel, onDiscardIntel, onDeleteConfirmedIntel, onEditPlannedIntel, onExportIntel, onNavigateTo, onViewOnMap, filterChips, onFilterChipsChange, showFiltersOnMap, onShowFiltersOnMapChange, pinnedKeys, onPinToggle, onError }) {

    // State

    const [reviewIntelPoint, setReviewIntelPoint] = useState(null);
    const [useCurrentPosition, setUseCurrentPosition] = useState(() => storageGetBoolean(lsKeyUseCurrentPosition, true));
    const [showPositionTooltip, setShowPositionTooltip] = useState(false);
    const [showSearchTip, setShowSearchTip] = useState(false);

    // Methods

    const parsedFilter = useMemo(() => chipsToFilter(filterChips), [filterChips]);

    const applyListFilter = (point) => applyFilter(parsedFilter, point);

    const sortedFiltered = useMemo(() => {
        const coords = useCurrentPosition
            ? (position?.coords ?? null)
            : (mapCenter ?? position?.coords ?? null);
        const items = intelPoints.filter(applyListFilter);
        items.sort((a, b) => {
            const aPinned = pinnedKeys?.has(a.key) ? 0 : 1;
            const bPinned = pinnedKeys?.has(b.key) ? 0 : 1;
            if (aPinned !== bPinned) return aPinned - bPinned;
            const aUnconfirmed = a.confirmed ? 1 : 0;
            const bUnconfirmed = b.confirmed ? 1 : 0;
            if (aUnconfirmed !== bUnconfirmed) return aUnconfirmed - bUnconfirmed;
            if (coords) {
                const distA = calculateDistanceKm(coords.latitude, coords.longitude, a.latitude, a.longitude);
                const distB = calculateDistanceKm(coords.latitude, coords.longitude, b.latitude, b.longitude);
                if (Math.abs(distA - distB) > distanceThresholdKm) return distA - distB;
            }
            return (b.timestamp ?? 0) - (a.timestamp ?? 0);
        });
        return items.slice(0, maxListEntries);
    }, [intelPoints, position, filterChips, pinnedKeys]);

    const formatDistance = (point) => {
        const coords = useCurrentPosition ? position?.coords : (mapCenter ?? position?.coords);
        if (!coords) return null;
        const km = calculateDistanceKm(coords.latitude, coords.longitude, point.latitude, point.longitude);
        return km < 0.1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
    };

    const formatAge = (point) => {
        if (!point.timestamp) return null;
        const days = Math.floor((Date.now() - point.timestamp) / 86400000);
        return days === 0 ? "today" : `${days}d`;
    };

    const onRowTap = (point) => {
        setReviewIntelPoint(point);
    };

    const onCloseReview = () => setReviewIntelPoint(null);

    // DOM

    const hasPoints = intelPoints.length > 0;

    return (
        <div className="intel-list-view">
            <div className="intel-list-header">
                <div className="intel-list-search-row">
                    <ChipInput
                        chips={filterChips}
                        onChipsChange={onFilterChipsChange}
                        placeholder="Search intel…" />
                    <button className="intel-list-tooltip-btn" onClick={() => setShowSearchTip((p) => !p)} aria-label="Search tips">
                        <HelpCircle size={16} aria-hidden="true" />
                    </button>
                </div>
                { showSearchTip && (
                    <div className="intel-list-tooltip">
                        { searchTips.map((tip) => (
                            <p key={tip.heading}><strong>{tip.heading}:</strong> {tip.body}</p>
                        ))}
                    </div>
                )}
                <div className="intel-list-toggle-row">
                    <span className="intel-list-toggle-label">
                        Position source
                        <button className="intel-list-tooltip-btn" onClick={() => setShowPositionTooltip((p) => !p)} aria-label="About position source">
                            <HelpCircle size={14} aria-hidden="true" />
                        </button>
                    </span>
                    <button
                        className={`intel-list-toggle-btn${useCurrentPosition ? " is-on" : ""}`}
                        onClick={() => setUseCurrentPosition((prev) => { const next = !prev; storageSetBoolean(lsKeyUseCurrentPosition, next); return next; })}
                        aria-label="Toggle position source">
                        <Navigation size={13} aria-hidden="true" />
                        <span>{useCurrentPosition ? "Current Position" : "Map Center"}</span>
                    </button>
                </div>
                { showPositionTooltip && (
                    <div className="intel-list-tooltip">
                        <p><strong>Current Position</strong> — sorts and distances based on your GPS location.</p>
                        <p><strong>Map Center</strong> — sorts and distances based on where you last panned the map.</p>
                    </div>
                )}
                <div className="intel-list-toggle-row">
                    <span className="intel-list-toggle-label">Show results on map</span>
                    <button
                        className={`intel-list-toggle-btn${showFiltersOnMap ? " is-on" : ""}`}
                        onClick={() => onShowFiltersOnMapChange(!showFiltersOnMap)}
                        aria-label="Toggle show results on map">
                        <Map size={13} aria-hidden="true" />
                        <span>{showFiltersOnMap ? "On" : "Off"}</span>
                    </button>
                </div>
            </div>

            <div className="intel-list-content">
                { !hasPoints && !position && (
                    <p className="intel-list-empty">Open the Map to load intel.</p>
                )}
                { !hasPoints && position && (
                    <p className="intel-list-empty">No intel found nearby.</p>
                )}
                { hasPoints && sortedFiltered.length === 0 && (
                    <p className="intel-list-empty">No intel matches the current filter.</p>
                )}
                { sortedFiltered.map((point) => {
                    const isUnconfirmed = !point.confirmed;
                    const isPlanned = !!point.planned;
                    const hasPhoto = !!(point.hasImage || point.b64image);
                    const dist = formatDistance(point);
                    return (
                        <button key={point.key} className="intel-list-row" onClick={() => onRowTap(point)}>
                            <span className="intel-list-row-icon">
                                { isUnconfirmed && <AlertTriangle size={18} className="intel-type-icon intel-type-unconfirmed" /> }
                                { !isUnconfirmed && isPlanned && <Notebook size={18} className="intel-type-icon intel-type-planned" /> }
                                { !isUnconfirmed && !isPlanned && <CircleCheck size={18} className="intel-type-icon intel-type-confirmed" /> }
                            </span>
                            <span className="intel-list-row-body">
                                <span className="intel-list-row-desc">
                                    {point.description?.trim() || (hasPhoto ? "(image only)" : "—")}
                                </span>
                                { (dist || formatAge(point)) && (
                                    <span className="intel-list-row-meta">
                                        { dist && <span>{dist}</span> }
                                        { dist && formatAge(point) && <span>·</span> }
                                        { formatAge(point) && <span>{formatAge(point)}</span> }
                                    </span>
                                )}
                            </span>
                            { pinnedKeys?.has(point.key) && (
                                <span className="intel-list-row-pinned"><Pin size={12} /></span>
                            )}
                            <span className={`intel-list-row-photo${hasPhoto ? " has-photo" : ""}`}>
                                <Camera size={15} />
                            </span>
                        </button>
                    );
                })}
            </div>

            { reviewIntelPoint && (
                <ReviewDialog
                    intelPoint={reviewIntelPoint}
                    cryptoKey={cryptoKey}
                    onClose={onCloseReview}
                    onKeep={(p) => { onKeepIntel(p); onCloseReview(); }}
                    onDiscard={(p) => { onDiscardIntel(p); onCloseReview(); }}
                    onExport={(p) => { onExportIntel(p); onCloseReview(); }}
                    onDelete={(p) => { onDeleteConfirmedIntel(p); onCloseReview(); }}
                    onEdit={(p) => { onEditPlannedIntel(p); onCloseReview(); }}
                    onNavigateTo={onNavigateTo}
                    onViewOnMap={(p) => { onViewOnMap?.(p); onCloseReview(); }}
                    isPinned={pinnedKeys?.has(reviewIntelPoint?.key)}
                    onPinToggle={reviewIntelPoint ? () => onPinToggle?.(reviewIntelPoint.geohash, reviewIntelPoint.key) : undefined}
                    onError={onError} />
            )}
        </div>
    );
}
