import { Cloud, CloudOff, FileDown, FileUp, Locate, LocateOff, LogOut, Map } from "lucide-react";
import "./OptionsView.css";

export default function OptionsView({ geolocationIsEnabled, onGeolocationToggle, saveToCloudDefault, onSaveToCloudDefaultChange, showFiltersOnMap, onShowFiltersOnMapChange, onLogout, onExportAll, onImportIntel }) {

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
                        onClick={() => onShowFiltersOnMapChange?.(!showFiltersOnMap)}
                        aria-label="Toggle show filters on map">
                        <Map size={14} aria-hidden="true" />
                        <span>{showFiltersOnMap ? "On" : "Off"}</span>
                    </button>
                </div>

                <div className="options-row">
                    <span className="options-row-label">Save to Cloud</span>
                    <button
                        className={`options-toggle${saveToCloudDefault ? " is-on" : ""}`}
                        onClick={() => onSaveToCloudDefaultChange?.(!saveToCloudDefault)}
                        aria-label="Toggle save to cloud default">
                        { saveToCloudDefault
                            ? <Cloud size={14} aria-hidden="true" />
                            : <CloudOff size={14} aria-hidden="true" /> }
                        <span>{saveToCloudDefault ? "On" : "Off"}</span>
                    </button>
                </div>
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
