/**
 * ThreeAnimationTypes — shared contracts for reusable Three.js animation
 * presets in Prism.
 *
 * An "animation preset" is a plain factory function that receives a live
 * Three.js context (scene/camera/renderer), builds its scene graph, and
 * returns a handle with per-frame update, runtime parameters, and disposal.
 *
 * Presets are React-free — `ThreeAnimationComponent` is the bridge that
 * mounts a preset into the component tree. Adding a new animation to
 * prism-client means writing one preset file and registering it in
 * `three-animations/index.ts`.
 */

import type * as THREE from "three";
import type { ThreeRenderer, TickState } from "../ThreeService";

type Scene = InstanceType<typeof THREE.Scene>;
type PerspectiveCamera = InstanceType<typeof THREE.PerspectiveCamera>;

export interface ThreeAnimationContext {
  scene: Scene;
  camera: PerspectiveCamera;
  /**
   * The live renderer — WebGL or WebGPU depending on the instance's
   * backend. A preset written for one backend (the coin leans on
   * WebGL-only PMREM environments; the clouds carry raw WGSL) narrows
   * this itself and is mounted only on that backend.
   */
  renderer: ThreeRenderer;
  THREE: typeof THREE;
  /**
   * Fraction of the canvas the logical content box occupies (0..1].
   * Canvases are rendered with "bleed" — extra transparent margin so
   * motion never clips at the element edge. A preset should frame its
   * hero object to `contentScale` of the frustum so the subject renders
   * at the layout size while excursions (wobble, overshoot) paint into
   * the bleed area.
   */
  contentScale: number;
  /** True when the user prefers reduced motion — render a calm/static pose. */
  reducedMotion: boolean;
}

export interface ThreeAnimationHandle {
  /** Per-frame animation update. Optional for static presets. */
  update?(_state: TickState): void;
  /**
   * Runtime parameter setter. Keys are preset-defined (e.g. the coin
   * accepts "spinImpulse" and "faceSource"). Unknown keys are ignored.
   */
  setParameter?(_key: string, _value: unknown): void;
  /** Dispose everything the preset created (geometry, materials, textures, lights). */
  dispose?(): void;
}

export type ThreeAnimationFactory<TOptions = void> = (
  _context: ThreeAnimationContext,
  _options: TOptions,
) => ThreeAnimationHandle;
