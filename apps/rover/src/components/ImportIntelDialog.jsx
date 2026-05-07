import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { decryptText } from "../utils/crypto";
import { intelTypeConfirmed, intelTypeUnconfirmed, validateDescription, validateImage, validateTags, validateCoords } from "../utils/validation";
import "./ImportIntelDialog.css";

export default function ImportIntelDialog({ onImport, cryptoKey, onCancel }) {

    // Consts

    const encryptedFormatVersion = 1;

    // State

    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // References

    const fileInputRef = useRef(null);
    const onImportRef = useRef(onImport);
    const onCancelRef = useRef(onCancel);

    // Methods

    const validateIntelFields = (intel) => {
        if (!intel || typeof intel !== "object") return "Invalid intel data.";
        if (typeof intel.timestamp !== "number") return "Missing or invalid timestamp.";
        return validateDescription(intel.description ?? "")
            ?? validateTags(intel.tags ?? [])
            ?? validateImage(intel.image ?? null)
            ?? validateCoords(intel.latitude, intel.longitude);
    };

    const extractIntelPayload = (intel) => {
        const hasLocation = intel.latitude != null && intel.longitude != null;
        return {
            description: intel.description ?? "",
            tags: intel.tags ?? [],
            timestamp: intel.timestamp,
            b64image: intel.image ?? null,
            latitude: hasLocation ? intel.latitude : null,
            longitude: hasLocation ? intel.longitude : null,
            accuracy: hasLocation ? (intel.accuracy ?? null) : null,
            manualLocation: false,
        };
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
            const parsed = JSON.parse(await file.text());
            if (!parsed || typeof parsed !== "object") {
                setError("Invalid file format.");
                return;
            }
            let intel;
            if (typeof parsed.encrypted === "string") {
                if (parsed.version !== encryptedFormatVersion) {
                    setError(`Unsupported file version: ${parsed.version}.`);
                    return;
                }
                try {
                    intel = JSON.parse(await decryptText(cryptoKey, parsed.encrypted));
                } catch (decryptErr) {
                    console.error("failed to decrypt intel export:", decryptErr);
                    setError("Could not decrypt file — it was exported with a different encryption password.");
                    return;
                }
            } else if (parsed.type === intelTypeConfirmed || parsed.type === intelTypeUnconfirmed) {
                intel = parsed;
            } else {
                setError("Unrecognized file format.");
                return;
            }
            const validationError = validateIntelFields(intel);
            if (validationError) {
                setError(validationError);
                return;
            }
            const payload = extractIntelPayload(intel);
            onImportRef.current?.(payload, payload.latitude != null);
        } catch (parseErr) {
            console.error("failed to parse intel import:", parseErr);
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
