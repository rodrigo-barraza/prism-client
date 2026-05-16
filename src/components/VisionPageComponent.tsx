"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Camera,
  Monitor,
  Globe,
  Eye,
  EyeOff,
  Play,
  Square,
  Loader2,
  Trash2,
  Scan,
  Video,
} from "lucide-react";
import PrismService from "../services/PrismService";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ProviderLogo from "./ProviderLogosComponent";
import { PageHeaderComponent } from "@rodrigo-barraza/components-library";
import styles from "./VisionPageComponent.module.css";

// ── Source type definitions ───────────────────────────────────────
const SOURCE_TYPES = [
  { key: "webcam", label: "Webcam", icon: Camera },
  { key: "screen", label: "Screen Capture", icon: Monitor },
  { key: "ipcam", label: "IP Camera", icon: Globe },
];

// ── Default analysis prompt ──────────────────────────────────────
const DEFAULT_PROMPT =
  "Describe what you see in this image. Identify any people, objects, activities, and notable details. Be concise but thorough.";

/**
 * VisionPageComponent
 *
 * Real-time vision analysis page with split-panel layout:
 * - Left: video source (webcam, screen capture, IP camera)
 * - Right: AI-powered periodic vision analysis with configurable intervals
 *
 * Uses the `getDisplayMedia` / `getUserMedia` Web APIs for local sources,
 * and a standard <video> element for IP camera MJPEG/HLS streams.
 * Frames are captured to a hidden <canvas>, converted to base64, and
 * sent to PrismService.generateText() with multimodal image input.
 */
export default function VisionPageComponent() {
  // ── Config state ────────────────────────────────────────────────
  const [config, setConfig] = useState<any>(null);
  const [settings, setSettings] = useState<any>({ provider: "", model: "" });
  const [favorites, setFavorites] = useState<any>([]);

  // ── Source state ────────────────────────────────────────────────
  const [sourceType, setSourceType] = useState<any>(null);
  const [ipCamUrl, setIpCamUrl] = useState<any>("");
  const [isStreaming, setIsStreaming] = useState<any>(false);
  const [resolution, setResolution] = useState<any>(null);

  // ── Analysis state ─────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState<any>(false);
  const [intervalSec, setIntervalSec] = useState<any>(10);
  const [prompt, setPrompt] = useState<any>(DEFAULT_PROMPT);
  const [results, setResults] = useState<any>([]);
  const [isCapturing, setIsCapturing] = useState<any>(false);
  const [showFlash, setShowFlash] = useState<any>(false);
  const [snapshotCount, setSnapshotCount] = useState<any>(0);

  // ── Progress ring state ────────────────────────────────────────
  const [captureProgress, setCaptureProgress] = useState<any>(0);

  // ── Refs ────────────────────────────────────────────────────────
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const progressRef = useRef<any>(null);
  const resultsAreaRef = useRef<any>(null);
  const isAnalyzingRef = useRef<any>(false);
  const abortRef = useRef<any>(null);

  // ── Load Prism config ──────────────────────────────────────────
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: setConfig,
      onLocalMerge: setConfig,
    });
    PrismService.getFavorites("model")
      .then((favs) => setFavorites(favs.map((f: any) => f.key)))
      .catch(() => {});
  }, []);

  // Filter config to only vision-capable models (have image input)
  const visionConfig = useMemo<any>(() => {
    if (!config) return null;
    const filtered = { ...config };
    const textModels = config.textToText?.models || {};
    const filteredModels = {};

    for (const [provider, models] of Object.entries(textModels)) {
      // @ts-ignore
      const visionModels = models.filter(
        (m: any) => m.inputTypes?.includes("image"),
      );
      if (visionModels.length > 0) {
        // @ts-ignore
        filteredModels[provider] = visionModels;
      }
    }

    filtered.textToText = { ...config.textToText, models: filteredModels };
    // Clear other sections so only vision text models appear
    filtered.textToImage = { models: {} };
    filtered.textToSpeech = { models: {} };
    filtered.audioToText = { models: {} };
    filtered.embedding = { models: {} };
    return filtered;
  }, [config]);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopSource();
      stopAnalysis();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Source management ──────────────────────────────────────────

  const stopSource = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setIsStreaming(false);
    setResolution(null);
  }, []);

  const attachStream = useCallback((stream: any) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // play() returns a promise — only set streaming on success
      video.play().then(() => {
        setIsStreaming(true);
      }).catch((err: any) => {
        // @ts-ignore
        console.warn("Video play() interrupted:", error.message);
      });
    }

    const track = stream.getVideoTracks()[0];
    const trackSettings = track.getSettings();
    if (trackSettings.width && trackSettings.height) {
      setResolution(`${trackSettings.width}×${trackSettings.height}`);
    }
  }, []);

  const startWebcam = useCallback(async () => {
    stopSource();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      attachStream(stream);
    } catch (error) {
      // @ts-ignore
      console.error("Webcam error:", err);
    }
  }, [stopSource, attachStream]);

  const startScreenCapture = useCallback(async () => {
    try {
      // Acquire the stream FIRST — the user picks a source during this prompt.
      // We intentionally delay stopSource() until we have a valid stream so
      // the video element is never hidden (isStreaming=false) when play() fires.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // @ts-ignore
        video: { cursor: "always" },
        audio: false,
      });

      // Now tear down the previous source
      stopSource();

      // Attach the new stream (this calls play() and sets isStreaming=true)
      attachStream(stream);

      // Listen for user clicking "Stop sharing" in the browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopSource();
        setSourceType(null);
      });
    } catch (error) {
      // @ts-ignore
      console.error("Screen capture error:", err);
    }
  }, [stopSource, attachStream]);

  const startIpCamera = useCallback(
    (url: any) => {
      stopSource();
      if (!url) return;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.play().catch(() => {});
      }
      setIsStreaming(true);
    },
    [stopSource],
  );

  const handleSourceSelect = useCallback(
    async (type: any) => {
      // Toggle off if clicking same source
      if (type === sourceType) {
        stopSource();
        setSourceType(null);
        return;
      }

      setSourceType(type);

      if (type === "webcam") {
        await startWebcam();
      } else if (type === "screen") {
        await startScreenCapture();
      }
      // ipcam requires URL → handled by Connect button
    },
    [sourceType, stopSource, startWebcam, startScreenCapture],
  );

  // Video metadata loaded → update resolution
  const handleVideoMetadata = useCallback(() => {
    const v = videoRef.current;
    if (v && v.videoWidth && v.videoHeight) {
      setResolution(`${v.videoWidth}×${v.videoHeight}`);
    }
  }, []);

  // ── Frame capture ──────────────────────────────────────────────

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // JPEG at 80% quality for bandwidth efficiency
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // ── Analysis loop ──────────────────────────────────────────────

  const runSingleAnalysis = useCallback(async () => {
    if (!settings.provider || !settings.model) return;

    const frame = captureFrame();
    if (!frame) return;

    // Flash effect
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 250);

    const resultId = Date.now();
    setSnapshotCount((c: any) => c + 1);
    setIsCapturing(true);

    // Add placeholder result
    setResults((prev: any) => [
      {
        id: resultId,
        timestamp: new Date(),
        thumbnail: frame,
        text: "",
        streaming: true,
        provider: settings.provider,
        model: settings.model,
      },
      ...prev,
    ]);

    try {
      // Use streaming SSE for real-time output
      const abort = PrismService.streamText(
        {
          provider: settings.provider,
          model: settings.model,
          messages: [
            {
              role: "user",
              content: prompt || DEFAULT_PROMPT,
              images: [frame],
            },
          ],
          maxTokens: 1024,
          temperature: 0.5,
        },
        {
          onChunk: (content: any) => {
            setResults((prev: any) =>
              prev.map((r: any) =>
                r.id === resultId
                  ? { ...r, text: r.text + content }
                  : r,
              ),
            );
          },
          onDone: () => {
            setResults((prev: any) =>
              prev.map((r: any) =>
                r.id === resultId ? { ...r, streaming: false } : r,
              ),
            );
            setIsCapturing(false);
          },
          onError: (err: any) => {
            setResults((prev: any) =>
              prev.map((r: any) =>
                r.id === resultId
                  ? {
                    ...r,
                    // @ts-ignore
                    text: r.text || `Error: ${error.message}`,
                    streaming: false,
                  }
                  : r,
              ),
            );
            setIsCapturing(false);
          },
        },
      );

      abortRef.current = abort;
    } catch (error) {
      setResults((prev: any) =>
        prev.map((r: any) =>
          r.id === resultId
            // @ts-ignore
            ? { ...r, text: `Error: ${error.message}`, streaming: false }
            : r,
        ),
      );
      setIsCapturing(false);
    }
  }, [settings, prompt, captureFrame]);

  const startAnalysis = useCallback(() => {
    if (!settings.provider || !settings.model || !isStreaming) return;

    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setSnapshotCount(0);

    // Run first analysis immediately
    runSingleAnalysis();

    // Set up progress ring + interval
    const intervalMs = intervalSec * 1000;
    let progressStart = performance.now();

    const tickProgress = () => {
      if (!isAnalyzingRef.current) return;
      const elapsed = performance.now() - progressStart;
      const progress = Math.min(elapsed / intervalMs, 1);
      setCaptureProgress(progress);

      if (progress >= 1) {
        // Time to capture
        runSingleAnalysis();
        progressStart = performance.now();
        setCaptureProgress(0);
      }

      progressRef.current = requestAnimationFrame(tickProgress);
    };

    progressRef.current = requestAnimationFrame(tickProgress);
  }, [settings, isStreaming, intervalSec, runSingleAnalysis]);

  const stopAnalysis = useCallback(() => {
    isAnalyzingRef.current = false;
    setIsAnalyzing(false);
    setCaptureProgress(0);

    if (progressRef.current) {
      cancelAnimationFrame(progressRef.current);
      progressRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
  }, []);

  // ── Model selection ────────────────────────────────────────────

  const handleModelSelect = useCallback((provider: any, model: any) => {
    setSettings({ provider, model });
  }, []);

  const handleToggleFavorite = useCallback(async (key: any) => {
    setFavorites((prev: any) => {
      if (prev.includes(key)) {
        PrismService.removeFavorite("model", key).catch(() => {});
        return prev.filter((k: any) => k !== key);
      }
      const [provider, ...rest] = key.split(":");
      PrismService.addFavorite("model", key, {
        provider,
        name: rest.join(":"),
      }).catch(() => {});
      return [...prev, key];
    });
  }, []);

  // ── Progress ring ──────────────────────────────────────────────
  const circumference = 2 * Math.PI * 14; // r=14

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>
      <PageHeaderComponent
        title="Vision"
        subtitle="Real-time AI-powered video analysis"
      />

      <div className={styles.splitLayout}>
        {/* ── Left: Source Panel ─────────────────────────────────── */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <Video size={15} className={styles.panelTitleIcon} />
            <span className={styles.panelTitle}>Video Source</span>
            {isAnalyzing && (
              <span className={styles.statusActive}>
                <Eye size={10} /> Active
              </span>
            )}
          </div>

          <div className={styles.sourceContent}>
            {/* Source type buttons */}
            <div className={styles.sourceSelector}>
              {SOURCE_TYPES.map((src) => {
                const Icon = src.icon;
                return (
                  <button
                    key={src.key}
                    className={`${styles.sourceBtn} ${sourceType === src.key ? styles.sourceBtnActive : ""}`}
                    onClick={() => handleSourceSelect(src.key)}
                  >
                    <Icon size={14} />
                    {src.label}
                  </button>
                );
              })}
            </div>

            {/* IP Camera URL input */}
            {sourceType === "ipcam" && (
              <div className={styles.urlInputRow}>
                <input
                  type="text"
                  className={styles.urlInput}
                  placeholder="rtsp://user:pass@192.168.1.100/stream1 or http://…/mjpeg"
                  value={ipCamUrl}
                  onChange={(e) => setIpCamUrl(e.target.value)}
                />
                <button
                  className={styles.urlConnectBtn}
                  onClick={() => startIpCamera(ipCamUrl)}
                  disabled={!ipCamUrl.trim()}
                >
                  Connect
                </button>
              </div>
            )}

            {/* Video preview — single persistent element to avoid ref-swapping race conditions */}
            <div className={`${styles.videoContainer} ${!isStreaming ? styles.videoContainerHidden : ""}`}>
              <video
                ref={videoRef}
                className={styles.videoElement}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={handleVideoMetadata}
              />
              <canvas ref={canvasRef} className={styles.canvasHidden} />

              {/* Live indicator */}
              {isStreaming && (
                <div className={styles.liveIndicator}>
                  <span className={styles.liveDot} />
                  LIVE
                </div>
              )}

              {/* Resolution badge */}
              {resolution && (
                <div className={styles.resolutionBadge}>{resolution}</div>
              )}

              {/* Screenshot flash */}
              {showFlash && <div className={styles.screenshotFlash} />}

              {/* Analyzing overlay */}
              {isCapturing && (
                <div className={styles.analyzingOverlay}>
                  <div className={styles.analyzingBadge}>
                    <Loader2 size={14} className={styles.spinIcon} />
                    Analyzing…
                  </div>
                </div>
              )}

              {/* Snapshot counter */}
              {snapshotCount > 0 && (
                <div className={styles.snapshotCounter}>
                  #{snapshotCount}
                </div>
              )}

              {/* Progress ring */}
              {isAnalyzing && (
                <div className={styles.captureProgress}>
                  <svg
                    className={styles.captureProgressRing}
                    viewBox="0 0 32 32"
                  >
                    <circle
                      className={styles.captureProgressTrack}
                      cx="16"
                      cy="16"
                      r="14"
                    />
                    <circle
                      className={styles.captureProgressFill}
                      cx="16"
                      cy="16"
                      r="14"
                      strokeDasharray={circumference}
                      strokeDashoffset={
                        circumference - captureProgress * circumference
                      }
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Empty state — no source selected */}
            {!isStreaming && (
              <div className={styles.emptySource}>
                <div className={styles.emptyIcon}>
                  <Scan size={36} />
                </div>
                <span className={styles.emptyLabel}>
                  Select a video source above to begin.
                  <br />
                  Webcam, screen capture, or IP camera.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Analysis Panel ─────────────────────────────── */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <Eye size={15} className={styles.panelTitleIcon} />
            <span className={styles.panelTitle}>Vision Analysis</span>
            {results.length > 0 && (
              <button
                className={styles.clearBtn}
                onClick={() => {
                  setResults([]);
                  setSnapshotCount(0);
                }}
              >
                <Trash2 size={10} /> Clear
              </button>
            )}
          </div>

          <div className={styles.analysisContent}>
            {/* Controls */}
            <div className={styles.controlsBar}>
              {/* Model picker */}
              <div className={styles.modelPickerWrap}>
                {/* @ts-ignore */}
                <ModelPickerPopoverComponent
                  config={visionConfig}
                  settings={settings}
                  onSelectModel={handleModelSelect}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  placeholderLabel="Select Vision Model"
                />
              </div>

              <div className={styles.controlDivider} />

              {/* Interval */}
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>Every</span>
                <input
                  type="number"
                  className={styles.intervalInput}
                  value={intervalSec}
                  onChange={(e) =>
                    setIntervalSec(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  min={1}
                  max={300}
                  disabled={isAnalyzing}
                />
                <span className={styles.unitLabel}>sec</span>
              </div>

              <div className={styles.controlDivider} />

              {/* Start / Stop */}
              {!isAnalyzing ? (
                <button
                  className={styles.startBtn}
                  onClick={startAnalysis}
                  disabled={!isStreaming || !settings.provider || !settings.model}
                  title={
                    !isStreaming
                      ? "Start a video source first"
                      : !settings.model
                        ? "Select a vision model first"
                        : "Start analysis"
                  }
                >
                  <Play size={12} />
                  Start
                </button>
              ) : (
                <button className={styles.stopBtn} onClick={stopAnalysis}>
                  <Square size={10} />
                  Stop
                </button>
              )}
            </div>

            {/* Prompt */}
            <div className={styles.promptRow}>
              <textarea
                className={styles.promptTextarea}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the AI look for?"
                disabled={isAnalyzing}
                rows={2}
              />
            </div>

            {/* Results */}
            <div className={styles.resultsArea} ref={resultsAreaRef}>
              {results.length === 0 ? (
                <div className={styles.emptyResults}>
                  <EyeOff size={36} className={styles.emptyResultsIcon} />
                  <span className={styles.emptyResultsText}>
                    No analysis results yet.
                    <br />
                    Select a source, pick a model, and press Start.
                  </span>
                </div>
              ) : (
                results.map((result: any) => (
                  <div key={result.id} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <span className={styles.resultTimestamp}>
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                      <span className={styles.resultModel}>
                        <ProviderLogo
                          provider={result.provider}
                          size={12}
                        />{" "}
                        {result.model.split("/").pop()}
                      </span>
                    </div>
                    <div className={styles.resultBody}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={result.thumbnail}
                        alt=""
                        className={styles.resultThumb}
                      />
                      <span
                        className={
                          result.streaming
                            ? styles.resultTextStreaming
                            : styles.resultText
                        }
                      >
                        {result.text || (result.streaming ? "" : "No output")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
