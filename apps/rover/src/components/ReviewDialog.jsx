import { useEffect, useRef, useState } from "react";
import { getIntelImageUrl } from "../utils/api";
import { decryptBytes } from "../utils/crypto";
import CommentsDialog from "./CommentsDialog.jsx";
import "./ReviewDialog.css";

export default function ReviewDialog({ intelPoint, cryptoKey, onClose, onKeep, onDiscard, onExport, onDelete, onEdit, onViewOnMap, onNavigateTo, onError }) {

    // State

    const [imageUrl, setImageUrl] = useState(null);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [deleteConfirming, setDeleteConfirming] = useState(false);

    // References

    const blobUrlRef = useRef(null);

    // Effects

    useEffect(() => {
        setDeleteConfirming(false);
        setCommentsOpen(false);
        setImageUrl(null);
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        if (!intelPoint?.hasImage) return;
        let cancelled = false;
        getIntelImageUrl(intelPoint)
            .then((presignedUrl) => fetch(presignedUrl))
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
        };
    }, []);

    // Methods

    // Methods

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return "Unknown";
        const d = new Date(timestamp);
        return isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
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
                                <button className="review-btn review-btn-secondary" onClick={() => { onExport?.(intelPoint); onClose?.(); }}>Export</button>
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
