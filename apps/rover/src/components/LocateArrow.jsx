import "./LocateArrow.css";

export default function LocateArrow({ onConfirm }) {

    // DOM

    return (
        <div className="locate-arrow-overlay">
            <div className="locate-arrow-pin">
                <svg className="locate-arrow-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 31L5 15H11V3H21V15H27L16 31Z" fill="#C29A57" stroke="#2B2F35" strokeWidth="2" strokeLinejoin="round"/>
                    <circle cx="16" cy="11" r="2.4" fill="#F0E7D6"/>
                </svg>
                <button className="locate-arrow-ok" onClick={onConfirm}>OK</button>
                <span className="locate-arrow-hint">Zoom in for best accuracy</span>
            </div>
        </div>
    );
}
