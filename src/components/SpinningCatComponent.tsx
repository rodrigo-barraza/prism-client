"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { parseGIF, decompressFrames } from "gifuct-js";
import { useLocalStorage } from "@rodrigo-barraza/components-library";
import styles from "./SpinningCatComponent.module.css";

/**
 * SpinningCatComponent — Shows cat.gif (static) by default.
 * During generation, switches to a canvas-rendered cat-spinning.gif
 * with quadratic speed acceleration (starts at ~20% speed, ramps up).
 * When generation stops, the cat smoothly decelerates before swapping
 * back to the static image.
 *
 * GIF frames are pre-decoded into ImageBitmap textures at mount time,
 * enabling GPU-composited drawImage calls during playback instead of
 * per-frame putImageData CPU blits.
 *
 * Props:
 *   animate  – whether the cat is spinning (default false)
 *   className – optional extra class
 */

interface DecodedFrame {
  dims: { width: number; height: number; left: number; top: number };
  disposalType: number;
  delay: number;
  patch: ArrayBuffer;
}

interface AnimationState {
  frameIndex: number;
  elapsed: number;
  accelTime: number;
  speedMultiplier: number;
  lastTimestamp: number;
  windingDown: boolean;
}

const BASE_SPEED = 0.2; // Start at 20% of original GIF speed
const ACCEL_COEFFICIENT = 0.08; // Quadratic ramp: speedMultiplier = BASE_SPEED + ACCEL × t²
const DECEL_SMOOTHING = 0.03; // Exponential decay back to base when stopping
const SETTLED_THRESHOLD = 0.01; // Speed delta below which we consider fully stopped
const MAX_SPEED_FOR_FX = 5; // Speed at which scale/glow effects reach full intensity
const MAX_SCALE = 1.5; // Maximum scale multiplier
const MAX_BRIGHTNESS = 3.0; // Maximum CSS brightness value
const MAX_GLOW_RADIUS = 12; // Maximum glow drop-shadow blur radius (px)
const MAX_GLOW_OPACITY = 0.9; // Maximum glow drop-shadow opacity

/**
 * Render a single pre-decoded ImageBitmap frame onto the canvas.
 * GPU-composited — no pixel data manipulation at draw time.
 */
function renderFrame(
  canvas: HTMLCanvasElement | null,
  frames: DecodedFrame[],
  bitmaps: ImageBitmap[],
  index: number,
) {
  if (!canvas || !bitmaps?.length) return;

  const context = canvas.getContext("2d");
  if (!context) return;
  const frame = frames[index];
  const bitmap = bitmaps[index];
  if (!frame || !bitmap) return;

  if (frame.disposalType === 2) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(bitmap, frame.dims.left, frame.dims.top);
}

const AVATAR_MAP: Record<string, string> = {
  cat: "/cat.gif",
  rocky: "/avatars/rocky.png",
  taz: "/avatars/taz.jpg",
  peon: "/avatars/peon.png",
  "blademaster-classic": "/avatars/blademaster-classic.png",
  "blademaster-hidef": "/avatars/blademaster-hidef.png",
};

export default function SpinningCatComponent({
  animate = false,
  className = "",
}: {
  animate?: boolean;
  className?: string;
}) {
  const [avatar, setAvatar] = useLocalStorage<string>("prism:avatar", "cat");

  useEffect(() => {
    const handleAvatarChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail) {
        setAvatar(customEvent.detail);
      }
    };
    window.addEventListener("prism-avatar-changed", handleAvatarChange);
    return () => {
      window.removeEventListener("prism-avatar-changed", handleAvatarChange);
    };
  }, [setAvatar]);

  const avatarSrc = AVATAR_MAP[avatar] || "/cat.gif";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<DecodedFrame[] | null>(null);
  const bitmapsRef = useRef<ImageBitmap[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isClickSpinningRef = useRef(false);
  const [isClickSpinning, setIsClickSpinning] = useState(false);
  // visuallyActive stays true during the wind-down deceleration
  const [visuallyActive, setVisuallyActive] = useState(false);
  const stateRef = useRef<AnimationState>({
    frameIndex: 0,
    elapsed: 0,
    accelTime: 0,
    speedMultiplier: BASE_SPEED,
    lastTimestamp: 0,
    windingDown: false,
  });
  const animateRef = useRef<boolean>(animate);

  useEffect(() => {
    animateRef.current = animate;
    if (animate) {
      setVisuallyActive(true);
      stateRef.current.windingDown = false;
    } else if (
      stateRef.current.speedMultiplier >
      BASE_SPEED + SETTLED_THRESHOLD
    ) {
      // Start wind-down — keep canvas visible
      stateRef.current.windingDown = true;
    }
  }, [animate]);

  // -- Decode the spinning GIF into ImageBitmap textures on mount --
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/cat-spinning.gif");
        const buffer = await response.arrayBuffer();
        const gif = parseGIF(buffer);
        const frames = decompressFrames(gif, true);
        if (cancelled) return;

        // Pre-decode every frame into a GPU-ready ImageBitmap
        const bitmaps = await Promise.all(
          frames.map((frame) => {
            const imageData = new ImageData(
              new Uint8ClampedArray(frame.patch),
              frame.dims.width,
              frame.dims.height,
            );
            return createImageBitmap(imageData);
          }),
        );
        if (cancelled) {
          bitmaps.forEach((current) => current.close());
          return;
        }

        framesRef.current = frames as unknown as DecodedFrame[];
        bitmapsRef.current = bitmaps;

        const canvas = canvasRef.current;
        if (canvas && frames.length > 0) {
          canvas.width = frames[0].dims.width;
          canvas.height = frames[0].dims.height;
          renderFrame(canvas, frames as unknown as DecodedFrame[], bitmaps, 0);
        }
      } catch (error: unknown) {
        console.error("SpinningCatComponent: failed to decode GIF", error);
      }
    })();

    return () => {
      cancelled = true;
      // Release ImageBitmap GPU resources on unmount
      bitmapsRef.current?.forEach((current) => current.close());
      bitmapsRef.current = null;
    };
  }, []);

  // -- Main animation loop (always running, speed-controlled) ---
  const tickRef = useRef<((now: number) => void) | null>(null);

  useEffect(() => {
    const loop = (now: number) => {
      const frames = framesRef.current;
      const bitmaps = bitmapsRef.current;

      // Refs not populated yet — GIF still decoding, retry next frame
      if (!frames?.length || !bitmaps?.length) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const currentState = stateRef.current;
      if (!currentState.lastTimestamp) currentState.lastTimestamp = now;
      const deltaTime = now - currentState.lastTimestamp;
      currentState.lastTimestamp = now;

      if (animateRef.current) {
        currentState.accelTime += deltaTime / 1000;
        currentState.speedMultiplier =
          BASE_SPEED +
          ACCEL_COEFFICIENT * currentState.accelTime * currentState.accelTime;
      } else if (
        currentState.speedMultiplier >
        BASE_SPEED + SETTLED_THRESHOLD
      ) {
        currentState.accelTime = 0;
        const smoothing = 1 - Math.pow(1 - DECEL_SMOOTHING, deltaTime / 16.67);
        currentState.speedMultiplier +=
          (BASE_SPEED - currentState.speedMultiplier) * smoothing;
      } else if (currentState.windingDown) {
        currentState.speedMultiplier = BASE_SPEED;
        currentState.accelTime = 0;
        currentState.windingDown = false;
        setVisuallyActive(false);
        // Reset inline FX styles
        const wrapper = canvasRef.current?.parentElement;
        if (wrapper) {
          wrapper.style.transform = "translate(-50%, -50%)";
          wrapper.style.filter = "";
        }
      }

      const frame = frames[currentState.frameIndex];
      if (!frame) {
        currentState.frameIndex = 0;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const baseDelay = frame.delay || 100;
      const effectiveDelay = baseDelay / currentState.speedMultiplier;

      currentState.elapsed += deltaTime;

      if (currentState.elapsed >= effectiveDelay) {
        currentState.elapsed = 0;
        currentState.frameIndex = (currentState.frameIndex + 1) % frames.length;

        if (currentState.frameIndex === 0) {
          const canvas = canvasRef.current;
          if (canvas) {
            const context = canvas.getContext("2d");
            context?.clearRect(0, 0, canvas.width, canvas.height);
          }
        }

        renderFrame(
          canvasRef.current,
          frames,
          bitmaps,
          currentState.frameIndex,
        );
      }

      // -- Compute visual FX intensity (0 → 1) --
      if (
        animateRef.current ||
        currentState.windingDown ||
        currentState.speedMultiplier > BASE_SPEED + SETTLED_THRESHOLD
      ) {
        const intensity = Math.min(
          (currentState.speedMultiplier - BASE_SPEED) /
            (MAX_SPEED_FOR_FX - BASE_SPEED),
          1,
        );
        const scale = 1 + intensity * (MAX_SCALE - 1);
        const brightness = 1 + intensity * (MAX_BRIGHTNESS - 1);
        const glowRadius = intensity * MAX_GLOW_RADIUS;
        const glowOpacity = intensity * MAX_GLOW_OPACITY;

        const wrapper = canvasRef.current?.parentElement;
        if (wrapper) {
          wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
          wrapper.style.filter = `brightness(${brightness}) drop-shadow(0 0 ${glowRadius}px rgba(255,255,255,${glowOpacity}))`;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    tickRef.current = loop;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /**
   * Synthesize a short "meow" via Web Audio API —
   * two overlapping frequency-swept oscillators with
   * an amplitude envelope to mimic a cat vocalization.
   */
  const synthesizeMeow = useCallback(() => {
    const audioContext = new AudioContext();
    const currentTime = audioContext.currentTime;

    const primaryOscillator = audioContext.createOscillator();
    primaryOscillator.type = "sine";
    primaryOscillator.frequency.setValueAtTime(700, currentTime);
    primaryOscillator.frequency.exponentialRampToValueAtTime(1200, currentTime + 0.15);
    primaryOscillator.frequency.exponentialRampToValueAtTime(900, currentTime + 0.35);
    primaryOscillator.frequency.exponentialRampToValueAtTime(600, currentTime + 0.5);

    const harmonicOscillator = audioContext.createOscillator();
    harmonicOscillator.type = "triangle";
    harmonicOscillator.frequency.setValueAtTime(1400, currentTime);
    harmonicOscillator.frequency.exponentialRampToValueAtTime(2400, currentTime + 0.15);
    harmonicOscillator.frequency.exponentialRampToValueAtTime(1800, currentTime + 0.35);
    harmonicOscillator.frequency.exponentialRampToValueAtTime(1200, currentTime + 0.5);

    const primaryGain = audioContext.createGain();
    primaryGain.gain.setValueAtTime(0, currentTime);
    primaryGain.gain.linearRampToValueAtTime(0.25, currentTime + 0.05);
    primaryGain.gain.linearRampToValueAtTime(0.3, currentTime + 0.15);
    primaryGain.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.5);

    const harmonicGain = audioContext.createGain();
    harmonicGain.gain.setValueAtTime(0, currentTime);
    harmonicGain.gain.linearRampToValueAtTime(0.08, currentTime + 0.05);
    harmonicGain.gain.linearRampToValueAtTime(0.1, currentTime + 0.15);
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.5);

    primaryOscillator.connect(primaryGain);
    primaryGain.connect(audioContext.destination);
    harmonicOscillator.connect(harmonicGain);
    harmonicGain.connect(audioContext.destination);

    primaryOscillator.start(currentTime);
    harmonicOscillator.start(currentTime);
    primaryOscillator.stop(currentTime + 0.55);
    harmonicOscillator.stop(currentTime + 0.55);

    setTimeout(() => audioContext.close(), 600);
  }, []);

  const handleClick = useCallback(() => {
    if (isClickSpinningRef.current) return;
    isClickSpinningRef.current = true;
    setIsClickSpinning(true);
    synthesizeMeow();

    setTimeout(() => {
      isClickSpinningRef.current = false;
      setIsClickSpinning(false);
    }, 1000);
  }, [synthesizeMeow]);

  const clickSpinClassName = isClickSpinning
    ? styles["is-click-spinning-state"]
    : "";

  return (
    <div
      ref={wrapperRef}
      className={`spinning-cat-component ${styles['wrapper']} ${clickSpinClassName} ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Click the cat to meow"
    >
      <img
        src={avatarSrc}
        alt="Avatar"
        className={`${styles['static-cat']} ${visuallyActive ? styles['is-hidden-state'] : ""}`}
        style={avatar !== "cat" ? { imageRendering: "auto" } : undefined}
      />
      <canvas
        ref={canvasRef}
        className={`${styles['canvas']} ${visuallyActive ? "" : styles['is-hidden-state']}`}
      />
    </div>
  );
}
