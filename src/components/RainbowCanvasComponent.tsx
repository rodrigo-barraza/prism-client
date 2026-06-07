"use client";

import { useRef, useEffect, useCallback } from "react";
import { RAINBOW, paletteAt, type RgbTriplet } from "../utils/rainbow";

/** 8-bit dithered rainbow — auto-animates, turbo during LLM generation */
const PIXEL_SIZE = 6;
const BASE_SPEED = 30; // degrees/sec
const TURBO_ACCEL = 20; // quadratic coefficient — velocity = TURBO_ACCEL × t²
const TURBO_RELEASE = 0.02; // per-frame smoothing toward zero (at 60fps ≈ 3s wind-down)

interface RainbowCanvasComponentProps {
  turbo?: boolean;
  animate?: boolean;
  greyscale?: boolean;
  palette?: RgbTriplet[];
  className?: string;
  style?: React.CSSProperties;
}

interface RainbowAnimationState {
  offset: number;
  turboVelocity: number;
  turboTime: number;
  lastTime: number;
}

export default function RainbowCanvasComponent({
  turbo = false,
  animate = false,
  greyscale = false,
  palette,
  className,
  style,
}: RainbowCanvasComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RainbowAnimationState>({
    offset: 0,
    turboVelocity: 0,
    turboTime: 0,
    lastTime: 0,
  });
  const turboRef = useRef<boolean>(turbo);
  const animateRef = useRef<boolean>(animate);
  const paletteRef = useRef<RgbTriplet[] | null>(palette || null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    turboRef.current = turbo;
  }, [turbo]);

  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const { width, height } = canvas;
    const columnCount = Math.ceil(width / PIXEL_SIZE);
    const rows = Math.ceil(height / PIXEL_SIZE);
    const animationState = stateRef.current;
    const colors = paletteRef.current || RAINBOW;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columnCount; x++) {
        const huePosition =
          (x / columnCount + y / rows) * 0.5 + animationState.offset / 360;
        const dither = ((x * 7 + y * 13) % 5) / 40;
        const [r, g, b] = paletteAt(colors, huePosition + dither);
        context.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        context.fillRect(
          x * PIXEL_SIZE,
          y * PIXEL_SIZE,
          PIXEL_SIZE,
          PIXEL_SIZE,
        );
      }
    }
  }, []);

  // Sync palette ref and redraw static canvases on palette change
  useEffect(() => {
    paletteRef.current = palette || null;
    if (!rafRef.current) draw();
  }, [palette, draw]);

  // Start/stop animation loop based on turbo or animate prop
  useEffect(() => {
    const shouldRun = turbo || animate;
    if (!shouldRun && !rafRef.current) return;

    if (shouldRun && !rafRef.current) {
      stateRef.current.lastTime = 0;
      const tick = (now: number) => {
        const animationState = stateRef.current;
        if (!animationState.lastTime) animationState.lastTime = now;
        const dt = (now - animationState.lastTime) / 1000;
        animationState.lastTime = now;

        if (turboRef.current) {
          animationState.turboTime += dt;
          animationState.turboVelocity =
            TURBO_ACCEL * animationState.turboTime * animationState.turboTime;
        } else if (animationState.turboVelocity > 0.5) {
          animationState.turboTime = 0;
          const smoothing = 1 - Math.pow(1 - TURBO_RELEASE, dt * 60);
          animationState.turboVelocity +=
            (0 - animationState.turboVelocity) * smoothing;
        } else if (animateRef.current) {
          // Idle animation — constant slow speed, no turbo deceleration
          animationState.turboVelocity = 0;
          animationState.turboTime = 0;
        } else {
          animationState.turboVelocity = 0;
          animationState.turboTime = 0;
          draw();
          rafRef.current = null;
          return;
        }

        const speed = BASE_SPEED + animationState.turboVelocity;
        animationState.offset = (animationState.offset + speed * dt) % 360;
        draw();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [turbo, animate, draw]);

  // Resize handling + initial static draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      draw();
    };

    resize();
    window.addEventListener("resize", resize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(parent);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
    };
  }, [draw]);

  const canvasStyle = {
    ...style,
    filter: greyscale ? "grayscale(1)" : "none",
    transition: "filter 0.6s ease",
    willChange: "filter",
  };

  return <canvas ref={canvasRef} className={`rainbow-canvas-component ${className || ""}`} style={canvasStyle} />;
}
