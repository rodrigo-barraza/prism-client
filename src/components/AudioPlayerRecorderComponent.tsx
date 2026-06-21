"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic2,
  Volume2,
  VolumeX,
  Square,
  Play,
  Pause,
  Download,
  X,
  Radio,
} from "lucide-react";
import {
  SliderComponent,
  TooltipComponent,
} from "@rodrigo-barraza/components-library";
import RainbowCanvasComponent from "./RainbowCanvasComponent";
import styles from "./AudioPlayerRecorderComponent.module.css";

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const BAR_WIDTH = 1.5;
const BAR_GAP = 1;

/* -- Draw waveform bars on a canvas -- */
function drawBars(
  canvas: HTMLCanvasElement,
  peaks: number[],
  progress: number,
  playedColor: string,
  unplayedColor: string,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  context.clearRect(0, 0, canvasWidth, canvasHeight);

  const totalBars = Math.floor(canvasWidth / (BAR_WIDTH + BAR_GAP));
  const mid = canvasHeight / 2;

  for (let i = 0; i < totalBars; i++) {
    const peakIndex = Math.floor((i / totalBars) * peaks.length);
    const amp = peaks[peakIndex] ?? 0;
    const barH = Math.max(2, amp * (canvasHeight * 0.8));

    context.fillStyle = i / totalBars <= progress ? playedColor : unplayedColor;
    context.fillRect(
      i * (BAR_WIDTH + BAR_GAP),
      mid - barH / 2,
      BAR_WIDTH,
      barH,
    );
  }
}

/* -- Decode audio src into peaks + true duration -- */
async function decodePeaks(
  sourceUrl: string,
  numberOfPeaks = 200,
): Promise<{ peaks: number[]; duration: number | null }> {
  try {
    const response = await fetch(sourceUrl);
    const buffer = await response.arrayBuffer();
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioContextClass();
    const decoded = await audioContext.decodeAudioData(buffer);
    await audioContext.close();

    const trueDuration = decoded.duration;
    const raw = decoded.getChannelData(0);
    const blockSize = Math.floor(raw.length / numberOfPeaks);
    const peaks = [];
    for (let i = 0; i < numberOfPeaks; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(raw[i * blockSize + j]);
      }
      peaks.push(sum / blockSize);
    }
    const max = Math.max(...peaks, 0.01);
    return { peaks: peaks.map((peak) => peak / max), duration: trueDuration };
  } catch {
    return { peaks: new Array(numberOfPeaks).fill(0.15), duration: null };
  }
}

/**
 * Dual-mode audio component:
 * - Playback: pass `src` → custom waveform player
 * - Recorder: pass `onRecordingComplete` → mic button / recording UI
 */
export interface AudioPlayerRecorderProps {
  sourceUrl?: string | null;
  onRecordingComplete?: (data: string | ArrayBuffer | null) => void;
  onRemove?: () => void;
  compact?: boolean;
  square?: boolean;
  streaming?: boolean;
}

export default function AudioPlayerRecorderComponent({
  sourceUrl,
  onRecordingComplete,
  onRemove,
  compact = false,
  square = false,
  streaming = false,
}: AudioPlayerRecorderProps) {
  // --- Recorder state ---
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recPeaksRef = useRef<number[]>([]);

  // --- Player state ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const playAnimRef = useRef<number | null>(null);
  const previousSourceUrlRef = useRef<string | null | undefined>(sourceUrl);

  // -- Reset player state when src changes (prevents stale audio across conversations) --
  useEffect(() => {
    if (previousSourceUrlRef.current !== sourceUrl) {
      previousSourceUrlRef.current = sourceUrl;
      // Fully reset player state
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setPeaks(null);
      // Reset the HTMLAudioElement to prevent zombie paused state
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        // Force reload when src changes to clear internal media state
        audio.load();
      }
    }
  }, [sourceUrl]);

  // -- Cleanup on unmount — stop any playing audio --
  useEffect(() => {
    const audio = audioRef.current;
    const animRef = playAnimRef;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // -- Decode audio for playback waveform + true duration --
  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    decodePeaks(sourceUrl).then(({ peaks: decodedPeaks, duration: decodedDuration }) => {
      if (cancelled) return;
      setPeaks(decodedPeaks);
      // Use decoded duration as source of truth (WebM metadata often reports Infinity)
      if (decodedDuration != null && Number.isFinite(decodedDuration) && decodedDuration > 0) setDuration(decodedDuration);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  // -- Draw / redraw player waveform --
  const redrawPlayer = useCallback(() => {
    const canvas = playerCanvasRef.current;
    if (!canvas || !peaks) return;
    const progress = duration > 0 ? currentTime / duration : 0;
    drawBars(canvas, peaks, progress, "#888888", "#333333");
  }, [peaks, currentTime, duration]);

  useEffect(() => {
    redrawPlayer();
  }, [redrawPlayer]);

  // -- Smooth playback animation --
  useEffect(() => {
    if (!isPlaying) {
      if (playAnimRef.current) cancelAnimationFrame(playAnimRef.current);
      return;
    }
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      playAnimRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (playAnimRef.current) cancelAnimationFrame(playAnimRef.current);
    };
  }, [isPlaying]);

  // -- Recorder: waveform --
  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const drawLiveWaveform = useCallback(() => {
    const canvas = recCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const maxBars = Math.floor(canvas.width / (BAR_WIDTH + BAR_GAP));
    let frameCount = 0;

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Only sample a new peak every ~4 frames (~15 peaks/sec at 60fps)
      frameCount++;
      if (frameCount % 4 === 0) {
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalizedSample = (dataArray[i] - 128) / 128;
          sum += normalizedSample * normalizedSample;
        }
        const rms = Math.sqrt(sum / bufferLength);
        // Amplify heavily and add a small noise floor
        const peak = Math.min(1, Math.max(0.05, rms * 8));

        recPeaksRef.current.push(peak);
        if (recPeaksRef.current.length > maxBars) {
          recPeaksRef.current = recPeaksRef.current.slice(-maxBars);
        }
      }

      // Redraw every frame for smoothness
      const context = canvas.getContext("2d");
      if (!context) return;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      const currentPeaks = recPeaksRef.current;
      const mid = canvasHeight / 2;
      const startX = mid - currentPeaks.length * (BAR_WIDTH + BAR_GAP);
      for (let i = 0; i < currentPeaks.length; i++) {
        const amp = currentPeaks[i];
        const barH = Math.max(2, amp * (canvasHeight * 0.85));
        context.fillStyle = "#ef4444";
        context.fillRect(
          startX + i * (BAR_WIDTH + BAR_GAP),
          mid - barH / 2,
          BAR_WIDTH,
          barH,
        );
      }
    };
    draw();
  }, []);

  useEffect(() => {
    if (isRecording && analyserRef.current) drawLiveWaveform();
    return () => {
      if (!isRecording) stopWaveform();
    };
  }, [isRecording, drawLiveWaveform, stopWaveform]);

  useEffect(() => {
    if (isRecording) {
      recTimerRef.current = setInterval(() => {
        setRecSeconds((state) => state + 1);
      }, 1000);
    } else {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    }
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setRecSeconds(0);
      recPeaksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
          onRecordingComplete?.(
            readerEvent.target?.result as string | ArrayBuffer | null,
          );
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      // Microphone permission denied or unavailable
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    stopWaveform();
  };

  // -- Player helpers --
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  };

  const handleCanvasSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = playerCanvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const handleDownload = () => {
    if (!sourceUrl) return;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = sourceUrl;
    downloadAnchor.download = "audio.webm";
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  // -------------------------------------------
  // MODE: Streaming (live audio indicator)
  // -------------------------------------------
  if (streaming && !sourceUrl) {
    return (
      <div
        className={`${styles['audio-thumb']} ${styles['audio-streaming']} ${compact ? styles['audio-compact'] : ""}`}
      >
        <div className={styles['streaming-canvas-wrap']}>
          <RainbowCanvasComponent turbo className={styles['streaming-canvas']} />
        </div>
        <div className={styles['streaming-overlay']}>
          <div className={styles['streaming-icon']}>
            <Radio size={14} />
          </div>
          <div className={styles['streaming-bars']}>
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className={styles['streaming-bar']}
                style={{ animationDelay: `${(i * 0.07).toFixed(2)}s` }}
              />
            ))}
          </div>
          <span className={styles['streaming-label']}>Playing audio…</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------
  // MODE: Playback
  // -------------------------------------------
  if (sourceUrl) {
    if (square) {
      return (
        <div
          className={styles['audio-square']}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <audio
            ref={audioRef}
            src={sourceUrl || ""}
            preload="metadata"
            onLoadedMetadata={(e: React.SyntheticEvent<HTMLAudioElement>) => {
              const audioDuration = e.currentTarget.duration;
              if (Number.isFinite(audioDuration)) setDuration(audioDuration);
            }}
            onDurationChange={(e: React.SyntheticEvent<HTMLAudioElement>) => {
              const audioDuration = e.currentTarget.duration;
              if (Number.isFinite(audioDuration)) setDuration(audioDuration);
            }}
            onTimeUpdate={(e: React.SyntheticEvent<HTMLAudioElement>) =>
              setCurrentTime(e.currentTarget.currentTime || 0)
            }
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            hidden
          />

          <div className={styles['square-wave-wrap']} onClick={handleCanvasSeek}>
            <canvas
              ref={playerCanvasRef}
              className={styles['square-wave-canvas']}
              width={200}
              height={100}
            />
          </div>

          <div className={styles['square-controls']}>
            <button
              type="button"
              className={styles['play-button']}
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={10} /> : <Play size={10} />}
            </button>
            <span className={styles['timer']}>
              {formatTime(currentTime)}/{formatTime(duration)}
            </span>
            <button
              type="button"
              className={styles['icon-button']}
              onClick={toggleMute}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div
        className={`${styles['audio-thumb']} ${compact ? styles['audio-compact'] : ""}`}
      >
        <audio
          ref={audioRef}
          src={sourceUrl || ""}
          preload="metadata"
          onLoadedMetadata={(e: React.SyntheticEvent<HTMLAudioElement>) => {
            const audioDuration = e.currentTarget.duration;
            if (Number.isFinite(audioDuration)) setDuration(audioDuration);
          }}
          onDurationChange={(e: React.SyntheticEvent<HTMLAudioElement>) => {
            const audioDuration = e.currentTarget.duration;
            if (Number.isFinite(audioDuration)) setDuration(audioDuration);
          }}
          onTimeUpdate={(e: React.SyntheticEvent<HTMLAudioElement>) =>
            setCurrentTime(e.currentTarget.currentTime || 0)
          }
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          hidden
        />

        <button
          type="button"
          className={styles['play-button']}
          onClick={togglePlayback}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={11} /> : <Play size={11} />}
        </button>

        <div className={styles['waveform-wrap']} onClick={handleCanvasSeek}>
          <canvas
            ref={playerCanvasRef}
            className={styles['waveform-canvas']}
            width={300}
            height={28}
          />
        </div>

        <span className={styles['timer']}>
          {formatTime(currentTime)}/{formatTime(duration)}
        </span>

        <button
          type="button"
          className={styles['icon-button']}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>

        <div className={styles['volume-slider-wrap']}>
          <SliderComponent
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(value: number) => {
              setVolume(value);
              setMuted(value === 0);
              if (audioRef.current) {
                audioRef.current.volume = value;
                audioRef.current.muted = value === 0;
              }
            }}
          />
        </div>

        <button
          type="button"
          className={styles['icon-button']}
          onClick={handleDownload}
          title="Download"
        >
          <Download size={14} />
        </button>

        {onRemove && (
          <button
            type="button"
            className={styles['icon-button']}
            onClick={onRemove}
            title="Remove"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  // -------------------------------------------
  // MODE: Recording (active)
  // -------------------------------------------
  if (isRecording) {
    return (
      <div className={`${styles['audio-thumb']} ${styles['audio-recording']}`}>
        <button
          type="button"
          className={styles['stop-button']}
          onClick={stopRecording}
          title="Stop recording"
        >
          <Square size={10} />
        </button>

        <div className={styles['waveform-wrap']}>
          <canvas
            ref={recCanvasRef}
            className={styles['waveform-canvas']}
            width={300}
            height={28}
          />
        </div>

        <span className={styles['recording-timer']}>{formatTime(recSeconds)}</span>

        <Volume2 size={14} className={styles['faded-icon']} />
        <div className={styles['faded-slider']} />
        <Download size={14} className={styles['faded-icon']} />
        <X size={14} className={styles['faded-icon']} />
      </div>
    );
  }

  // -------------------------------------------
  // MODE: Idle (mic button)
  // -------------------------------------------
  return (
    <TooltipComponent label="Record audio" position="top" trigger="hover">
      <button
        type="button"
        className={`audio-player-recorder-component ${styles['mic-button']}`}
        onClick={startRecording}
        aria-label="Record Audio"
      >
        <Mic2 size={18} />
      </button>
    </TooltipComponent>
  );
}
