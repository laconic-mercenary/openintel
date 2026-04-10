import { useState, useRef } from "react";
import "./TagInput.css";

export default function TagInput({ tags, onTagsChange, suggestions = [] }) {

    const [inputValue, setInputValue] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [validationError, setValidationError] = useState("");
    const inputRef = useRef(null);

    const filtered = inputValue.trim().length === 0
        ? suggestions.filter((s) => !tags.includes(s)).slice(0, 10)
        : suggestions.filter((s) => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s));

    const maxTagLength = 30;
    const isValidTag = (tag) => /^[a-z0-9_-]+$/.test(tag);

    const addTag = (tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed || tags.includes(trimmed)) return;
        if (trimmed.length > maxTagLength) {
            setValidationError(`Tags must be ${maxTagLength} characters or fewer.`);
            return;
        }
        if (!isValidTag(trimmed)) {
            setValidationError("Tags may only contain letters, numbers, hyphens, and underscores.");
            return;
        }
        setValidationError("");
        onTagsChange([...tags, trimmed]);
        setInputValue("");
        setDropdownOpen(false);
        inputRef.current?.focus();
    };

    const removeTag = (tag) => {
        onTagsChange(tags.filter((t) => t !== tag));
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Tab") {
            if (inputValue.trim()) {
                e.preventDefault();
                addTag(inputValue);
            }
        }
        if (e.key === "Backspace" && inputValue === "") {
            onTagsChange(tags.slice(0, -1));
        }
    };

    const onBlur = () => {
        setTimeout(() => setDropdownOpen(false), 150);
        if (inputValue.trim()) addTag(inputValue);
    };

    return (
        <div className="tag-input-wrapper" onClick={() => inputRef.current?.focus()}>
            <div className={`tag-input-pills${validationError ? " tag-input-pills-error" : ""}`}>
                {tags.map((tag) => (
                    <span key={tag} className={`tag-pill ${suggestions.includes(tag) ? "tag-pill-existing" : "tag-pill-new"}`}>
                        {tag}
                        <button className="tag-pill-remove"
                                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                                aria-label={`Remove ${tag}`}>✕</button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    className="tag-input-field"
                    value={inputValue}
                    placeholder={tags.length === 0 ? "Add tags…" : ""}
                    onChange={(e) => { setInputValue(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    autoCapitalize="none"
                    autoCorrect="off"
                />
            </div>
            {validationError && <p className="tag-input-error">{validationError}</p>}
            {dropdownOpen && filtered.length > 0 && (
                <ul className="tag-input-dropdown">
                    {filtered.map((s) => (
                        <li key={s}
                            className="tag-input-dropdown-item"
                            onMouseDown={() => addTag(s)}>
                            {s}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
