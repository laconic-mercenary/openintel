import { useState, useRef, useEffect } from "react";

import "./Intel.css";

export default function Intel({ onIntelReady, onIntelError }) {

    // Consts

    const imageType = "image/jpeg";
    const jpegQuality = 0.9;
    const descriptionMaxLength = 300;
    const imageBlobMaxLength = 5242880;

    // State

    const [description, setDescription] = useState("");

    // References

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const intelReadyRef = useRef(onIntelReady);
    const intelErrorRef = useRef(onIntelError);

    // Effects
    
    useEffect(() => {
        intelErrorRef.current = onIntelError;
    }, [onIntelError]);

    useEffect(() => {
        intelReadyRef.current = onIntelReady;
    }, [onIntelReady]);

    useEffect(() => {
        if (!("mediaDevices" in navigator)) {
            invokeIntelError(new Error("media api not supported on this browser"));
            return;
        }
        if (!("getUserMedia" in navigator.mediaDevices)) {
            invokeIntelError(new Error("camera is not supported on this browser"));
            return;
        }

        let isMounted = true;
        navigator.mediaDevices.getUserMedia({ video: true })
                            .then(
                                (stream) => {
                                    if (!isMounted) {
                                        return;
                                    }
                                    streamRef.current = stream;
                                    if (videoRef.current) {
                                        videoRef.current.srcObject = stream;
                                    }
                                }
                            )
                            .catch(console.error);
        return () => {
            isMounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks()
                                .forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, []);

    // Methods

    const onSubmitWithPhoto = () => {
        const video = videoRef.current;
        if (!video) {
            invokeIntelError(new Error("video is not ready"));
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
            invokeIntelError(new Error("image canvas is not ready"));
            return;
        }

        if (video.videoHeight == 0 || video.videoWidth == 0) {
            invokeIntelError(new Error("video is not ready (dimensions)"));
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const canvasContext = canvas.getContext("2d");
        canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) {
                invokeIntelError(new Error("error processing camera image data"));
                return;
            }
            if (blob.length > imageBlobMaxLength) {
                invokeIntelError(new Error("image size is too large"));
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                notifySubmit(description, reader.result);
            };
            reader.readAsDataURL(blob);
        }, imageType, jpegQuality);
    };

    const onSubmitWithoutPhoto = () => {
        notifySubmit(description, null);
    };

    const notifySubmit = (description, b64Image) => {
        let trimmedDescription = "";
        if (description) {
            trimmedDescription = description.trim();
            if (trimmedDescription.length > descriptionMaxLength) {
                invokeIntelError(new Error(`description must be less than or equal to ${descriptionMaxLength} characters`));
                return;
            }
        }
        if (!b64Image) {
            if (trimmedDescription.length == 0) {
                invokeIntelError(new Error("at least one of a description or image (or both) is required to submit"));
                return;
            }
        }
        invokeIntelReady(description, b64Image);
    };

    const invokeIntelError = (error) => {
        intelErrorRef.current?.(error);
        throw error;
    };

    const invokeIntelReady = (description, b64Image) => {
        intelReadyRef.current?.(description, b64Image);
    };

    // DOM
    return (
        // TODO - add a tags entry below the text area
        <div className="modal-background">
            <div className="modal-card">
                <h2>Get Intel</h2>
                <video className="intel-camera" ref={videoRef} autoPlay playsInline />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <textarea value={description}
                            className="intel-description"
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Add your description here (if any)"
                            rows={5} />
                <button onClick={onSubmitWithPhoto}>Submit With Photo</button>
                <button onClick={onSubmitWithoutPhoto}>Submit Without Photo</button>
                <button>Cancel</button>
            </div>
        </div>
    );
}

