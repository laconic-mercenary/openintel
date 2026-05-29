import { Cloud, CloudOff, FileDown, FileUp, Loader2, Locate, LocateOff, LogOut, Map, Sparkles } from "lucide-react";
import { salammboStatuses } from "../utils/salammbo";
import "./OptionsView.css";

export default function OptionsView({ geolocationIsEnabled, onGeolocationToggle, saveToCloudDefault, onSaveToCloudDefaultChange, showFiltersOnMap, onShowFiltersOnMapChange, salammboEnabled, salammboStatus, salammboProgress, salammboError, onSalammboToggle, onLogout, onExportAll, onImportIntel }) {

    // Consts

    const salammboIsLoading = salammboStatus === salammboStatuses.loading;
    const salammboIsDeleting = salammboStatus === salammboStatuses.deleting;
    const salammboProgressPct = Math.max(0, Math.min(100, Math.round((salammboProgress?.progress ?? 0) * 100)));
    const salammboToggleIsDisabled = salammboIsDeleting;
    const salammboStatusLabel = salammboIsDeleting
        ? "Clearing"
        : salammboEnabled
            ? "On"
            : "Off";

    // Methods

    const handleShowFiltersToggle = () => {
        onShowFiltersOnMapChange?.(!showFiltersOnMap);
    };

    const handleSaveToCloudToggle = () => {
        onSaveToCloudDefaultChange?.(!saveToCloudDefault);
    };

    const handleSalammboToggle = () => {
        onSalammboToggle?.(!salammboEnabled);
    };

    // DOM

    return (
        <div className="options-view">
            <h2 className="options-heading">Options</h2>

            <section className="options-section">
                <h3 className="options-section-title">User</h3>
                <button className="options-action-btn options-action-btn--danger" onClick={onLogout}>
                    <LogOut size={16} aria-hidden="true" /> Logout
                </button>
            </section>

            <section className="options-section">
                <h3 className="options-section-title">Import / Export</h3>

                <button className="options-action-btn" onClick={onExportAll}>
                    <FileDown size={16} aria-hidden="true" /> Export Intel
                </button>

                <button className="options-action-btn" onClick={onImportIntel}>
                    <FileUp size={16} aria-hidden="true" /> Import Intel
                </button>
            </section>

            <section className="options-section">
                <h3 className="options-section-title">Collection</h3>

                <div className="options-row">
                    <span className="options-row-label">Geolocation</span>
                    <button
                        className={`options-toggle${geolocationIsEnabled ? " is-on" : ""}`}
                        onClick={onGeolocationToggle}
                        aria-label="Toggle geolocation">
                        { geolocationIsEnabled
                            ? <Locate size={14} aria-hidden="true" />
                            : <LocateOff size={14} aria-hidden="true" /> }
                        <span>{geolocationIsEnabled ? "On" : "Off"}</span>
                    </button>
                </div>

                <div className="options-row">
                    <span className="options-row-label">Show Intel on map</span>
                    <button
                        className={`options-toggle${showFiltersOnMap ? " is-on" : ""}`}
                        onClick={handleShowFiltersToggle}
                        aria-label="Toggle show filters on map">
                        <Map size={14} aria-hidden="true" />
                        <span>{showFiltersOnMap ? "On" : "Off"}</span>
                    </button>
                </div>

                <div className="options-row">
                    <span className="options-row-label">Save to Cloud</span>
                    <button
                        className={`options-toggle${saveToCloudDefault ? " is-on" : ""}`}
                        onClick={handleSaveToCloudToggle}
                        aria-label="Toggle save to cloud default">
                        { saveToCloudDefault
                            ? <Cloud size={14} aria-hidden="true" />
                            : <CloudOff size={14} aria-hidden="true" /> }
                        <span>{saveToCloudDefault ? "On" : "Off"}</span>
                    </button>
                </div>

            </section>

            <section className="options-section">
                <h3 className="options-section-title">AI</h3>

                <div className="options-row">
                    <span className="options-row-label">Enable Salammbo</span>
                    <button
                        className={`options-toggle${salammboEnabled ? " is-on" : ""}`}
                        onClick={handleSalammboToggle}
                        disabled={salammboToggleIsDisabled}
                        aria-label="Toggle Salammbo">
                        { salammboIsLoading || salammboIsDeleting
                            ? <Loader2 size={14} className="options-toggle-spinner" aria-hidden="true" />
                            : <Sparkles size={14} aria-hidden="true" /> }
                        <span>{salammboStatusLabel}</span>
                    </button>
                </div>

                { salammboIsLoading && (
                    <div className="options-progress">
                        <div className="options-progress-track">
                            <div className="options-progress-fill" style={{ width: `${salammboProgressPct}%` }} />
                        </div>
                        <p className="options-progress-text">{salammboProgress?.text || "Downloading local model..."}</p>
                    </div>
                )}

                { salammboError && (
                    <p className="options-error-text">{salammboError}</p>
                )}
            </section>

            <section className="options-section">
                <h3 className="options-section-title">Security</h3>
                <div className="options-encryption-info">
                    <p>Algorithm: AES-256-GCM</p>
                    <p>Encryption is client-side only. The server stores only ciphertext — your password never leaves your device.</p>
                </div>
            </section>

            <section className="options-section">
                <h3 className="options-section-title">Important Information</h3>
                <a className="options-link" href="https://www.openintel.to/privacy.html" target="_blank" rel="noopener noreferrer">
                    Privacy Policy →
                </a>
                <a className="options-link" href="https://www.openintel.to/terms.html" target="_blank" rel="noopener noreferrer">
                    Terms of Use →
                </a>
            </section>
        </div>
    );
}
