import { useState } from "react";

export default function Login() {

    // State

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');


    // Methods

    const onSubmitEmail = (e) => {
        e.preventDefault();
        console.log("email submitted");
    }

    const onSubmitCode = (e) => {
        e.preventDefault();
        console.log("code submitted")
    }

    // DOM
    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">Rover Title</h1>
                
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
    )
}