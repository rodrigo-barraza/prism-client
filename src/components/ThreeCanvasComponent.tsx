"use client";

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import ThreeService from "../services/ThreeService";
import type { ThreeCreateOptions, TickState } from "../services/ThreeService";
import styles from "./ThreeCanvasComponent.module.css";

export interface SetupState {
  scene: InstanceType<typeof THREE.Scene>;
  camera: InstanceType<typeof THREE.PerspectiveCamera>;
  renderer: InstanceType<typeof THREE.WebGLRenderer>;
  timer: InstanceType<typeof THREE.Timer>;
  THREE: typeof THREE;
}

export type SetupCallback = (state: SetupState) => (() => void) | void;

export interface ThreeCanvasComponentProps extends Omit<ThreeCreateOptions, "toneMapping"> {
  onSetup?: SetupCallback;
  onTick?: (state: TickState) => void;
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
 *   - `onSetup(state)` fires once after the Three.js instance is created.
 *     Use it to add meshes, lights, materials, etc.
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
  paused = false,
  className = "",
  style,
}: ThreeCanvasComponentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceIdRef = useRef<string | null>(null);
  const onTickRef = useRef<((state: TickState) => void) | undefined>(onTick);
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
    });

    instanceIdRef.current = instanceId;

    // Register the tick callback
    ThreeService.setTick(instanceId, tickWrapper);

    // Fire the setup callback — pass THREE so consumers don't import it
    const instance = ThreeService.getInstance(instanceId);
    if (instance && currentSetup) {
      const cleanup = currentSetup({
        ...instance,
        THREE: ThreeService.THREE,
      });
      if (typeof cleanup === "function") {
        setupCleanupRef.current = cleanup;
      }
    }

    return () => {
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
