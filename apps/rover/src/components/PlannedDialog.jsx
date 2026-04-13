import { useState } from "react";
import TagInput from "./TagInput.jsx";
import "./PlannedDialog.css";

export default function PlannedDialog({ mode, intelPoint, tagSuggestions = [], initialTags = [], onSave, onCancel, onDelete }) {

    // Consts

    const descriptionMaxLength = 300;

    // State

    const [description, setDescription] = useState(intelPoint?.description ?? "");
    const [tags, setTags] = useState(initialTags);
    const [userError, setUserError] = useState("");

    // Methods

    const onSubmit = () => {
        const trimmedDescription = description.trim();
        if (trimmedDescription.length > descriptionMaxLength) {
            setUserError(`Description must be ${descriptionMaxLength} characters or fewer.`);
            return;
        }
        setUserError("");
        onSave(trimmedDescription, tags);
    };

    // DOM

    return (
        <div className="modal-background">
            <div className="planned-dialog modal-card">
                <button className="planned-cancel" onClick={onCancel}>X</button>
                <h2 className="planned-title">{mode === "edit" ? "Edit Note" : "Add Note"}</h2>
                { userError && <div className="planned-error">{userError}</div> }

                <TagInput tags={tags} onTagsChange={setTags} suggestions={tagSuggestions} />

                <textarea value={description}
                          id="planned-description"
                          name="planned-description"
                          className="planned-description"
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Add description here (if any)"
                          rows={4} />

                <button className="planned-save" onClick={onSubmit}>Save</button>
                { mode === "edit" && onDelete && (
                    <button className="planned-delete" onClick={onDelete}>Delete</button>
                )}
            </div>
        </div>
    );
}
