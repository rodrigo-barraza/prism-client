"use client";

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import ThreeService from "../services/ThreeService";
import type {
  ThreeCreateOptions,
  ThreeRenderer,
  TickState,
} from "../services/ThreeService";
import styles from "./ThreeCanvasComponent.module.css";

export interface SetupState {
  scene: InstanceType<typeof THREE.Scene>;
  camera: InstanceType<typeof THREE.PerspectiveCamera>;
  renderer: ThreeRenderer;
  timer: InstanceType<typeof THREE.Timer>;
  THREE: typeof THREE;
}

export type SetupCallback = (_state: SetupState) => (() => void) | void;

export interface ThreeCanvasComponentProps extends Omit<ThreeCreateOptions, "toneMapping"> {
  onSetup?: SetupCallback;
  onTick?: (_state: TickState) => void;
  toneMapping?: string;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * ThreeCanvasComponent — Declarative React wrapper over ThreeService.
 *
 * Renders a <canvas> element, creates a Three.js instance via ThreeService
 * on mount, and tears it down on unmount. Provides lifecycle hooks for
 * scene setup and per-frame animation.
 *
 * Architecture:
 *   - `onSetup(state)` fires once the instance's renderer is live (via
 *     ThreeService.whenReady — immediate for WebGL, after async init for
 *     `backend: "webgpu"`). Use it to add meshes, lights, materials, etc.
 *   - `onTick(state)` fires every frame. Use it for animation logic.
 *   - All GPU resources are deterministically disposed on unmount via
 *     ThreeService.destroy().
 */
export default function ThreeCanvasComponent({
  onSetup,
  onTick,
  cameraFov = 60,
  cameraNear = 0.1,
  cameraFar = 1000,
  cameraPosition = [0, 0, 5],
  antialias = true,
  alpha = true,
  toneMapping = "ACESFilmic",
  toneMappingExposure = 1,
  shadowMap = false,
  maxPixelRatio = 2,
  maxFps = 0,
  backend = "webgl",
  outputColorSpace = "srgb",
  paused = false,
  className = "",
  style,
}: ThreeCanvasComponentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceIdRef = useRef<string | null>(null);
  const onTickRef = useRef<((_state: TickState) => void) | undefined>(onTick);
  const setupCleanupRef = useRef<(() => void) | void | null>(null);

  // Keep onTick ref current without re-creating the instance
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  // Pause/resume reactively
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    if (!instanceId) return;
    if (paused) {
      ThreeService.pause(instanceId);
    } else {
      ThreeService.resume(instanceId);
    }
  }, [paused]);

  const propsRef = useRef({
    onSetup,
    cameraFov,
    cameraNear,
    cameraFar,
    cameraPosition,
    antialias,
    alpha,
    toneMapping,
    toneMappingExposure,
    shadowMap,
    maxPixelRatio,
    maxFps,
    backend,
    outputColorSpace,
  });

  useEffect(() => {
    propsRef.current = {
      onSetup,
      cameraFov,
      cameraNear,
      cameraFar,
      cameraPosition,
      antialias,
      alpha,
      toneMapping,
      toneMappingExposure,
      shadowMap,
      maxPixelRatio,
      maxFps,
      backend,
      outputColorSpace,
    };
  });

  // Stable tick wrapper that always calls the latest onTick ref
  const tickWrapper = useCallback((state: TickState) => {
    onTickRef.current?.(state);
  }, []);

  // -- Mount / Unmount lifecycle --
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const {
      onSetup: currentSetup,
      cameraFov: fov,
      cameraNear: near,
      cameraFar: far,
      cameraPosition: pos,
      antialias: anti,
      alpha: alp,
      toneMapping: tone,
      toneMappingExposure: exp,
      shadowMap: shadow,
      maxPixelRatio: pixelRatioCap,
      maxFps: fpsCap,
      backend: gpuBackend,
      outputColorSpace: outColorSpace,
    } = propsRef.current;

    // Create the Three.js instance
    const instanceId = ThreeService.create(canvas, {
      cameraFov: fov,
      cameraNear: near,
      cameraFar: far,
      cameraPosition: pos,
      antialias: anti,
      alpha: alp,
      toneMapping: tone as ThreeCreateOptions["toneMapping"],
      toneMappingExposure: exp,
      shadowMap: shadow,
      maxPixelRatio: pixelRatioCap,
      maxFps: fpsCap,
      backend: gpuBackend,
      outputColorSpace: outColorSpace,
    });

    instanceIdRef.current = instanceId;

    // Register the tick callback
    ThreeService.setTick(instanceId, tickWrapper);

    // Fire the setup callback once the renderer is live (immediately for
    // WebGL; after async init for WebGPU). Pass THREE so consumers don't
    // import it. `null` means init failed or we unmounted — bail quietly.
    let unmounted = false;
    void ThreeService.whenReady(instanceId).then((instance) => {
      if (unmounted || !instance || instanceIdRef.current !== instanceId) {
        return;
      }
      if (currentSetup) {
        const cleanup = currentSetup({
          ...instance,
          THREE: ThreeService.THREE,
        });
        if (typeof cleanup === "function") {
          setupCleanupRef.current = cleanup;
        }
      }
    });

    return () => {
      unmounted = true;

      // Run user cleanup if provided
      setupCleanupRef.current?.();
      setupCleanupRef.current = null;

      // Destroy the Three.js instance (disposes all GPU resources)
      ThreeService.destroy(instanceId);
      instanceIdRef.current = null;
    };
  }, [tickWrapper]);

  return (
    <div
      ref={containerRef}
      className={`three-canvas-component ${styles['container']} ${className}`}
      style={style}
    >
      <canvas ref={canvasRef} className={styles['canvas']} />
    </div>
  );
}
