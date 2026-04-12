import { useState, useRef } from "react";
import { Camera, CameraOff, CheckCircle } from "lucide-react";
import TagInput from "./TagInput.jsx";
import CameraCapture from "./CameraCapture.jsx";

import "./Intel.css";

export default function Intel({ onIntelReady, onIntelCancel, tagSuggestions = [], initialTags = [] }) {

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

    // Methods

    const onCapture = (b64Image) => {
        setCapturedImage(b64Image);
        setCapturedAt(new Date());
        setCameraIsOpen(false);
    };

    const onSubmit = () => {
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
        intelReadyRef.current?.(trimmedDescription, capturedImage ?? null, tags);
    };

    const onCancel = () => {
        intelCancelRef.current?.();
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

                <button className="intel-submit-w-photo" onClick={onSubmit}>
                    <span className="intel-submit-label">
                        { capturedImage
                            ? <><Camera size={16} aria-hidden="true" /> Submit With Photo</>
                            : <><CameraOff size={16} aria-hidden="true" /> Submit Without Photo</>
                        }
                    </span>
                </button>
            </div>
        </div>
    );
}
