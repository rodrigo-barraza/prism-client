"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import type { SetupState } from "./ThreeCanvasComponent";
import type { TickState } from "../services/ThreeService";
import type {
  ThreeAnimationFactory,
  ThreeAnimationHandle,
} from "../services/three-animations";
import styles from "./ThreeBackgroundComponent.module.css";

export interface ThreeBackgroundComponentProps<TOptions> {
  /** Animation preset factory (see src/services/three-animations). */
  animation: ThreeAnimationFactory<TOptions>;
  /** Preset options — captured at mount; remount with a `key` to rebuild. */
  options: TOptions;
  /**
   * Drawing-buffer resolution cap. Backgrounds default to 1 (never render
   * at retina DPR) — full-screen raymarch cost scales with pixel count.
   */
  maxPixelRatio?: number;
  /** Render-rate cap. Slow ambient scenes don't need display rate. */
  maxFps?: number;
  paused?: boolean;
  /** Receives the live preset handle for setParameter calls. */
  handleRef?: MutableRefObject<ThreeAnimationHandle | null>;
  className?: string;
}

/**
 * ThreeBackgroundComponent — full-bleed sibling of ThreeAnimationComponent.
 *
 * Where ThreeAnimationComponent frames a fixed-size hero object with bleed
 * margins, this fills its nearest positioned ancestor edge-to-edge and is
 * meant for ambient scene backdrops (skies, weather, atmospheres).
 *
 * Behavior:
 *   - renders nothing until mounted client-side AND WebGL2 is available,
 *     so callers should paint a CSS gradient fallback behind it
 *   - fades the canvas in after the first rendered frame (no pop-in while
 *     shaders compile)
 *   - pauses the render loop when scrolled offscreen or `paused`
 *   - honors prefers-reduced-motion: the preset gets `reducedMotion: true`
 *     (static pose) and the loop idles once the first frames settle
 */
export default function ThreeBackgroundComponent<TOptions>({
  animation,
  options,
  maxPixelRatio = 1,
  maxFps = 30,
  paused = false,
  handleRef,
  className = "",
}: ThreeBackgroundComponentProps<TOptions>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const internalHandleRef = useRef<ThreeAnimationHandle | null>(null);
  const firstFrameRef = useRef(false);
  const [canRender, setCanRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isOffscreen, setIsOffscreen] = useState(false);
  const [isReducedIdle, setIsReducedIdle] = useState(false);

  // Captured once — presets are mount-once by contract
  const mountPropsRef = useRef({ animation, options, handleRef });
  useEffect(() => {
    mountPropsRef.current = { animation, options, handleRef };
  });

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Mount gate: avoids SSR/hydration mismatch and skips devices without
  // WebGL2 entirely (the CSS fallback behind us stays visible). Probed a
  // frame after mount so it stays off the critical render path.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2");
      if (gl) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        setCanRender(true);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Reduced motion renders a static frame — idle the loop once settled
  useEffect(() => {
    if (!prefersReducedMotion || !canRender) return;
    const timerId = setTimeout(() => setIsReducedIdle(true), 2500);
    return () => clearTimeout(timerId);
  }, [prefersReducedMotion, canRender]);

  // Offscreen pause — backgrounds are big GPU consumers
  useEffect(() => {
    if (!canRender || typeof IntersectionObserver === "undefined") return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        setIsOffscreen(!entry.isIntersecting);
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [canRender]);

  const handleSetup = (state: SetupState) => {
    const mountProps = mountPropsRef.current;
    const presetHandle = mountProps.animation(
      {
        scene: state.scene,
        camera: state.camera,
        renderer: state.renderer,
        THREE: state.THREE,
        contentScale: 1,
        reducedMotion: prefersReducedMotion,
      },
      mountProps.options,
    );

    internalHandleRef.current = presetHandle;
    if (mountProps.handleRef) mountProps.handleRef.current = presetHandle;

    return () => {
      presetHandle.dispose?.();
      internalHandleRef.current = null;
      if (mountProps.handleRef) mountProps.handleRef.current = null;
    };
  };

  const handleTick = (state: TickState) => {
    internalHandleRef.current?.update?.(state);
    if (!firstFrameRef.current) {
      firstFrameRef.current = true;
      setIsVisible(true);
    }
  };

  return (
    <div ref={wrapperRef} className={`${styles['background']} ${className}`} aria-hidden>
      {canRender && (
        <div
          className={`${styles['canvas-layer']} ${isVisible ? styles['visible'] : ""}`}
        >
          <ThreeCanvasComponent
            onSetup={handleSetup}
            onTick={handleTick}
            alpha={false}
            antialias={false}
            toneMapping="None"
            maxPixelRatio={maxPixelRatio}
            maxFps={maxFps}
            paused={paused || isOffscreen || isReducedIdle}
          />
        </div>
      )}
    </div>
  );
}
