import { useState, useRef, useEffect } from "react";
import { SwitchCamera } from "lucide-react";
import cameraPoster from "../assets/camera-unavailable.svg";
import "./CameraCapture.css";

export default function CameraCapture({ onCapture, onCancel }) {

    // Consts

    const imageType = "image/jpeg";
    const jpegQuality = 0.9;
    const imageBlobMaxLength = 15728640; // 15MB

    // State

    const [cameras, setCameras] = useState([]);
    const [cameraError, setCameraError] = useState("");

    // References

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const cameraIndexRef = useRef(0);
    const camerasRef = useRef([]);

    // Effects

    useEffect(() => {
        if (!("mediaDevices" in navigator) || !("getUserMedia" in navigator.mediaDevices)) {
            setCameraError("Camera is not supported in this browser.");
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
            ? { video: { deviceId: { exact: deviceId }, width: { ideal: 4096 }, height: { ideal: 3072 } } }
            : { video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } } };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
                return navigator.mediaDevices.enumerateDevices();
            })
            .then((devices) => {
                if (!devices) return;
                const videoDevices = devices.filter((d) => d.kind === "videoinput");
                setCameras(videoDevices);
                camerasRef.current = videoDevices;
                const activeDeviceId = streamRef.current?.getVideoTracks()[0]?.getSettings()?.deviceId;
                const idx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
                cameraIndexRef.current = idx >= 0 ? idx : 0;
            })
            .catch((err) => {
                console.error("camera unavailable:", err);
                setCameraError("No camera detected — please check your camera or browser permissions.");
            });
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.load();
        }
    };

    const onSwitchCamera = () => {
        const list = camerasRef.current;
        if (list.length < 2) return;
        const nextIndex = (cameraIndexRef.current + 1) % list.length;
        cameraIndexRef.current = nextIndex;
        stopCamera();
        startCamera(list[nextIndex].deviceId);
    };

    const onSnap = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
            setCameraError("Camera is not ready yet — please wait.");
            return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) {
                setCameraError("Failed to capture image — please try again.");
                return;
            }
            if (blob.size > imageBlobMaxLength) {
                setCameraError("Image is too large — please lower your camera resolution.");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                stopCamera();
                onCapture(reader.result);
            };
            reader.readAsDataURL(blob);
        }, imageType, jpegQuality);
    };

    // DOM

    return (
        <div className="camera-capture-overlay">
            <video className="camera-capture-video"
                   ref={videoRef}
                   autoPlay
                   playsInline
                   poster={cameraPoster} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div className="camera-capture-controls">
                { cameraError && <p className="camera-capture-error">{cameraError}</p> }
                <div className="camera-capture-actions">
                    <button className="camera-capture-cancel" onClick={() => { stopCamera(); onCancel(); }}>Cancel</button>
                    <button className="camera-capture-snap" onClick={onSnap} aria-label="Take photo" />
                    { cameras.length > 1
                        ? <button className="camera-capture-switch" onClick={onSwitchCamera}><SwitchCamera size={22} /></button>
                        : <span className="camera-capture-switch-placeholder" />
                    }
                </div>
            </div>
        </div>
    );
}
