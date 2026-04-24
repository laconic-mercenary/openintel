import "./ProcessingModal.css";

// methods

export default function ProcessingModal({ message, subMessage }) {

    // DOM

    return (
        <div className="processing-overlay">
            <div className="processing-panel">
                <div className="processing-radar">
                    <div className="processing-radar-ring processing-radar-ring-1" />
                    <div className="processing-radar-ring processing-radar-ring-2" />
                    <div className="processing-radar-ring processing-radar-ring-3" />
                    <div className="processing-radar-sweep" />
                    <div className="processing-radar-dot" />
                </div>
                <p className="processing-message">{message}</p>
                { subMessage && <p className="processing-submessage">{subMessage}</p> }
            </div>
        </div>
    );
}
