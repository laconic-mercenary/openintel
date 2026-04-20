import { useRef } from "react";
import { Download } from "lucide-react";
import "./ExportIntelDialog.css";

export default function ExportIntelDialog({ intelPoint, onCancel }) {

    // Consts

    const exportVersion = 1;
    const hasLocation = intelPoint.latitude !== null && intelPoint.latitude !== undefined;

    // References

    const onCancelRef = useRef(onCancel);

    // Methods

    const buildExportBlob = () => {
        const payload = {
            version: exportVersion,
            exportedAt: new Date().toISOString(),
            intel: {
                description: intelPoint.description ?? "",
                tags: intelPoint.tags ?? [],
                latitude: intelPoint.latitude,
                longitude: intelPoint.longitude,
                accuracy: intelPoint.accuracy,
                timestamp: intelPoint.timestamp,
                image: intelPoint.b64image ?? null,
            },
        };
        return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    };

    const downloadBlob = (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `intel-${intelPoint.timestamp}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const onConfirm = () => {
        downloadBlob(buildExportBlob());
        onCancelRef.current?.();
    };

    // DOM

    return (
        <div className="modal-background">
            <div className="export-intel-panel modal-card">
                <button className="intel-cancel" onClick={() => onCancelRef.current?.()}>X</button>
                <h2 className="intel-title">Export Intel</h2>
                <p className="export-intel-body">
                    This will download your intel as a JSON file — description, tags, photo (if any){hasLocation ? ", and coordinates" : ""}.
                </p>
                {!hasLocation && (
                    <p className="export-intel-body export-intel-warning">
                        ⚠ No GPS fix was available — location is not included. You will be able to set it manually when importing.
                    </p>
                )}
                <p className="export-intel-body">
                    Save the file locally. When you're back online, use <strong>Import Intel</strong> in the menu to upload it to the cloud.
                </p>
                <div className="export-intel-actions">
                    <button className="export-intel-cancel" onClick={() => onCancelRef.current?.()}>Cancel</button>
                    <button className="export-intel-confirm" onClick={onConfirm}>
                        <Download size={15} aria-hidden="true" /> Download
                    </button>
                </div>
            </div>
        </div>
    );
}
