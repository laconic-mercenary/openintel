import { useState, useRef } from "react";
import { Camera, CheckCircle, Smartphone, Cloud, FileDown } from "lucide-react";
import TagInput from "./TagInput.jsx";
import CameraCapture from "./CameraCapture.jsx";

import "./Intel.css";

export default function Intel({ onIntelReady, onIntelCancel, onSaveToFile, tagSuggestions = [], initialTags = [] }) {

    // Consts

    const descriptionMaxLength = 300;

    // State

    const [description, setDescription] = useState("");
    const [tags, setTags] = useState(initialTags);
    const [userError, setUserError] = useState("");
    const [capturedImage, setCapturedImage] = useState(null);
    const [capturedAt, setCapturedAt] = useState(null);
    const [cameraIsOpen, setCameraIsOpen] = useState(false);

    // References

    const intelReadyRef = useRef(onIntelReady);
    const intelCancelRef = useRef(onIntelCancel);
    const saveToFileRef = useRef(onSaveToFile);

    // Methods

    const onCapture = (b64Image) => {
        setCapturedImage(b64Image);
        setCapturedAt(new Date());
        setCameraIsOpen(false);
    };

    const onSubmit = (saveToCloud) => {
        const trimmedDescription = description.trim();
        if (trimmedDescription.length > descriptionMaxLength) {
            setUserError(`Description must be ${descriptionMaxLength} characters or fewer.`);
            return;
        }
        if (!capturedImage && trimmedDescription.length === 0) {
            setUserError("Add a description or take a photo before submitting.");
            return;
        }
        setUserError("");
        intelReadyRef.current?.(trimmedDescription, capturedImage ?? null, tags, saveToCloud);
    };

    const onCancel = () => {
        intelCancelRef.current?.();
    };

    const onSaveToFileClick = () => {
        const trimmedDescription = description.trim();
        if (!capturedImage && trimmedDescription.length === 0) {
            setUserError("Add a description or take a photo before saving.");
            return;
        }
        setUserError("");
        saveToFileRef.current?.(trimmedDescription, capturedImage ?? null, tags);
    };

    // DOM

    if (cameraIsOpen) {
        return <CameraCapture onCapture={onCapture} onCancel={() => setCameraIsOpen(false)} />;
    }

    return (
        <div className="modal-background">
            <div className="intel-wrapper modal-card">
                <button className="intel-cancel" onClick={onCancel}>X</button>
                <h2 className="intel-title">Get Intel</h2>
                { userError && <div className="intel-error">{userError}</div> }

                <div className="intel-photo-row">
                    <button className="intel-take-photo" onClick={() => setCameraIsOpen(true)}>
                        <Camera size={16} aria-hidden="true" />
                        { capturedImage ? "Retake Photo" : "Take Photo" }
                    </button>
                    { capturedImage && (
                        <span className="intel-photo-confirm">
                            <CheckCircle size={16} className="intel-photo-check" />
                            {capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                </div>

                <TagInput tags={tags} onTagsChange={setTags} suggestions={tagSuggestions} />

                <textarea value={description}
                          id="intel-description"
                          name="intel-description"
                          className="intel-description"
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Add description here (if any)"
                          rows={4} />

                <div className="intel-submit-row">
                    <button className="intel-btn-memory" onClick={() => onSubmit(false)}>
                        <Smartphone size={15} aria-hidden="true" /> Save to Memory
                    </button>
                    <button className="intel-btn-cloud" onClick={() => onSubmit(true)}>
                        <Cloud size={15} aria-hidden="true" /> Save to Cloud
                    </button>
                </div>
                <button className="intel-btn-file" onClick={onSaveToFileClick}>
                    <FileDown size={15} aria-hidden="true" /> Save to File
                </button>
            </div>
        </div>
    );
}
