import { useState, useRef, useEffect } from "react";
import { Camera, CameraOff, SwitchCamera } from "lucide-react";
import cameraPoster from "../assets/camera-unavailable.svg";

import "./Intel.css";

export default function Intel({ onIntelReady, onIntelError, onIntelCancel }) {

    // Consts

    const imageType = "image/jpeg";
    const jpegQuality = 0.9;
    const descriptionMaxLength = 300;
    const imageBlobMaxLength = 5242880;

    // State

    const [description, setDescription] = useState("");
    const [userError, setUserError] = useState("");
    const [cameras, setCameras] = useState([]);
    const [cameraIndex, setCameraIndex] = useState(0);

    // References

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const intelReadyRef = useRef(onIntelReady);
    const intelErrorRef = useRef(onIntelError);
    const intelCancelRef = useRef(onIntelCancel);
    const cameraIndexRef = useRef(cameraIndex);
    const camerasRef = useRef(cameras);

    // Effects

    useEffect(() => {
        intelErrorRef.current = onIntelError;
    }, [onIntelError]);

    useEffect(() => {
        intelReadyRef.current = onIntelReady;
    }, [onIntelReady]);

    useEffect(() => {
        intelCancelRef.current = onIntelCancel;
    }, [onIntelCancel]);

    useEffect(() => {
        cameraIndexRef.current = cameraIndex;
    }, [cameraIndex]);

    useEffect(() => {
        camerasRef.current = cameras;
    }, [cameras]);

    useEffect(() => {
        if (!("mediaDevices" in navigator)) {
            setUserError("This browser is not supported.");
            return;
        }
        if (!("getUserMedia" in navigator.mediaDevices)) {
            setUserError("Cameras are not supported in this browser.");
            return;
        }

        let isMounted = true;
        startCamera(null, isMounted);
        return () => {
            isMounted = false;
            stopCamera();
        };
    }, []);

    // Methods

    const startCamera = (deviceId, isMounted = true) => {
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId } } }
            : { video: { facingMode: { ideal: "environment" } } };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                if (!isMounted) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                return navigator.mediaDevices.enumerateDevices();
            })
            .then((devices) => {
                if (!devices) return;
                const videoDevices = devices.filter((d) => d.kind === "videoinput");
                setCameras(videoDevices);
                camerasRef.current = videoDevices;
                const activeDeviceId = streamRef.current?.getVideoTracks()[0]?.getSettings()?.deviceId;
                const idx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
                const resolvedIdx = idx >= 0 ? idx : 0;
                setCameraIndex(resolvedIdx);
                cameraIndexRef.current = resolvedIdx;
            })
            .catch((error) => {
                console.error(`camera is not available: ${error}`);
                setUserError("No camera detected - please check your camera device.");
            });
    };

    const onSwitchCamera = () => {
        const list = camerasRef.current;
        if (list.length < 2) return;
        const nextIndex = (cameraIndexRef.current + 1) % list.length;
        stopCamera();
        startCamera(list[nextIndex].deviceId);
    };

    const onSubmitWithPhoto = () => {
        const video = videoRef.current;
        if (!video) {
            invokeIntelError(new Error("video is not ready"), "Camera is not ready yet - please wait.");
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
            invokeIntelError(new Error("image canvas is not ready"), "Camera is not ready yet - please wait.");
            return;
        }

        if (video.videoHeight == 0 || video.videoWidth == 0) {
            invokeIntelError(new Error("video is not ready (dimensions)"), "Unable to take video from camera - please check your camera or browser permissions.");
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
            if (blob.size > imageBlobMaxLength) {
                invokeIntelError(new Error("image size is too large"), "Video size is too large - please lower the quality or size of the video resolution.");
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

    const onCancel = () => {
        stopCamera();
        invokeIntelCancel();
    };

    const notifySubmit = (description, b64Image) => {
        let trimmedDescription = "";
        if (description) {
            trimmedDescription = description.trim();
            if (trimmedDescription.length > descriptionMaxLength) {
                setUserError(`Description must be ${descriptionMaxLength} characters or fewer.`);
                return;
            }
        }
        if (!b64Image) {
            if (trimmedDescription.length == 0) {
                setUserError("Add a description when submitting without a photo.");
                return;
            }
        }
        invokeIntelReady(trimmedDescription, b64Image);
    };

    const invokeIntelError = (error, userMessage) => {
        if (userMessage) {
            setUserError(userMessage);
        }
        intelErrorRef.current?.(error);
    };

    const invokeIntelReady = (description, b64Image) => {
        intelReadyRef.current?.(description, b64Image);
    };

    const invokeIntelCancel = () => {
        intelCancelRef.current?.();
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks()
                            .forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.load();
        }
    };

    // DOM
    return (
        // TODO - add a tags entry below the text area
        <div className="modal-background">
            <div className="intel-wrapper modal-card">
                <button className="intel-cancel"
                        onClick={onCancel}>X</button>
                <h2>Get Intel</h2>
                { userError && (
                    <div className="intel-error">{userError}</div>
                ) }
                <video className="intel-camera"
                        ref={videoRef}
                        autoPlay
                        playsInline
                        poster={cameraPoster} />
                <canvas ref={canvasRef}
                        style={{ display: "none" }} />
                { cameras.length > 1 && (
                    <button className="intel-switch-camera" onClick={onSwitchCamera}>
                        <span className="intel-submit-label">
                            <SwitchCamera size={16} aria-hidden="true" />
                            Switch Camera
                        </span>
                    </button>
                )}
                <textarea value={description}
                            id="intel-description"
                            name="intel-description"
                            className="intel-description"
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Add description here (if any)"
                            rows={5} />
                <button className="intel-submit-w-photo"
                        onClick={onSubmitWithPhoto}>
                    <span className="intel-submit-label">
                        <Camera size={16} aria-hidden="true" />
                        Submit With Photo
                    </span>
                </button>
                <button className="intel-submit-wo-photo"
                        onClick={onSubmitWithoutPhoto}>
                    <span className="intel-submit-label">
                        <CameraOff size={16} aria-hidden="true" />
                        Submit Without Photo
                    </span>
                </button>
            </div>
        </div>
    );
}
