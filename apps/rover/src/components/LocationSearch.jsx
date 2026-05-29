import { useState, useEffect, useRef } from "react";
import "./LocationSearch.css";

// Consts

const debounceMs = 600;
const resultLimit = 6;
const minQueryLength = 2;

// Functions

const resultLabel = (feature) => {
    return feature.place_name || feature.place_name_ja || feature.text || "Unnamed location";
};

const fetchSuggestions = async (query, proximity) => {
    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
    if (!apiKey) throw new Error("MapTiler API key is not configured.");
    const params = new URLSearchParams({
        key: apiKey,
        limit: String(resultLimit),
        language: "ja,en",
    });
    if (proximity?.lon != null && proximity?.lat != null) {
        params.set("proximity", `${proximity.lon},${proximity.lat}`);
    }
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`;
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`geocoding returned ${response.status}`);
    const data = await response.json();
    return data.features ?? [];
};

export default function LocationSearch({ onResult, onCancel, proximity }) {

    // State

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // References

    const onResultRef = useRef(onResult);
    const onCancelRef = useRef(onCancel);
    const proximityRef = useRef(proximity);
    const debounceTimer = useRef(null);

    // Effects

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => {
        onCancelRef.current = onCancel;
    }, [onCancel]);

    useEffect(() => {
        proximityRef.current = proximity;
    }, [proximity]);

    useEffect(() => {
        const trimmed = query.trim();
        setResults([]);
        setError(null);

        if (trimmed.length < minQueryLength) {
            setLoading(false);
            return;
        }

        setLoading(true);
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            try {
                const data = await fetchSuggestions(trimmed, proximityRef.current);
                setResults(data);
                if (!data.length) setError("No results found.");
            } catch (fetchErr) {
                console.error(fetchErr);
                setError("Search failed. Check your connection or map key.");
            } finally {
                setLoading(false);
            }
        }, debounceMs);

        return () => clearTimeout(debounceTimer.current);
    }, [query]);

    const onSelect = (result) => {
        const [lon, lat] = result.center ?? result.geometry?.coordinates ?? [];
        if (lat == null || lon == null) {
            setError("Selected result has no coordinates.");
            return;
        }
        onResultRef.current?.({ lat, lon, label: resultLabel(result) });
    };

    // DOM

    return (
        <div className="modal-background">
            <div className="loc-search-panel modal-card">
                <button className="intel-cancel" onClick={() => onCancelRef.current?.()}>X</button>
                <h2 className="intel-title">Search Location</h2>
                <input
                    className="loc-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="City, address, or landmark"
                    autoFocus
                />
                {loading && <p className="loc-search-status">Searching…</p>}
                {error && <p className="loc-search-status loc-search-error">{error}</p>}
                {results.length > 0 && (
                    <ul className="loc-search-results">
                        {results.map((r) => (
                            <li key={r.id}>
                                <button className="loc-search-result-btn" onClick={() => onSelect(r)}>
                                    {resultLabel(r)}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
