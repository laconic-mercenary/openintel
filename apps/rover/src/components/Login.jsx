import { useState, useRef, useEffect } from "react";

import "./Login.css";

export default function Login() {

    // Consts

    const loginStepEmail = "email";
    const loginStepWait = "wait";
    const loginStepCode = "code";
    const loginStepError = "error";
    const waitPeriodMillis = 11000;
    const requestTimeoutMillis = 10000;
    const httpStatus = {
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
    };

    // State

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState(loginStepEmail);

    // References

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
                        "Content-Type": "application/x-www-form-urlencoded"
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
                        "Content-Type": "application/x-www-form-urlencoded"
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
                console.error(result.statusText);
                setStep(loginStepError);
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
        try {
            const result = await submitCode();
            if (!result.ok) {
                if (result.status == httpStatus.UNAUTHORIZED) {
                    // TODO set error text indicating that the code is wrong
                } else if (result.status == httpStatus.NOT_FOUND) {
                    // TODO set error text indicated that the token expired
                }
                console.error(result.statusText);
                return;
            }
            const data = await result.json();
            if (data.redirectUrl) {
                window.location.replace(data.redirectUrl);
            } else {
                console.error("redirectUrl not specified");
            }
        } catch (err) {
            console.error(err);
        }
    }

    // DOM
    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">Rover Title</h1>
                
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
                    </div>

                    <div className={`login-step login-error ${step === loginStepError ? "is-active" : ""}`}>
                        <p>Apologies - an error happened</p>
                    </div>

                    <div className={`login-step ${step === loginStepWait ? "is-active" : ""}`}>
                        <p>Please check your email</p>
                    </div>

                    <div className={`login-step ${step === loginStepCode ? "is-active" : ""}`}>
                        <form onSubmit={onSubmitCode}>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Enter your login code"
                                required
                                className="login-input"
                            />
                            
                            <button type="submit" className="login-button">
                                Login
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    )
}
