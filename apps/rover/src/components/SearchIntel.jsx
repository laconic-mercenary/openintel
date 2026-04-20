import { useState, useRef } from "react";
import { Search } from "lucide-react";
import TagInput from "./TagInput.jsx";
import "./SearchIntel.css";

// methods

export default function SearchIntel({ filterTags, allTags, onTagsChange, onTextSearch, onClose }) {

    // State

    const [text, setText] = useState("");

    // References

    const onCloseRef = useRef(onClose);
    const onTextSearchRef = useRef(onTextSearch);

    // Methods

    const onSubmit = (e) => {
        e.preventDefault();
        onTextSearchRef.current?.(text.trim());
    };

    // DOM

    return (
        <div className="modal-background">
            <div className="search-intel-panel modal-card">
                <button className="intel-cancel" onClick={() => onCloseRef.current?.()}>X</button>
                <h2 className="intel-title">Search Intel</h2>

                <p className="search-intel-label">Filter by Tags</p>
                <p className="search-intel-hint">No tags selected shows all intel except secret. Multiple tags use OR logic.</p>
                <TagInput tags={filterTags} onTagsChange={onTagsChange} suggestions={allTags} />

                <form className="search-intel-text-form" onSubmit={onSubmit}>
                    <p className="search-intel-label">Text Search</p>
                    <p className="search-intel-hint">Searches descriptions and tags. Submit closes this dialog.</p>
                    <input
                        className="search-intel-text-input"
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Search descriptions and tags…"
                    />
                    <button type="submit" className="search-intel-submit">
                        <Search size={15} aria-hidden="true" /> Search
                    </button>
                </form>
            </div>
        </div>
    );
}
