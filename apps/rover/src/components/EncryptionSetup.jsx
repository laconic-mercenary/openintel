import { useState } from 'react';
import { deriveKey } from '../utils/crypto';
import { saveKey } from '../utils/keystore';
import './EncryptionSetup.css';

const requirements = [
    { label: 'At least 7 characters', test: (p) => p.length >= 7 },
    { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
    { label: 'Lowercase letter', test: (p) => /[a-z]/.test(p) },
    { label: 'Number', test: (p) => /[0-9]/.test(p) },
    { label: 'Symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function meetsAll(password) {
    return requirements.every((r) => r.test(password));
}

export default function EncryptionSetup({ salt, onKeyReady }) {
    const [password, setPassword] = useState('');
    const [persist, setPersist] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!meetsAll(password)) return;
        setLoading(true);
        setError(null);
        try {
            const key = await deriveKey(password, salt);
            await saveKey(key, persist);
            onKeyReady(key);
        } catch (err) {
            setError('Failed to set up encryption. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="enc-setup-overlay">
            <div className="enc-setup-panel">
                <h2>Encryption Password</h2>
                <p className="enc-setup-warning">
                    This password encrypts your intel on this device. It is never sent to the server.
                    <strong> There is no recovery if you forget it.</strong>
                </p>
                <form onSubmit={onSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoComplete="new-password"
                        autoFocus
                    />
                    <ul className="enc-setup-requirements">
                        {requirements.map((r) => (
                            <li key={r.label} className={r.test(password) ? 'met' : ''}>
                                {r.label}
                            </li>
                        ))}
                    </ul>
                    <label className="enc-setup-persist">
                        <input
                            type="checkbox"
                            checked={persist}
                            onChange={(e) => setPersist(e.target.checked)}
                        />
                        Remember on this device
                    </label>
                    {error && <p className="enc-setup-error">{error}</p>}
                    <button type="submit" disabled={!meetsAll(password) || loading}>
                        {loading ? 'Setting up...' : 'Continue'}
                    </button>
                </form>
            </div>
        </div>
    );
}
