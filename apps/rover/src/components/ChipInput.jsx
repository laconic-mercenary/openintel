import { useRef, useState } from "react";
import { classifyChip } from "../utils/filters";
import { isValidTokenChar } from "../utils/validation";
import "./ChipInput.css";

export default function ChipInput({ chips, onChipsChange, placeholder = "Search…" }) {

    // State

    const [inputValue, setInputValue] = useState("");

    // References

    const inputRef = useRef(null);
    const nextIdRef = useRef(1);

    // Methods

    const focusInput = () => inputRef.current?.focus();

    const commitChip = (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const chip = { id: nextIdRef.current++, text: trimmed, type: classifyChip(trimmed) };
        onChipsChange([...chips, chip]);
    };

    const removeChip = (id) => {
        onChipsChange(chips.filter((c) => c.id !== id));
    };

    const onInputChange = (e) => {
        const val = e.target.value;
        if (val.endsWith(" ")) {
            commitChip(val.slice(0, -1));
            setInputValue("");
        } else {
            setInputValue(val.split("").filter(isValidTokenChar).join(""));
        }
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" && inputValue.trim()) {
            commitChip(inputValue);
            setInputValue("");
            e.preventDefault();
        }
        if (e.key === "Backspace" && inputValue === "" && chips.length > 0) {
            onChipsChange(chips.slice(0, -1));
        }
    };

    // DOM

    return (
        <div className="chip-input" onClick={focusInput}>
            { chips.map((chip) => (
                <span key={chip.id} className={`chip chip--${chip.type}`}>
                    <span className="chip-text">{chip.text}</span>
                    <button className="chip-remove" onClick={(e) => { e.stopPropagation(); removeChip(chip.id); }} aria-label="Remove">✕</button>
                </span>
            ))}
            <input
                ref={inputRef}
                className="chip-input-field"
                value={inputValue}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder={chips.length === 0 ? placeholder : ""}
                maxLength={100}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false} />
        </div>
    );
}
