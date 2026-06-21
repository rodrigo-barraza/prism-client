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
  Send,
  MessageSquare,
  Bot,
  Sparkles,
  Cpu,
} from "lucide-react";
import type { PrismConfig, ModelOption, Message, ToolCallEvent } from "../types/types";
import PrismService from "../services/PrismService";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ProviderLogo from "./ProviderLogosComponent";
import {
  InputComponent,
  TextAreaComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./VisionPageComponent.module.css";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";

// -- Source type definitions ---------------------------------------
const SOURCE_TYPES = [
  { key: "webcam", label: "Webcam", icon: Camera },
  { key: "screen", label: "Screen Capture", icon: Monitor },
  { key: "ipcam", label: "IP Camera", icon: Globe },
];

// -- Default analysis prompt --------------------------------------
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
interface VisionAnalysisResult {
  id: number;
  timestamp: Date;
  thumbnail: string;
  text: string;
  streaming: boolean;
  provider: string;
  model: string;
}

export default function VisionPageComponent() {
  // -- Config state ------------------------------------------------
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [settings, setSettings] = useState({ provider: "", model: "" });
  const [favorites, setFavorites] = useState<string[]>([]);

  // -- Agent mode state --------------------------------------------
  const [mode, setMode] = useState<"analysis" | "agent">("analysis");
  const [conversationId] = useState(
    () => "vision-agent-" + Math.random().toString(36).substring(2, 15),
  );
interface VisionToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status?: string;
  result?: unknown;
}

interface VisionChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  images?: string[];
  toolCalls?: VisionToolCall[];
  timestamp: Date;
  streaming?: boolean;
}

  const [chatMessages, setChatMessages] = useState<VisionChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<
    Record<string, boolean>
  >({});

  // -- Source state ------------------------------------------------
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [ipCamUrl, setIpCamUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);

  // -- Analysis state ---------------------------------------------
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [intervalSec, setIntervalSec] = useState(10);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [results, setResults] = useState<VisionAnalysisResult[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // -- Progress ring state ----------------------------------------
  const [captureProgress, setCaptureProgress] = useState(0);

  // -- Refs --------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | number | null>(null);
  const progressRef = useRef<number | null>(null);
  const resultsAreaRef = useRef<HTMLDivElement | null>(null);
  const chatAreaRef = useRef<HTMLDivElement | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);
  const abortRef = useRef<(() => void) | null>(null);

  // -- Load Prism config ------------------------------------------
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: setConfig,
      onLocalMerge: setConfig,
    });
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavorites(favs.map((favorite) => favorite.key)),
      )
      .catch(() => {});
  }, []);

  const syncConversation = useCallback(async () => {
    try {
      const conversation = await PrismService.getConversation(conversationId);
      if (conversation?.messages) {
        const formatted: VisionChatMessage[] = conversation.messages.map((rawMessage: Message) => {
          const message = rawMessage as unknown as Record<string, unknown>;
          return {
            id: (message.id as string) || `msg-${Math.random()}`,
            role: rawMessage.role as "user" | "assistant",
            content: rawMessage.content || "",
            thinking: (message.thinking as string) || "",
            images: (message.images as string[]) || [],
            toolCalls: (message.toolCalls as VisionToolCall[]) || [],
            timestamp: new Date((rawMessage.timestamp as string) || Date.now()),
          };
        });
        setChatMessages(formatted);
      }
    } catch (error) {
      console.warn("[VisionAgent] Conversation sync failed (might not exist yet):", error);
    }
  }, [conversationId]);

  useEffect(() => {
    if (mode === "agent") {
      syncConversation();
    }
  }, [mode, syncConversation]);

  // Filter config to only vision-capable models (have image input)
  const visionConfig = useMemo(() => {
    if (!config) return null;
    const filtered = { ...config };
    const textModels = config.textToText?.models || {};
    const filteredModels: Record<string, ModelOption[]> = {};

    for (const [provider, models] of Object.entries(textModels)) {
      const visionModels = models.filter((modelOption) =>
        modelOption.inputTypes?.includes("image"),
      );
      if (visionModels.length > 0) {
        filteredModels[provider] = visionModels;
      }
    }

    filtered.textToText = {
      ...config.textToText,
      models: filteredModels,
    };
    // Clear other sections so only vision text models appear
    filtered.textToImage = { models: {}, defaults: {} };
    filtered.textToSpeech = {
      models: {},
      defaults: {},
      voices: {},
      defaultVoices: {},
    };
    filtered.audioToText = { models: {}, defaults: {} };
    filtered.embedding = { models: {}, defaults: {} };
    return filtered;
  }, [config]);

  // -- Source management ------------------------------------------

  const stopSource = useCallback(() => {
    if (streamRef.current) {
      (streamRef.current as MediaStream).getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      (videoRef.current as HTMLVideoElement).pause();
      (videoRef.current as HTMLVideoElement).srcObject = null;
      (videoRef.current as HTMLVideoElement).removeAttribute("src");
      (videoRef.current as HTMLVideoElement).load();
    }
    setIsStreaming(false);
    setResolution(null);
  }, []);

  const attachStream = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // play() returns a promise — only set streaming on success
      video
        .play()
        .then(() => {
          setIsStreaming(true);
        })
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.warn("Video play() interrupted:", errorMessage);
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
    } catch (error: unknown) {
      console.error("Webcam error:", error);
    }
  }, [stopSource, attachStream]);

  const startScreenCapture = useCallback(async () => {
    try {
      // Acquire the stream FIRST — the user picks a source during this prompt.
      // We intentionally delay stopSource() until we have a valid stream so
      // the video element is never hidden (isStreaming=false) when play() fires.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as MediaTrackConstraints,
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
    } catch (error: unknown) {
      console.error("Screen capture error:", error);
    }
  }, [stopSource, attachStream]);

  const startIpCamera = useCallback(
    (url: string) => {
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
    async (type: string | null) => {
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
    const videoElement = videoRef.current;
    if (
      videoElement &&
      (videoElement as HTMLVideoElement).videoWidth &&
      (videoElement as HTMLVideoElement).videoHeight
    ) {
      setResolution(
        `${(videoElement as HTMLVideoElement).videoWidth}×${(videoElement as HTMLVideoElement).videoHeight}`,
      );
    }
  }, []);

  // -- Frame capture ----------------------------------------------

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // JPEG at 80% quality for bandwidth efficiency
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // -- Analysis loop ----------------------------------------------

  const runSingleAnalysis = useCallback(async () => {
    if (!settings.provider || !settings.model) return;

    const frame = captureFrame();
    if (!frame) return;

    // Flash effect
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 250);

    const resultId = Date.now();
    setSnapshotCount((previousCount) => previousCount + 1);
    setIsCapturing(true);

    // Add placeholder result
    setResults((previousResults) => [
      {
        id: resultId,
        timestamp: new Date(),
        thumbnail: frame,
        text: "",
        streaming: true,
        provider: settings.provider,
        model: settings.model,
      },
      ...previousResults,
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
          onChunk: (content: string) => {
            setResults((previousResults) =>
              previousResults.map((resultItem) =>
                resultItem.id === resultId ? { ...resultItem, text: resultItem.text + content } : resultItem,
              ),
            );
          },
          onDone: () => {
            setResults((previousResults) =>
              previousResults.map((resultItem) =>
                resultItem.id === resultId ? { ...resultItem, streaming: false } : resultItem,
              ),
            );
            setIsCapturing(false);
          },
          onError: (error: Error) => {
            setResults((previousResults) =>
              previousResults.map((resultItem) =>
                resultItem.id === resultId
                  ? {
                      ...resultItem,
                      text: resultItem.text || `Error: ${error.message}`,
                      streaming: false,
                    }
                  : resultItem,
              ),
            );
            setIsCapturing(false);
          },
        },
      );

      abortRef.current = abort;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setResults((previousResults) =>
        previousResults.map((resultItem) =>
          resultItem.id === resultId
            ? { ...resultItem, text: `Error: ${errorMessage}`, streaming: false }
            : resultItem,
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

  // -- Cleanup on unmount -----------------------------------------
  useEffect(() => {
    return () => {
      stopSource();
      stopAnalysis();
    };
  }, [stopSource, stopAnalysis]);

  // -- Background Live Frame Uploader for Agent Mode ---------------
  useEffect(() => {
    if (mode !== "agent" || !isStreaming) return;

    const uploadInterval = setInterval(async () => {
      const frameDataUrl = captureFrame();
      if (!frameDataUrl) return;

      try {
        await PrismService.uploadVisionFrame(conversationId, frameDataUrl);
      } catch (error: unknown) {
        console.warn("[VisionAgent] Live frame upload failed:", error);
      }
    }, 2000);

    return () => clearInterval(uploadInterval);
  }, [mode, isStreaming, conversationId, captureFrame]);

  // Auto-scroll chat area when messages update
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const toggleThinking = useCallback((messageId: string) => {
    setExpandedThinkingIds((previousState) => ({
      ...previousState,
      [messageId]: !previousState[messageId],
    }));
  }, []);

  const handleSendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !settings.provider || !settings.model) return;

    const userText = chatInput.trim();
    setChatInput("");
    setIsAgentStreaming(true);

    const userMessage: VisionChatMessage = {
      id: `message-${Date.now()}-user`,
      role: "user" as const,
      content: userText,
      timestamp: new Date(),
    };

    const assistantMessageId = `message-${Date.now()}-assistant`;
    const assistantMessage = {
      id: assistantMessageId,
      role: "assistant" as const,
      content: "",
      thinking: "",
      toolCalls: [] as VisionToolCall[],
      timestamp: new Date(),
      streaming: true,
    };

    const newMessages = [...chatMessages, userMessage];
    setChatMessages([...newMessages, assistantMessage]);
    setActiveMessageId(assistantMessageId);

    const messagesPayload = newMessages.map((message) => ({
      role: message.role,
      content: message.content || "",
      images: message.images || [],
      toolCalls: (message.toolCalls || []).map((toolCall: VisionToolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        args: toolCall.args || {},
      })),
      thinking: message.thinking || "",
    }));

    try {
      const abort = PrismService.streamAgentText(
        {
          provider: settings.provider,
          model: settings.model,
          messages: messagesPayload as unknown as Message[],
          harness: "vision_language",
          conversationId,
          temperature: 0.5,
          maxTokens: 2048,
        } as unknown as Parameters<typeof PrismService.streamAgentText>[0],
        {
          onChunk: (content: string) => {
            setChatMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + content }
                  : message,
              ),
            );
          },
          onThinking: (thinking: string) => {
            setChatMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, thinking: message.thinking + thinking }
                  : message,
              ),
            );
          },
          onToolCall: (toolCall: ToolCallEvent) => {
            setChatMessages((previousMessages) =>
              previousMessages.map((message) => {
                if (message.id !== assistantMessageId) return message;
                const existingToolCall = message.toolCalls?.find(
                  (toolCallItem: VisionToolCall) => toolCallItem.id === toolCall.id,
                );
                if (existingToolCall) {
                  return {
                    ...message,
                    toolCalls: message.toolCalls!.map((toolCallItem: VisionToolCall) =>
                      toolCallItem.id === toolCall.id ? { ...toolCallItem, ...toolCall } : toolCallItem,
                    ),
                  };
                }
                return {
                  ...message,
                  toolCalls: [...(message.toolCalls || []), toolCall],
                };
              }),
            );
          },
          onDone: () => {
            setChatMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, streaming: false }
                  : message,
              ),
            );
            setIsAgentStreaming(false);
            setActiveMessageId(null);
            syncConversation();
          },
          onError: (error: Error) => {
            setChatMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: message.content + `\n\nError: ${error.message}`,
                      streaming: false,
                    }
                  : message,
              ),
            );
            setIsAgentStreaming(false);
            setActiveMessageId(null);
          },
        },
      );
      abortRef.current = abort;
    } catch (error: unknown) {
      setChatMessages((previousMessages) =>
        previousMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  message.content + `\n\nError: ${error instanceof Error ? error.message : String(error)}`,
                streaming: false,
              }
            : message,
        ),
      );
      setIsAgentStreaming(false);
      setActiveMessageId(null);
    }
  }, [chatInput, chatMessages, settings, conversationId]);

  // -- Model selection --------------------------------------------

  const handleModelSelect = useCallback((provider: string, model: string) => {
    setSettings({ provider, model });
  }, []);

  const handleToggleFavorite = useCallback(async (key: string) => {
    setFavorites((previousFavorites) => {
      if (previousFavorites.includes(key)) {
        PrismService.removeFavorite("model", key).catch(() => {});
        return previousFavorites.filter((favoriteKey) => favoriteKey !== key);
      }
      const [provider, ...rest] = key.split(":");
      PrismService.addFavorite("model", key, {
        provider,
        name: rest.join(":"),
      }).catch(() => {});
      return [...previousFavorites, key];
    });
  }, []);

  // -- Progress ring ----------------------------------------------
  const circumference = 2 * Math.PI * 14; // r=14

  // -- Render -----------------------------------------------------
  return (
    <div className={`vision-page-component ${styles['vision-layout-wrapper']}`}>
      <ThreePanelLayout
        navSidebar={<NavigationSidebarComponent mode="user" />}
        title="Vision"
        leftPanel={
          <div className={styles['panel']}>
            <div className={styles['panel-header']}>
              <Video size={15} className={styles['panel-title-icon']} />
              <span className={styles['panel-title']}>Video Source</span>
              {isAnalyzing && (
                <span className={styles['status-is-active-state']}>
                  <Eye size={10} /> Active
                </span>
              )}
            </div>

            <div className={styles['source-content']}>
              {/* Source type buttons */}
              <div className={styles['source-selector']}>
                {SOURCE_TYPES.map((source) => {
                  const Icon = source.icon;
                  return (
                    <button
                      key={source.key}
                      className={`${styles['source-button']} ${sourceType === source.key ? styles['source-button-element-is-active-state'] : ""}`}
                      onClick={() => handleSourceSelect(source.key)}
                    >
                      <Icon size={14} />
                      {source.label}
                    </button>
                  );
                })}
              </div>

              {/* IP Camera URL input */}
              {sourceType === "ipcam" && (
                <div className={styles['url-input-layout-row']}>
                  <InputComponent
                    type="text"
                    placeholder="rtsp://user:pass@192.168.1.100/stream1 or http://…/mjpeg"
                    value={ipCamUrl}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setIpCamUrl(e.target.value)}
                  />
                  <button
                    className={styles['url-connect-button']}
                    onClick={() => startIpCamera(ipCamUrl)}
                    disabled={!ipCamUrl.trim()}
                  >
                    Connect
                  </button>
                </div>
              )}

              {/* Video preview — single persistent element to avoid ref-swapping race conditions */}
              <div
                className={`${styles['video-container']} ${!isStreaming ? styles['video-container-hidden'] : ""}`}
              >
                <video
                  ref={videoRef}
                  className={styles['video-element']}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={handleVideoMetadata}
                />
                <canvas ref={canvasRef} className={styles['canvas-hidden']} />

                {/* Live indicator */}
                {isStreaming && (
                  <div className={styles['live-indicator']}>
                    <span className={styles['live-dot']} />
                    LIVE
                  </div>
                )}

                {/* Resolution badge */}
                {resolution && (
                  <div className={styles['resolution-badge']}>{resolution}</div>
                )}

                {/* Screenshot flash */}
                {showFlash && <div className={styles['screenshot-flash']} />}

                {/* Analyzing overlay */}
                {isCapturing && (
                  <div className={styles['analyzing-overlay']}>
                    <div className={styles['analyzing-badge']}>
                      <Loader2 size={14} className={styles['spin-icon']} />
                      Analyzing…
                    </div>
                  </div>
                )}

                {/* Snapshot counter */}
                {snapshotCount > 0 && (
                  <div className={styles['snapshot-counter']}>#{snapshotCount}</div>
                )}

                {/* Progress ring */}
                {isAnalyzing && (
                  <div className={styles['capture-progress']}>
                    <svg
                      className={styles['capture-progress-ring']}
                      viewBox="0 0 32 32"
                    >
                      <circle
                        className={styles['capture-progress-track']}
                        cx="16"
                        cy="16"
                        r="14"
                      />
                      <circle
                        className={styles['capture-progress-fill']}
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
                <div className={styles['empty-source']}>
                  <div className={styles['empty-icon']}>
                    <Scan size={36} />
                  </div>
                  <span className={styles['empty-label']}>
                    Select a video source above to begin.
                    <br />
                    Webcam, screen capture, or IP camera.
                  </span>
                </div>
              )}
            </div>
          </div>
        }
        leftTitle="Video Source"
      >
        <div className={styles['panel']}>
          <div className={styles['panel-header']}>
            <Eye size={15} className={styles['panel-title-icon']} />
            <span className={styles['panel-title']}>Vision Center</span>

            <div className={styles['mode-tabs']}>
              <button
                className={`${styles['mode-tab']} ${mode === "analysis" ? styles['mode-tab-is-active-state'] : ""}`}
                onClick={() => setMode("analysis")}
              >
                Analysis
              </button>
              <button
                className={`${styles['mode-tab']} ${mode === "agent" ? styles['mode-tab-is-active-state'] : ""}`}
                onClick={() => setMode("agent")}
              >
                Live Agent
              </button>
            </div>

            {mode === "analysis" && results.length > 0 && (
              <button
                className={styles['clear-button']}
                onClick={() => {
                  setResults([]);
                  setSnapshotCount(0);
                }}
              >
                <Trash2 size={10} /> Clear
              </button>
            )}

            {mode === "agent" && chatMessages.length > 0 && (
              <button
                className={styles['clear-button']}
                onClick={() => setChatMessages([])}
              >
                <Trash2 size={10} /> Reset Chat
              </button>
            )}
          </div>

          {mode === "analysis" ? (
            <div className={styles['analysis-content']}>
              {/* Controls */}
              <div className={styles['controls-bar']}>
                {/* Model picker */}
                <div className={styles['model-picker-wrap']}>
                  <ModelPickerPopoverComponent
                    config={visionConfig}
                    settings={settings}
                    onSelectModel={handleModelSelect}
                    favorites={favorites}
                    onToggleFavorite={handleToggleFavorite}
                    placeholderLabel="Select Vision Model"
                  />
                </div>

                <div className={styles['control-divider']} />

                {/* Interval */}
                <div className={styles['control-group']}>
                  <span className={styles['control-label']}>Every</span>
                  <InputComponent
                    type="number"
                    className={styles['interval-input']}
                    value={intervalSec}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) =>
                      setIntervalSec(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    min={1}
                    max={300}
                    disabled={isAnalyzing}
                  />
                  <span className={styles['unit-label']}>sec</span>
                </div>

                <div className={styles['control-divider']} />

                {/* Start / Stop */}
                {!isAnalyzing ? (
                  <button
                    className={styles['start-button']}
                    onClick={startAnalysis}
                    disabled={
                      !isStreaming || !settings.provider || !settings.model
                    }
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
                  <button className={styles['stop-button']} onClick={stopAnalysis}>
                    <Square size={10} />
                    Stop
                  </button>
                )}
              </div>

              {/* Prompt */}
              <div className={styles['prompt-layout-row']}>
                <TextAreaComponent
                  className={styles['prompt-textarea']}
                  value={prompt}
                  onChange={(
                    e: React.ChangeEvent<HTMLTextAreaElement>,
                  ) => setPrompt(e.target.value)}
                  placeholder="What should the AI look for?"
                  disabled={isAnalyzing}
                  minRows={2}
                />
              </div>

              {/* Results */}
              <div className={styles['results-area']} ref={resultsAreaRef}>
                {results.length === 0 ? (
                  <div className={styles['empty-results']}>
                    <EyeOff size={36} className={styles['empty-results-icon']} />
                    <span className={styles['empty-results-text']}>
                      No analysis results yet.
                      <br />
                      Select a source, pick a model, and press Start.
                    </span>
                  </div>
                ) : (
                  results.map((result) => (
                    <div key={result.id} className={styles['result-card']}>
                      <div className={styles['result-header']}>
                        <span className={styles['result-timestamp']}>
                          {result.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={styles['result-model']}>
                          <ProviderLogo provider={result.provider} size={12} />{" "}
                          {result.model.split("/").pop()}
                        </span>
                      </div>
                      <div className={styles['result-body']}>
                        <img
                          src={result.thumbnail}
                          alt=""
                          className={styles['result-thumb']}
                        />
                        <span
                          className={
                            result.streaming
                              ? styles['result-text-streaming']
                              : styles['result-text']
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
          ) : (
            <div className={styles['agent-content']}>
              {/* Controls */}
              <div className={styles['controls-bar']}>
                {/* Model picker */}
                <div className={styles['model-picker-wrap']}>
                  <ModelPickerPopoverComponent
                    config={visionConfig}
                    settings={settings}
                    onSelectModel={handleModelSelect}
                    favorites={favorites}
                    onToggleFavorite={handleToggleFavorite}
                    placeholderLabel="Select Vision Model"
                  />
                </div>

                <div className={styles['control-divider']} />

                <span className={styles['live-vision-status']}>
                  {isStreaming ? (
                    <span className={styles['live-vision-status-is-active-state']}>
                      <Cpu size={12} /> Feed Streaming
                    </span>
                  ) : (
                    <span className={styles['live-vision-status-inactive']}>
                      Feed Offline
                    </span>
                  )}
                </span>
              </div>

              {/* Chat Messages */}
              <div className={styles['chat-area']} ref={chatAreaRef}>
                {chatMessages.length === 0 ? (
                  <div className={styles['empty-chat']}>
                    <MessageSquare size={36} className={styles['empty-chat-icon']} />
                    <span className={styles['empty-chat-text']}>
                      Start a video feed, select a vision model, and ask the
                      live agent a question!
                      <br />
                      The agent continuously sees your live feed while you
                      converse.
                    </span>
                  </div>
                ) : (
                  chatMessages.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={message.id}
                        className={`${styles['chat-message']} ${isUser ? styles['chat-message-user'] : styles['chat-message-assistant']}`}
                      >
                        <div className={styles['chat-message-header']}>
                          {isUser ? (
                            <span className={styles['chat-message-sender']}>
                              You
                            </span>
                          ) : (
                            <span className={styles['chat-message-sender']}>
                              <Bot size={13} /> Vision Agent
                            </span>
                          )}
                          <span className={styles['chat-message-time']}>
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>

                        <div className={styles['chat-message-body']}>
                          {/* Assistant Thinking Segment */}
                          {!isUser && message.thinking && (
                            <div className={styles['thinking-container']}>
                              <button
                                className={styles['thinking-header']}
                                onClick={() => toggleThinking(message.id)}
                              >
                                <Sparkles
                                  size={11}
                                  className={styles['thinking-icon']}
                                />
                                <span>Agent Reasoning Process</span>
                                <span className={styles['thinking-collapse-toggle']}>
                                  {expandedThinkingIds[message.id]
                                    ? "Hide"
                                    : "Show"}
                                </span>
                              </button>

                              {expandedThinkingIds[message.id] && (
                                <div className={styles['thinking-body']}>
                                  {message.thinking}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Text Message Content */}
                          {message.content && (
                            <div className={styles['message-text']}>
                              {message.content}
                            </div>
                          )}

                          {/* Message Images */}
                          {message.images && message.images.length > 0 && (
                            <div className={styles['chat-message-images']}>
                              {message.images.map((imgUrl: string, index: number) => (
                                <img
                                  key={index}
                                  src={PrismService.getFileUrl(imgUrl)}
                                  alt="Analyzed frame"
                                  className={styles['chat-message-image']}
                                />
                              ))}
                            </div>
                          )}

                          {/* Streaming cursor */}
                          {!isUser && message.streaming && !message.content && (
                            <div className={styles['agent-is-loading-state-text']}>
                              <Loader2 size={12} className={styles['spin-icon']} />{" "}
                              Thinking...
                            </div>
                          )}

                          {/* Tool calls execution status */}
                          {!isUser &&
                            message.toolCalls &&
                            message.toolCalls.length > 0 && (
                              <div className={styles['chat-tool-calls']}>
                                {message.toolCalls.map(
                                  (toolCallItem: VisionToolCall, index: number) => (
                                    <div
                                      key={index}
                                      className={styles['chat-tool-call-badge']}
                                    >
                                      <Cpu size={10} />
                                      <span>{toolCallItem.name}</span>
                                      {toolCallItem.status === "calling" && (
                                        <span
                                          className={styles['tool-status-running']}
                                        >
                                          running
                                        </span>
                                      )}
                                      {toolCallItem.status === "done" && (
                                        <span className={styles['tool-status-done']}>
                                          done
                                        </span>
                                      )}
                                      {toolCallItem.status === "error" && (
                                        <span
                                          className={styles['tool-status-error']}
                                        >
                                          error
                                        </span>
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input Row */}
              <div className={styles['chat-input-layout-row']}>
                <TextAreaComponent
                  className={styles['chat-input']}
                  value={chatInput}
                  onChange={(
                    e: React.ChangeEvent<HTMLTextAreaElement>,
                  ) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChatMessage();
                    }
                  }}
                  placeholder="Tell the agent what to check, e.g., 'What changes do you see?' or 'Make this web page design...'"
                  disabled={isAgentStreaming || !settings.model}
                  minRows={2}
                />
                <button
                  className={styles['send-button']}
                  onClick={handleSendChatMessage}
                  disabled={
                    !chatInput.trim() || isAgentStreaming || !settings.model
                  }
                >
                  {isAgentStreaming ? (
                    <Loader2 size={14} className={styles['spin-icon']} />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </ThreePanelLayout>
    </div>
  );
}
