import { useState, useEffect, useRef } from "react";
import "./LocationSearch.css";

// consts and globals

const debounceMs = 600;
const nominatimLimit = 5;

// functions

const fetchSuggestions = async (query) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${nominatimLimit}`;
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`nominatim returned ${response.status}`);
    return response.json();
};

// methods

export default function LocationSearch({ onResult, onCancel }) {

    // State

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // References

    const onResultRef = useRef(onResult);
    const onCancelRef = useRef(onCancel);
    const debounceTimer = useRef(null);

    // Effects

    useEffect(() => {
        const trimmed = query.trim();
        setResults([]);
        setError(null);

        if (!trimmed) {
            setLoading(false);
            return;
        }

        setLoading(true);
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            try {
                const data = await fetchSuggestions(trimmed);
                setResults(data);
                if (!data.length) setError("No results found.");
            } catch (fetchErr) {
                console.error(fetchErr);
                setError("Search failed. Check your connection.");
            } finally {
                setLoading(false);
            }
        }, debounceMs);

        return () => clearTimeout(debounceTimer.current);
    }, [query]);

    const onSelect = (result) => {
        onResultRef.current?.({ lat: parseFloat(result.lat), lon: parseFloat(result.lon) });
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
                            <li key={r.place_id}>
                                <button className="loc-search-result-btn" onClick={() => onSelect(r)}>
                                    {r.display_name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
