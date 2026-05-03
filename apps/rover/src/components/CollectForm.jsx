import { useEffect, useRef, useState } from "react";
import { Camera, Cloud, CloudOff, EyeOff, Lock, Save } from "lucide-react";
import TagInput from "./TagInput.jsx";
import CameraCapture from "./CameraCapture.jsx";
import "./CollectForm.css";

// Consts

const secretTag = "secret";
const descriptionMaxLen = 300;
const successDismissMs = 3000;

export default function CollectForm({ mode, onIntelReady, onClose, tagSuggestions = [], saveToCloudDefault = true, clearSignal = 0 }) {

    // State

    const [description, setDescription] = useState("");
    const [tags, setTags] = useState([]);
    const [saveToCloud, setSaveToCloud] = useState(saveToCloudDefault);
    const [secret, setSecret] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [userError, setUserError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);

    // References

    const pendingActionRef = useRef(null);
    const successTimerRef = useRef(null);

    // Effects

    useEffect(() => {
        if (clearSignal === 0) return;
        setDescription('');
        setCapturedImage(null);
        setSecret(false);
        setUserError(null);
    }, [clearSignal]);

    // Methods

    const buildTags = () => {
        const base = tags.filter((t) => t !== secretTag);
        return secret ? [...base, secretTag] : base;
    };

    const resetForm = () => {
        setDescription("");
        setCapturedImage(null);
        setSecret(false);
        setUserError(null);
    };

    const showSuccessBanner = () => {
        setShowSuccess(true);
        clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setShowSuccess(false), successDismissMs);
    };

    const submit = (b64Image, action) => {
        const trimmed = description.trim();
        if (!trimmed && !b64Image) {
            setUserError("Add a description or take a photo before saving.");
            return;
        }
        if (trimmed.length > descriptionMaxLen) {
            setUserError(`Description must be ${descriptionMaxLen} characters or fewer.`);
            return;
        }
        setUserError(null);
        onIntelReady(trimmed, b64Image ?? null, buildTags(), saveToCloud);
        resetForm();
        if (mode === "modal") {
            onClose?.();
            return;
        }
        showSuccessBanner();
    };

    const onSavePhotoClick = () => {
        pendingActionRef.current = "save";
        setCameraOpen(true);
    };

    const onSaveClick = () => {
        submit(capturedImage, "save");
    };

    const onCaptureComplete = (b64Image) => {
        setCapturedImage(b64Image);
        setCameraOpen(false);
        submit(b64Image, pendingActionRef.current);
        pendingActionRef.current = null;
    };

    const onCameraCancel = () => {
        setCameraOpen(false);
        pendingActionRef.current = null;
    };

    // DOM

    if (cameraOpen) {
        return <CameraCapture onCapture={onCaptureComplete} onCancel={onCameraCancel} />;
    }

    const formContent = (
        <div className="collect-form">
            { mode === "page" && showSuccess && (
                <div className="collect-banner collect-banner--success">Intel saved.</div>
            )}
            { userError && (
                <div className="collect-banner collect-banner--error">{userError}</div>
            )}

            <TagInput tags={tags} onTagsChange={setTags} suggestions={tagSuggestions} />

            <div className="collect-toggles">
                <div className="collect-toggle-row">
                    <span className="collect-toggle-label">Save to Cloud</span>
                    <button
                        className={`collect-toggle-btn${saveToCloud ? " is-on" : ""}`}
                        onClick={() => setSaveToCloud((prev) => !prev)}>
                        { saveToCloud ? <Cloud size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" /> }
                        <span>{saveToCloud ? "On" : "Off"}</span>
                    </button>
                </div>
                <div className="collect-toggle-row">
                    <span className="collect-toggle-label">Secret</span>
                    <button
                        className={`collect-toggle-btn${secret ? " is-on" : ""}`}
                        onClick={() => setSecret((prev) => !prev)}>
                        { secret ? <Lock size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" /> }
                        <span>{secret ? "On" : "Off"}</span>
                    </button>
                </div>
            </div>

            <textarea
                className="collect-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={4}
                maxLength={descriptionMaxLen} />

            <div className="collect-actions">
                <button className="collect-btn collect-btn--save" onClick={onSaveClick}>
                    <Save size={16} aria-hidden="true" /> Save
                </button>
                <button className="collect-btn collect-btn--photo" onClick={onSavePhotoClick}>
                    <Camera size={16} aria-hidden="true" /> Photo + Save
                </button>
                <div className="collect-actions-separator" />
                <button className="collect-btn collect-btn--clear" onClick={resetForm}>
                    Clear
                </button>
            </div>
        </div>
    );

    if (mode === "modal") {
        return (
            <div className="collect-modal-overlay" onClick={onClose}>
                <div className="collect-modal-card" onClick={(e) => e.stopPropagation()}>
                    <button className="collect-modal-close" type="button" onClick={onClose}>✕</button>
                    <h3 className="collect-modal-title">Collect Intel</h3>
                    {formContent}
                </div>
            </div>
        );
    }

    return (
        <div className="collect-page">
            {formContent}
        </div>
    );
}
