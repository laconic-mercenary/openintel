import { Feather, List, Map, Settings } from "lucide-react";
import "./TabBar.css";

export default function TabBar({ activeTab, onTabChange }) {

    // Consts

    const tabs = [
        { id: "map",     label: "Map",     Icon: Map },
        { id: "intel",   label: "Intel",   Icon: List },
        { id: "collect", label: "Collect", Icon: Feather },
        { id: "options", label: "Options", Icon: Settings },
    ];

    // DOM

    return (
        <nav className="tab-bar">
            { tabs.map(({ id, label, Icon }) => (
                <button
                    key={id}
                    className={`tab-btn${activeTab === id ? " is-active" : ""}`}
                    onClick={() => onTabChange(id)}
                    aria-label={label}>
                    <Icon size={22} aria-hidden="true" />
                    <span className="tab-label">{label}</span>
                </button>
            )) }
        </nav>
    );
}
