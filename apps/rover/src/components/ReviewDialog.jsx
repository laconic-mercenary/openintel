import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pin } from "lucide-react";
import { getIntelDetails } from "../utils/api";
import { decryptBytes } from "../utils/crypto";
import CommentsDialog from "./CommentsDialog.jsx";
import "./ReviewDialog.css";

export default function ReviewDialog({ intelPoint, cryptoKey, onClose, onKeep, onDiscard, onExport, onDelete, onEdit, onViewOnMap, onNavigateTo, onError, isPinned, onPinToggle }) {

    // Consts

    const exportImageMimeType = "image/jpeg";
    const exportJsonMimeType = "application/json";
    const exportStatePreparing = "preparing";

    // State

    const [imageUrl, setImageUrl] = useState(null);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [deleteConfirming, setDeleteConfirming] = useState(false);
    const [exportState, setExportState] = useState(null);

    // References

    const blobUrlRef = useRef(null);
    const exportBlobUrlRef = useRef(null);

    // Effects

    useEffect(() => {
        setDeleteConfirming(false);
        setCommentsOpen(false);
        setImageUrl(null);
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        setExportState(null);
        if (exportBlobUrlRef.current) {
            URL.revokeObjectURL(exportBlobUrlRef.current);
            exportBlobUrlRef.current = null;
        }
        if (intelPoint.b64image) {
            setImageUrl(intelPoint.b64image);
            return;
        }
        if (!intelPoint?.hasImage) return;
        let cancelled = false;
        getIntelDetails(intelPoint)
            .then(({ url }) => fetch(url))
            .then((response) => response.arrayBuffer())
            .then((encryptedBuffer) => decryptBytes(cryptoKey, encryptedBuffer))
            .then((plaintextBuffer) => {
                if (cancelled) return;
                if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                const blobUrl = URL.createObjectURL(new Blob([plaintextBuffer], { type: "image/jpeg" }));
                blobUrlRef.current = blobUrl;
                setImageUrl(blobUrl);
            })
            .catch((imageErr) => {
                if (!cancelled) {
                    console.error("failed to load intel image:", imageErr);
                    onError?.("Failed to load image — please try again.");
                }
            });
        return () => { cancelled = true; };
    }, [intelPoint?.key]);

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            if (exportBlobUrlRef.current) {
                URL.revokeObjectURL(exportBlobUrlRef.current);
                exportBlobUrlRef.current = null;
            }
        };
    }, []);

    // Methods

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return "Unknown";
        const d = new Date(timestamp);
        return isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
    };

    const buildExportData = (imageBase64) => ({
        type: intelPoint.planned ? 'planned' : intelPoint.confirmed ? 'confirmed' : 'unconfirmed',
        description: intelPoint.description ?? '',
        tags: intelPoint.tags ?? [],
        latitude: intelPoint.latitude,
        longitude: intelPoint.longitude,
        accuracy: intelPoint.accuracy,
        timestamp: intelPoint.timestamp,
        image: imageBase64 ?? null,
    });

    const triggerDownload = (imageBase64) => {
        const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(buildExportData(imageBase64), null, 2)], { type: exportJsonMimeType }));
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `intel-${intelPoint.timestamp ?? Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(blobUrl);
    };

    const fetchAndPrepare = async () => {
        try {
            const presignedUrl = await getIntelImageUrl(intelPoint);
            const encryptedBuffer = await fetch(presignedUrl).then((r) => r.arrayBuffer());
            const plaintextBuffer = await decryptBytes(cryptoKey, encryptedBuffer);
            const bytes = new Uint8Array(plaintextBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const imageBase64 = `data:${exportImageMimeType};base64,` + btoa(binary);
            const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(buildExportData(imageBase64), null, 2)], { type: exportJsonMimeType }));
            exportBlobUrlRef.current = blobUrl;
            setExportState({ blobUrl, filename: `intel-${intelPoint.timestamp ?? Date.now()}.json` });
        } catch (exportErr) {
            console.error('export preparation failed:', exportErr);
            setExportState(null);
            onError?.('Export failed — please try again.');
        }
    };

    const onExportClick = () => {
        const needsR2Fetch = !!intelPoint.hasImage && !intelPoint.b64image;
        if (needsR2Fetch) {
            setExportState(exportStatePreparing);
            fetchAndPrepare();
        } else {
            triggerDownload(intelPoint.b64image ?? null);
        }
    };

    const onDownloadReady = () => {
        if (!exportState?.blobUrl) return;
        const a = document.createElement('a');
        a.href = exportState.blobUrl;
        a.download = exportState.filename;
        a.click();
        URL.revokeObjectURL(exportState.blobUrl);
        exportBlobUrlRef.current = null;
        setExportState(null);
    };

    const onDeleteClick = () => {
        setDeleteConfirming(true);
    };

    const onDeleteConfirm = () => {
        onDelete?.(intelPoint);
        onClose?.();
    };

    // DOM

    if (!intelPoint) return null;

    const isUnconfirmed = !intelPoint.confirmed;
    const isPlanned = !!intelPoint.planned;
    const isConfirmed = intelPoint.confirmed && !intelPoint.planned;

    const title = isPlanned ? "Note" : "Intel";

    return (
        <div className="review-overlay" onClick={onClose}>
            <div className="review-dialog" onClick={(e) => e.stopPropagation()}>
                <button className="review-close" type="button" onClick={onClose}>✕</button>

                { isUnconfirmed && (
                    <p className="review-unsaved-badge">Unsaved</p>
                )}

                { !isPlanned && (
                    imageUrl ? (
                        <img className="review-image" src={imageUrl} alt="Captured intel" />
                    ) : intelPoint.hasImage ? (
                        <div className="review-image-loading" />
                    ) : (
                        <div className="review-no-image">No image attached</div>
                    )
                )}

                <p className="review-description">
                    {intelPoint.description || "No description provided."}
                </p>
                <p className="review-meta">{formatTimestamp(intelPoint.timestamp)}</p>

                { intelPoint.tags?.length > 0 && (
                    <div className="review-tags">
                        { intelPoint.tags.map((tag) => (
                            <span key={tag} className="review-tag">{tag}</span>
                        ))}
                    </div>
                )}

                { deleteConfirming ? (
                    <div className="review-delete-confirm">
                        <p className="review-delete-confirm-msg">Delete this {title.toLowerCase()}?</p>
                        <div className="review-delete-confirm-actions">
                            <button className="review-btn review-btn-danger" onClick={onDeleteConfirm}>Yes, delete</button>
                            <button className="review-btn review-btn-secondary" onClick={() => setDeleteConfirming(false)}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="review-actions">
                        { isUnconfirmed && (
                            <>
                                <button className="review-btn review-btn-primary" onClick={() => { onKeep?.(intelPoint); onClose?.(); }}>Save to Cloud</button>
                                <button className="review-btn review-btn-danger" onClick={() => { onDiscard?.(intelPoint); onClose?.(); }}>Discard</button>
                            </>
                        )}
                        { isPlanned && (
                            <button className="review-btn review-btn-secondary" onClick={() => { onEdit?.(intelPoint); onClose?.(); }}>Edit</button>
                        )}
                        { (isConfirmed || isPlanned) && (
                            <button className="review-btn review-btn-danger" onClick={onDeleteClick}>Delete</button>
                        )}
                        { isConfirmed && (
                            <button className="review-btn review-btn-secondary" onClick={() => setCommentsOpen(true)}>Notes</button>
                        )}
                        { onNavigateTo && isConfirmed && (
                            <button className="review-btn review-btn-secondary" onClick={() => { onNavigateTo(intelPoint); onClose?.(); }}>Navigate</button>
                        )}
                        { (isConfirmed || isPlanned) && onPinToggle && (
                            <button
                                className={`review-btn ${isPinned ? "review-btn-pinned" : "review-btn-secondary"}`}
                                onClick={onPinToggle}>
                                <Pin size={13} aria-hidden="true" />
                                {isPinned ? "Pinned" : "Pin"}
                            </button>
                        )}
                        { !isPlanned && (
                            exportState === exportStatePreparing ? (
                                <button className="review-btn review-btn-secondary" disabled>
                                    <Loader2 size={13} className="review-export-spinning" aria-hidden="true" /> Preparing…
                                </button>
                            ) : exportState?.blobUrl ? (
                                <button className="review-btn review-btn-primary" onClick={onDownloadReady}>
                                    <Download size={13} aria-hidden="true" /> Download
                                </button>
                            ) : (
                                <button className="review-btn review-btn-secondary" onClick={onExportClick}>Export (Unencrypted)</button>
                            )
                        )}
                        <button className="review-btn review-btn-secondary" onClick={() => { onViewOnMap?.(intelPoint); onClose?.(); }}>View on Map</button>
                    </div>
                )}
            </div>

            { commentsOpen && (
                <CommentsDialog
                    intelPoint={intelPoint}
                    cryptoKey={cryptoKey}
                    onClose={() => setCommentsOpen(false)} />
            )}
        </div>
    );
}
