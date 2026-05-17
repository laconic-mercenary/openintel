import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { decryptText, encryptText, encryptBytes } from "../utils/crypto";
import { storeIntel, uploadIntelImage, addComment } from "../utils/api";
import { coordsToGeohash5 } from "../utils/geo";
import { intelTypeConfirmed, intelTypeUnconfirmed, intelTypePlanned, validateDescription, validateImage, validateTags, validateCoords } from "../utils/validation";
import "./ImportIntelDialog.css";

export default function ImportIntelDialog({ onImport, onMassImportComplete, cryptoKey, intelPoints, onCancel }) {

    // Consts

    const encryptedFormatVersion = 1;
    const massFormatVersion = 1;
    const maxItemsPerFile = 500;
    const maxImagesPerFile = 50;

    // State

    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [massProgress, setMassProgress] = useState(null);

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

    const validateMassItem = (item) => {
        if (!item || typeof item !== "object") return "Invalid item.";
        if (typeof item.timestamp !== "number" || !Number.isFinite(item.timestamp) || item.timestamp <= 0)
            return "Invalid timestamp.";
        if (item.latitude == null || item.longitude == null) return "Coordinates are required.";
        if (item.accuracy !== undefined && item.accuracy !== null &&
            (typeof item.accuracy !== "number" || !Number.isFinite(item.accuracy)))
            return "Invalid accuracy.";
        if (item.planned !== undefined && typeof item.planned !== "boolean") return "Invalid planned flag.";
        if (item.b64image !== undefined && item.b64image !== null && typeof item.b64image !== "string")
            return "Invalid image data.";
        return validateDescription(item.description ?? "")
            ?? validateTags(item.tags ?? [])
            ?? validateCoords(item.latitude, item.longitude);
    };

    const extractSinglePayload = (intel) => {
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

    const importMassItem = async (item, existingTimestamps) => {
        if (existingTimestamps.has(item.timestamp)) return 'skipped';

        // RowKey format is {obfuscatedTs}-{uuid} — strip the prefix so the server re-derives the same R2 image key
        const intelKey = item.key?.replace(/^\d+-/, '') ?? crypto.randomUUID();
        const geohash = coordsToGeohash5(item.latitude, item.longitude);
        const payload = JSON.stringify({
            lat: item.latitude,
            lon: item.longitude,
            accuracy: item.accuracy ?? 0,
            description: item.description ?? '',
            timestamp: item.timestamp,
            tags: item.tags ?? [],
            ...(item.planned ? { type: intelTypePlanned } : {}),
        });
        const encryptedPayload = await encryptText(cryptoKey, payload);

        const { key: storedRowKey, presignedPutUrl } = await storeIntel({
            key: intelKey,
            geohash,
            encryptedPayload,
            hasImage: !!item.b64image,
            timestamp: item.timestamp,
        });

        if (item.b64image && presignedPutUrl) {
            const binary = atob(item.b64image);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const encrypted = await encryptBytes(cryptoKey, bytes.buffer);
            await uploadIntelImage(presignedPutUrl, encrypted);
        }

        if (item.comments?.length > 0) {
            for (const comment of item.comments) {
                try {
                    const encryptedText = await encryptText(cryptoKey, comment.text);
                    await addComment({ key: storedRowKey, geohash }, encryptedText);
                } catch (commentErr) {
                    console.warn('import: failed to post comment', comment.rowKey, commentErr);
                }
            }
        }

        existingTimestamps.add(item.timestamp);
        return 'imported';
    };

    const processMassFiles = async (files) => {
        const parsed = [];
        let totalItems = 0;

        for (const file of files) {
            try {
                const data = JSON.parse(await file.text());
                if (data.version !== massFormatVersion || !Array.isArray(data.items)) {
                    setError(`"${file.name}" is not a valid mass export file.`);
                    setLoading(false);
                    return;
                }
                parsed.push(data);
                totalItems += data.items.length;
            } catch {
                setError(`Could not read "${file.name}".`);
                setLoading(false);
                return;
            }
        }

        const existingTimestamps = new Set((intelPoints ?? []).map((p) => p.timestamp));
        let imported = 0, skipped = 0, failed = 0, processed = 0;
        setMassProgress({ processed: 0, total: totalItems, imported: 0, skipped: 0, failed: 0 });

        for (const data of parsed) {
            for (const item of data.items) {
                const validationError = validateIntelFields(item);
                if (validationError) {
                    failed++;
                } else {
                    try {
                        const result = await importMassItem(item, existingTimestamps);
                        if (result === 'skipped') skipped++;
                        else imported++;
                    } catch (itemErr) {
                        console.error('mass import item failed:', itemErr);
                        failed++;
                    }
                }
                processed++;
                setMassProgress({ processed, total: totalItems, imported, skipped, failed });
            }
        }

        setMassProgress(null);
        setLoading(false);
        onMassImportComplete?.(imported, skipped, failed);
    };

    const onFileChange = async (e) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        setLoading(true);
        setError(null);

        try {
            const firstParsed = JSON.parse(await files[0].text());

            if (Array.isArray(firstParsed.items)) {
                await processMassFiles(files);
                return;
            }

            if (files.length > 1) {
                setError("Multiple files are only supported for mass export format.");
                return;
            }

            let intel;
            if (typeof firstParsed.encrypted === "string") {
                if (firstParsed.version !== encryptedFormatVersion) {
                    setError(`Unsupported file version: ${firstParsed.version}.`);
                    return;
                }
                try {
                    intel = JSON.parse(await decryptText(cryptoKey, firstParsed.encrypted));
                } catch {
                    setError("Could not decrypt — exported with a different encryption password.");
                    return;
                }
            } else if (firstParsed.type === intelTypeConfirmed || firstParsed.type === intelTypeUnconfirmed) {
                intel = firstParsed;
            } else {
                setError("Unrecognized file format.");
                return;
            }

            const validationError = validateIntelFields(intel);
            if (validationError) {
                setError(validationError);
                return;
            }

            const payload = extractSinglePayload(intel);
            onImportRef.current?.(payload, payload.latitude != null);
        } catch (parseErr) {
            console.error("failed to parse intel import:", parseErr);
            setError("Could not read file — make sure it is a valid Intel JSON file.");
        } finally {
            setLoading(false);
        }
    };

    const onUploadClick = () => fileInputRef.current?.click();

    // DOM

    return (
        <div className="modal-background">
            <div className="import-intel-panel modal-card">
                <button className="intel-cancel" onClick={() => onCancelRef.current?.()}>X</button>
                <h2 className="intel-title">Import Intel</h2>

                { massProgress ? (
                    <>
                        <p className="import-intel-body">Importing {massProgress.processed} of {massProgress.total} items…</p>
                        <div className="import-intel-progress-track">
                            <div
                                className="import-intel-progress-fill"
                                style={{ width: `${massProgress.total > 0 ? Math.round((massProgress.processed / massProgress.total) * 100) : 0}%` }} />
                        </div>
                        <p className="import-intel-progress-counts">
                            {massProgress.imported} saved · {massProgress.skipped} skipped · {massProgress.failed} failed
                        </p>
                        <p className="import-intel-body">Keep this tab open until complete.</p>
                    </>
                ) : (
                    <>
                        <p className="import-intel-body">
                            Select a JSON file exported from openintel. For mass exports, select all files from the same export session at once.
                        </p>
                        {error && <p className="import-intel-error">{error}</p>}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json"
                            multiple
                            className="import-intel-file-input"
                            onChange={onFileChange}
                        />
                        <button className="import-intel-upload" onClick={onUploadClick} disabled={loading}>
                            <Upload size={15} aria-hidden="true" /> {loading ? "Reading…" : "Choose File(s)"}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
