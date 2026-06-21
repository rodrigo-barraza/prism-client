"use client";

import { useRef, useState, useCallback } from "react";
import { Paperclip, ImageIcon, Mic2, Video } from "lucide-react";
import DrawingCanvas from "./DrawingCanvasComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import styles from "./AssetInputOptionsComponent.module.css";

interface AssetInputOptionsProps {
  onFile?: (
    dataUrl: string | ArrayBuffer | null,
    mimeType: string | null,
  ) => void;
  compact?: boolean;
}

/**
 * Shared asset input options for empty file input nodes.
 * Shows icon buttons: Upload file, Create drawing, Record audio, Record webcam.
 *
 * Props:
 *   onFile(dataUrl, mimeType) – called when a file/asset is ready
 *   compact – smaller icon buttons for node view (default false = sidebar view)
 */
export default function AssetInputOptions({
  onFile,
  compact = false,
}: AssetInputOptionsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [showAudioRec, setShowAudioRec] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onFile?.(reader.result, file.type);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onFile?.(reader.result, file.type);
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // -- Webcam --
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setShowWebcam(true);
      // Assign stream after render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          (videoRef.current as HTMLVideoElement).srcObject = stream;
        }
      });
    } catch {
      // Camera permission denied
    }
  }, []);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach((tool) => tool.stop());
    streamRef.current = null;
    setShowWebcam(false);
  }, []);

  const captureWebcam = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = (video as HTMLVideoElement).videoWidth;
    canvas.height = (video as HTMLVideoElement).videoHeight;
    const context = canvas.getContext("2d");
    context!.drawImage(video as CanvasImageSource, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    onFile?.(dataUrl, "image/png");
    stopWebcam();
  }, [onFile, stopWebcam]);

  const iconSize = compact ? 14 : 16;

  // -- Webcam fullscreen view --
  if (showWebcam) {
    return (
      <div
        className={`${styles['container']} ${compact ? styles['compact'] : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className={styles['webcam-preview']}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles['webcam-video']}
          />
          <div className={styles['webcam-actions']}>
            <button
              type="button"
              className={styles['capture-button']}
              onClick={captureWebcam}
              title="Capture photo"
            />
            <button
              type="button"
              className={styles['cancel-button']}
              onClick={stopWebcam}
              title="Cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- Audio recording inline view --
  if (showAudioRec) {
    return (
      <div
        className={`${styles['container']} ${compact ? styles['compact'] : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className={styles['audio-rec-wrap']}>
          <AudioPlayerRecorderComponent
            onRecordingComplete={(dataUrl: string | ArrayBuffer | null) => {
              onFile?.(dataUrl, "audio/webm");
              setShowAudioRec(false);
            }}
          />
          <button
            type="button"
            className={styles['cancel-button']}
            onClick={() => setShowAudioRec(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`asset-input-options-component ${styles['container']} ${compact ? styles['compact'] : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*,.pdf,.txt,.sizeMedium,.json,.csv"
          className={styles['hidden-input']}
          onChange={handleFileChange}
        />

        <div className={styles['option-grid']}>
          <button
            type="button"
            className={styles['option-button']}
            onClick={() => fileInputRef.current?.click()}
            title="Upload file"
          >
            <Paperclip size={iconSize} />
            {!compact && <span>Upload</span>}
          </button>

          <button
            type="button"
            className={styles['option-button']}
            onClick={() => setShowDrawing(true)}
            title="Create drawing"
          >
            <ImageIcon size={iconSize} />
            {!compact && <span>Draw</span>}
          </button>

          <button
            type="button"
            className={styles['option-button']}
            onClick={() => setShowAudioRec(true)}
            title="Record audio"
          >
            <Mic2 size={iconSize} />
            {!compact && <span>Record</span>}
          </button>

          <button
            type="button"
            className={styles['option-button']}
            onClick={startWebcam}
            title="Webcam capture"
          >
            <Video size={iconSize} />
            {!compact && <span>Webcam</span>}
          </button>
        </div>

        <label
          className={styles['drop-zone']}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Paperclip size={compact ? 12 : 14} />
          <span>Drop or upload file</span>
          <input
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.txt,.sizeMedium,.json,.csv"
            className={styles['hidden-input']}
            onChange={handleFileChange}
          />
        </label>
      </div>

      {showDrawing && (
        <DrawingCanvas
          onClose={() => setShowDrawing(false)}
          onSave={(dataUrl: string | ArrayBuffer | null) => {
            onFile?.(dataUrl, "image/png");
            setShowDrawing(false);
          }}
        />
      )}
    </>
  );
}
