"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import type { SetupState } from "./ThreeCanvasComponent";
import type { TickState } from "../services/ThreeService";
import type {
  ThreeAnimationFactory,
  ThreeAnimationHandle,
} from "../services/three-animations";

export interface ThreeAnimationComponentProps<TOptions> {
  /** Animation preset factory (see src/services/three-animations). */
  animation: ThreeAnimationFactory<TOptions>;
  /**
   * Preset options — captured at mount. To rebuild with new options,
   * remount with a `key`. For live updates use the handle's setParameter.
   */
  options: TOptions;
  /** Layout size of the content box in pixels (the canvas renders larger). */
  size: number;
  /**
   * Extra transparent canvas margin per side, as a fraction of `size`.
   * Gives motion (wobble, overshoot, tilt) room to draw outside the
   * layout box so the animation is never clipped. 0 disables bleed.
   */
  bleed?: number;
  paused?: boolean;
  /** Pause the render loop while the element is out of the viewport. */
  pauseWhenOffscreen?: boolean;
  /** Receives the live preset handle for setParameter calls. */
  handleRef?: MutableRefObject<ThreeAnimationHandle | null>;
  className?: string;
  style?: CSSProperties;
}

/**
 * ThreeAnimationComponent — generic bridge between React and the
 * three-animations preset layer.
 *
 * Responsibilities:
 *   - Renders an oversized, absolutely-positioned canvas ("bleed") inside
 *     a fixed-size layout box so animations never clip at their edges.
 *   - Instantiates the preset on mount and disposes it on unmount.
 *   - Pauses rendering when offscreen (IntersectionObserver) and honors
 *     prefers-reduced-motion by requesting a calm pose from the preset
 *     and idling the loop once the entrance settles.
 */
export default function ThreeAnimationComponent<TOptions>({
  animation,
  options,
  size,
  bleed = 0.3,
  paused = false,
  pauseWhenOffscreen = true,
  handleRef,
  className = "",
  style,
}: ThreeAnimationComponentProps<TOptions>) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const internalHandleRef = useRef<ThreeAnimationHandle | null>(null);
  const [isOffscreen, setIsOffscreen] = useState(false);
  const [isReducedIdle, setIsReducedIdle] = useState(false);

  // Captured once — presets are mount-once by contract
  const mountPropsRef = useRef({ animation, options, size, bleed, handleRef });
  useEffect(() => {
    mountPropsRef.current = { animation, options, size, bleed, handleRef };
  });

  const bleedPixels = Math.round(size * bleed);
  const canvasSize = size + bleedPixels * 2;

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Reduced motion renders a static pose — idle the loop once settled
  useEffect(() => {
    if (!prefersReducedMotion) return;
    const timerId = setTimeout(() => setIsReducedIdle(true), 1500);
    return () => clearTimeout(timerId);
  }, [prefersReducedMotion]);

  // Offscreen pause — no reason to burn GPU on invisible animations
  useEffect(() => {
    if (!pauseWhenOffscreen || typeof IntersectionObserver === "undefined") {
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsOffscreen(!entry.isIntersecting);
        }
      },
      { rootMargin: "64px" },
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [pauseWhenOffscreen]);

  const handleSetup = (state: SetupState) => {
    const mountProps = mountPropsRef.current;
    const contentScale =
      mountProps.size / (mountProps.size + Math.round(mountProps.size * mountProps.bleed) * 2);

    const presetHandle = mountProps.animation(
      {
        scene: state.scene,
        camera: state.camera,
        renderer: state.renderer,
        THREE: state.THREE,
        contentScale,
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
  };

  return (
    <span
      ref={wrapperRef}
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      <ThreeCanvasComponent
        onSetup={handleSetup}
        onTick={handleTick}
        alpha
        antialias
        toneMapping="Neutral"
        paused={paused || isOffscreen || isReducedIdle}
        style={{
          position: "absolute",
          left: -bleedPixels,
          top: -bleedPixels,
          width: canvasSize,
          height: canvasSize,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}
