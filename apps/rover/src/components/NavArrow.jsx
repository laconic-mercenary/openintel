import "./NavArrow.css";

export default function NavArrow({ bearing, distanceKm, hasPosition }) {

    // Consts

    const distanceLabel = !hasPosition
        ? "Waiting for GPS..."
        : distanceKm < 0.1
            ? `${Math.round(distanceKm * 1000)} m`
            : `${distanceKm.toFixed(1)} km`;

    const arrowFill = hasPosition ? "rgba(194,154,87,0.85)" : "rgba(120,120,120,0.5)";

    // DOM

    return (
        <div className="nav-arrow-panel">
            <div
                className="nav-arrow-icon-wrap"
                style={hasPosition ? { transform: `rotate(${bearing}deg)` } : {}}
            >
                <svg className="nav-arrow-svg" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M16 2 L30 38 L16 30 L2 38 Z"
                        fill={arrowFill}
                        stroke="#2B2F35"
                        strokeWidth="2"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <span className="nav-arrow-label">{distanceLabel}</span>
        </div>
    );
}
