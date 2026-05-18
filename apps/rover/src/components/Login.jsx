import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRegionHeaders } from "../utils/api";
import "./Login.css";

export default function Login() {

    // Consts

    const roverPath = "/";
    const loginStepEmail = "email";
    const loginStepWait = "wait";
    const loginStepCode = "code";
    const loginStepError = "error";
    const loginStepConflict = "conflict";
    const waitPeriodMillis = 11000;
    const requestTimeoutMillis = 10000;
    const httpStatus = {
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        CONFLICT: 409,
    };

    // State

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState(loginStepEmail);
    const [codeError, setCodeError] = useState(null);

    // References

    const navigate = useNavigate();

    const timerHandle = useRef(null);

    // Effects

    useEffect(() => {
        return () => {
            // runs on unmount()
            if (timerHandle.current) {
                clearTimeout(timerHandle.current);
            }
        };
    }, []);

    // Methods

    const requestCodeForEmail = async () => {
        const requestAbortController = new AbortController();
        const abortTimerHandle = setTimeout(() => requestAbortController.abort(), requestTimeoutMillis);

        try {
            const result = await fetch(
                "/auth/email-link",
                {
                    method: "POST",
                    headers: {
                        ...getRegionHeaders(),
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({ email }),
                    signal: requestAbortController.signal,
                }
            )
            return result;
        } finally {
            clearTimeout(abortTimerHandle);
        }
    }

    const submitCode = async () => {
        const requestAbortController = new AbortController();
        const abortTimerHandle = setTimeout(() => requestAbortController.abort(), requestTimeoutMillis);

        try {
            const result = await fetch(
                "/auth/code-login",
                {
                    method: "POST",
                    headers: {
                        ...getRegionHeaders(),
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({ email, code }),
                    signal: requestAbortController.signal,
                }
            )
            return result;
        } finally {
            clearTimeout(abortTimerHandle);
        }
    }

    // Handlers


    const onSubmitEmail = async (e) => {
        e.preventDefault();
        if (timerHandle.current) {
            clearTimeout(timerHandle.current);
        }
        setStep(loginStepWait);
        timerHandle.current = setTimeout(() => {
            setStep(loginStepCode);
        }, waitPeriodMillis);
        try {
            const result = await requestCodeForEmail();
            if (!result.ok) {
                clearTimeout(timerHandle.current);
                if (result.status === httpStatus.CONFLICT) {
                    setStep(loginStepConflict);
                } else {
                    console.error(result.statusText);
                    setStep(loginStepError);
                }
                return;
            }
        } catch (err) {
            clearTimeout(timerHandle.current);
            console.error(err);
            setStep(loginStepError);
        }
    }

    const onSubmitCode = async (e) => {
        e.preventDefault();
        setCodeError(null);
        try {
            const result = await submitCode();
            if (!result.ok) {
                if (result.status === httpStatus.UNAUTHORIZED) {
                    setCodeError("Incorrect code — please check your email and try again.");
                } else if (result.status === httpStatus.NOT_FOUND) {
                    setCodeError("Code has expired — please go back and request a new one.");
                } else {
                    setCodeError("Something went wrong — please try again.");
                }
                console.error(result.statusText);
                return;
            }
            navigate(roverPath);
        } catch (err) {
            console.error(err);
            setCodeError("Connection error — please check your network and try again.");
        }
    }

    // DOM
    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-title">
                    <img src="/favicon.png" alt="" className="login-favicon" />
                    <h2>Rover Login</h2>
                </div>
                
                <div className="login-steps">
                    <div className={`login-step ${step === loginStepEmail ? "is-active" : ""}`}>
                        <form onSubmit={onSubmitEmail}>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                className="login-input"
                            />
                            <button type="submit" className="login-button">
                                Send Code
                            </button>
                        </form>
                        <p className="login-consent">
                            By continuing, you agree to our <a className="login-consent-link" href="https://www.openintel.to/terms.html" target="_blank" rel="noreferrer">Terms of Use</a> and <a className="login-consent-link" href="https://www.openintel.to/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.
                        </p>
                    </div>

                    <div className={`login-step login-error ${step === loginStepError ? "is-active" : ""}`}>
                        <p>Apologies - an error happened</p>
                    </div>

                    <div className={`login-step ${step === loginStepWait ? "is-active" : ""}`}>
                        <p>Please check your email — code entry will appear shortly.</p>
                    </div>

                    <div className={`login-step ${step === loginStepConflict ? "is-active" : ""}`}>
                        <p>A login code was already sent — please check your email or wait a few minutes before trying again.</p>
                    </div>

                    <div className={`login-step ${step === loginStepCode ? "is-active" : ""}`}>
                        <form onSubmit={onSubmitCode}>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={code}
                                onChange={(e) => { setCode(e.target.value); setCodeError(null); }}
                                placeholder="Enter your login code"
                                required
                                className="login-input"
                            />
                            { codeError && <p className="login-code-error">{codeError}</p> }
                            <button type="submit" className="login-button">
                                Login
                            </button>
                        </form>
                        <button className="login-back" onClick={() => { setStep(loginStepEmail); setCode(''); setCodeError(null); }}>
                            ← Back
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
