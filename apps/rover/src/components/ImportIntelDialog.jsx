import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { decryptText } from "../utils/crypto";
import "./ImportIntelDialog.css";

export default function ImportIntelDialog({ onImport, cryptoKey, onCancel }) {

    // Consts

    const maxImageBytes = 10 * 1024 * 1024;
    const supportedVersion = 1;

    // State

    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // References

    const fileInputRef = useRef(null);
    const onImportRef = useRef(onImport);
    const onCancelRef = useRef(onCancel);

    // Methods

    const validateOuter = (parsed) => {
        if (!parsed || typeof parsed !== "object") return "Invalid file format.";
        if (parsed.version !== supportedVersion) return `Unsupported file version: ${parsed.version}.`;
        if (typeof parsed.encrypted !== "string") return "Missing encrypted payload.";
        return null;
    };

    const validateInner = (intel) => {
        if (!intel || typeof intel !== "object") return "Invalid intel data.";
        if (typeof intel.description !== "string") return "Missing or invalid description.";
        if (!Array.isArray(intel.tags)) return "Missing or invalid tags.";
        if (typeof intel.timestamp !== "number") return "Missing or invalid timestamp.";
        if (intel.image !== null && typeof intel.image !== "string") return "Invalid image data.";
        if (intel.image) {
            const bytes = (intel.image.length * 3) / 4;
            if (bytes > maxImageBytes) return "Image exceeds maximum size of 10 MB.";
        }
        return null;
    };

    const onFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
            console.warn("onFileChange: no file selected");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const outerError = validateOuter(parsed);
            if (outerError) {
                setError(outerError);
                return;
            }
            let intel;
            try {
                const decrypted = await decryptText(cryptoKey, parsed.encrypted);
                intel = JSON.parse(decrypted);
            } catch (decryptErr) {
                console.error("failed to decrypt intel export:", decryptErr);
                setError("Could not decrypt file — it was exported with a different encryption password.");
                return;
            }
            const innerError = validateInner(intel);
            if (innerError) {
                setError(innerError);
                return;
            }
            const hasLocation = intel.latitude !== null && intel.latitude !== undefined
                && intel.longitude !== null && intel.longitude !== undefined;
            onImportRef.current?.({
                description: intel.description,
                tags: intel.tags,
                timestamp: intel.timestamp,
                b64image: intel.image ?? null,
                latitude: hasLocation ? intel.latitude : null,
                longitude: hasLocation ? intel.longitude : null,
                accuracy: hasLocation ? intel.accuracy : null,
                manualLocation: false,
            }, hasLocation);
        } catch (parseErr) {
            console.error(parseErr);
            setError("Could not read file — make sure it is a valid Intel JSON file.");
        } finally {
            setLoading(false);
        }
    };

    const onUploadClick = () => {
        fileInputRef.current?.click();
    };

    // DOM

    return (
        <div className="modal-background">
            <div className="import-intel-panel modal-card">
                <button className="intel-cancel" onClick={() => onCancelRef.current?.()}>X</button>
                <h2 className="intel-title">Import Intel</h2>
                <p className="import-intel-body">
                    Select a JSON file previously exported from openintel. If the file has no location, you will be able to place it on the map manually.
                </p>
                {error && <p className="import-intel-error">{error}</p>}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="import-intel-file-input"
                    onChange={onFileChange}
                />
                <button className="import-intel-upload" onClick={onUploadClick} disabled={loading}>
                    <Upload size={15} aria-hidden="true" /> {loading ? "Reading…" : "Choose File"}
                </button>
            </div>
        </div>
    );
}
