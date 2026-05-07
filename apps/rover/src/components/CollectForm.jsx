import { useEffect, useRef, useState } from "react";
import { Camera, Cloud, CloudOff, EyeOff, HelpCircle, Lock, Save } from "lucide-react";
import { descriptionMaxLen as descriptionMaxLenConst } from "../utils/validation";
import TagInput from "./TagInput.jsx";
import CameraCapture from "./CameraCapture.jsx";
import "./CollectForm.css";

// Consts

const secretTag = "secret";
const descriptionMaxLen = descriptionMaxLenConst;
const successDismissMs = 3000;

const tips = [
    { heading: "Photo only", body: "Tap Photo + Save without entering a description — your location is recorded automatically." },
    { heading: "Text only", body: "Type a description and tap Save — no photo required." },
    { heading: "Projects via tags", body: "Add a shared tag (e.g. \"op-atlas\") to group related intel points into a project." },
    { heading: "Tag suggestions", body: "The dropdown shows tags from intel currently loaded in your map view. Tags from out-of-range intel won't appear — just type them directly." },
    { heading: "Secret tag", body: "Intel tagged Secret is hidden from the map and the Intel list, keeping it out of the normal view." },
];

export default function CollectForm({ mode, onIntelReady, onClose, tagSuggestions = [], initialTags = [], saveToCloudDefault = true, clearSignal = 0 }) {

    // State

    const [description, setDescription] = useState("");
    const [tags, setTags] = useState(initialTags);
    const [saveToCloud, setSaveToCloud] = useState(saveToCloudDefault);
    const [secret, setSecret] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [userError, setUserError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showTips, setShowTips] = useState(false);

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
            { showTips && (
                <div className="collect-tips-overlay" onClick={() => setShowTips(false)}>
                    <div className="collect-tips-card" onClick={(e) => e.stopPropagation()}>
                        <button className="collect-tips-close" onClick={() => setShowTips(false)}>✕</button>
                        <h3 className="collect-tips-title">Tips</h3>
                        <ul className="collect-tips-list">
                            { tips.map((tip) => (
                                <li key={tip.heading} className="collect-tips-item">
                                    <span className="collect-tips-heading">{tip.heading}</span>
                                    <span className="collect-tips-body">{tip.body}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
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
                <div className="collect-actions-bottom">
                    <button className="collect-btn collect-btn--clear" onClick={resetForm}>
                        Clear
                    </button>
                    <button className="collect-tips-btn" onClick={() => setShowTips(true)} aria-label="Show tips"><HelpCircle size={18} aria-hidden="true" /></button>
                </div>
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
