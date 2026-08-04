/**
 * ThreeService — Three.js lifecycle manager for Prism.
 *
 * Provides a clean API for creating renderers (WebGL by default, WebGPU on
 * request), scenes, cameras, and lighting rigs. Manages a shared
 * requestAnimationFrame loop with per-instance tick callbacks, DPR-aware
 * resize handling, and deterministic GPU resource disposal.
 *
 * Design:
 *   - Each "instance" gets its own renderer, scene, and camera, but they
 *     all share a single RAF loop to avoid frame budget contention.
 *   - The service is stateless/singleton — no React dependency. The
 *     ThreeCanvasComponent handles the React integration layer.
 *   - `backend: "webgpu"` instances load `three/webgpu` on demand (it is a
 *     separate chunk — the node/WGSL system never lands in bundles that only
 *     use WebGL scenes) and initialize asynchronously. The shared loop skips
 *     an instance until its renderer is ready; use `whenReady(id)` to run
 *     scene setup against the live renderer. There is deliberately NO
 *     silent WebGL fallback for these instances: their materials carry raw
 *     WGSL, which only a real WebGPU backend can compile — callers gate on
 *     `navigator.gpu` and keep their CSS fallback when it is absent.
 *
 * Usage:
 *   const id = ThreeService.create(canvas, { cameraFov: 60 });
 *   ThreeService.setTick(id, (state) => { ... });
 *   ThreeService.destroy(id);
 */

import * as THREE from "three";

// --- Types --------------------------------------------------

// Three.js v0.184+ ships its own types. Extract class instance types from the namespace.
type Scene = InstanceType<typeof THREE.Scene>;
type PerspectiveCamera = InstanceType<typeof THREE.PerspectiveCamera>;
type WebGLRenderer = InstanceType<typeof THREE.WebGLRenderer>;
type Timer = InstanceType<typeof THREE.Timer>;
type AmbientLight = InstanceType<typeof THREE.AmbientLight>;
type DirectionalLight = InstanceType<typeof THREE.DirectionalLight>;
type PointLight = InstanceType<typeof THREE.PointLight>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type BufferGeometry = InstanceType<typeof THREE.BufferGeometry>;
type Material = InstanceType<typeof THREE.Material>;
type Texture = InstanceType<typeof THREE.Texture>;

/**
 * Structural stand-in for a `three/webgpu` WebGPURenderer — that module is
 * ambient-any (global.d.ts), so this documents the subset the service and
 * the presets actually touch.
 */
interface WebGpuRendererLike {
  render(_scene: Scene, _camera: PerspectiveCamera): void;
  setSize(_width: number, _height: number, _updateStyle?: boolean): void;
  setPixelRatio(_ratio: number): void;
  getDrawingBufferSize(_target: InstanceType<typeof THREE.Vector2>): unknown;
  init(): Promise<unknown>;
  dispose(): void;
  toneMapping: number;
  toneMappingExposure: number;
  outputColorSpace: string;
}

/** Either renderer kind an instance may hold. Both share the subset the
 *  loop and the presets touch (render/setSize/setPixelRatio/dispose/
 *  getDrawingBufferSize/toneMapping/outputColorSpace). */
export type ThreeRenderer = WebGLRenderer | WebGpuRendererLike;

export type ThreeBackendName = "webgl" | "webgpu";

/** Minimal structural view of `navigator.gpu` — lib.dom has no WebGPU types. */
interface NavigatorGpuLike {
  gpu?: { requestAdapter?(): Promise<unknown> };
}

export interface ThreeCreateOptions {
  cameraFov?: number;
  cameraNear?: number;
  cameraFar?: number;
  cameraPosition?: [number, number, number];
  antialias?: boolean;
  alpha?: boolean;
  toneMapping?: keyof typeof TONE_MAPPING_MAP;
  toneMappingExposure?: number;
  shadowMap?: boolean;
  /**
   * Upper bound on the device pixel ratio used for the drawing buffer.
   * Values below 1 render at reduced resolution and CSS-upscale — the
   * budget knob for expensive full-screen shaders. Default 2.
   */
  maxPixelRatio?: number;
  /**
   * Cap the render rate for this instance (frames per second). The shared
   * RAF loop skips render+tick until the interval elapses, so slow ambient
   * scenes don't burn GPU at display rate. 0 (default) = uncapped.
   */
  maxFps?: number;
  /**
   * Which GPU API backs this instance. "webgl" (default) creates the
   * renderer synchronously as before. "webgpu" dynamic-imports
   * `three/webgpu` and initializes asynchronously — the instance renders
   * nothing until init resolves (see `whenReady`), and it never falls back
   * to WebGL (raw-WGSL materials cannot compile there).
   */
  backend?: ThreeBackendName;
  /**
   * Output transform of the renderer. "srgb" (default) keeps three's
   * standard linear→sRGB encode. "linear" makes the output transform the
   * identity — for scenes whose fragment output is already display-ready
   * (raw fullscreen shaders authored in sRGB), matching what a classic
   * no-chunks ShaderMaterial wrote to a WebGL canvas.
   */
  outputColorSpace?: "srgb" | "linear";
}

export interface TickState {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: ThreeRenderer;
  timer: Timer;
  deltaTime: number;
  elapsed: number;
  width: number;
  height: number;
}

export type TickCallback = (_state: TickState) => void;

export interface LightingRigOptions {
  ambientIntensity?: number;
  keyIntensity?: number;
  fillIntensity?: number;
  rimIntensity?: number;
  ambientColor?: string;
  keyColor?: string;
  fillColor?: string;
  rimColor?: string;
}

export interface LightingRig {
  ambient: AmbientLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  rim: PointLight;
}

/** What `whenReady` resolves with once the renderer exists. */
export interface ThreeInstanceHandles {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: ThreeRenderer;
  timer: Timer;
}

interface ThreeInstance {
  id: string;
  canvas: HTMLCanvasElement;
  /** Null only while a webgpu backend is still initializing. */
  renderer: ThreeRenderer | null;
  scene: Scene;
  camera: PerspectiveCamera;
  timer: Timer;
  tick: TickCallback | null;
  resizeObserver: ResizeObserver | null;
  width: number;
  height: number;
  paused: boolean;
  /** False until the renderer exists — the loop skips unready instances. */
  ready: boolean;
  readyPromise: Promise<ThreeInstanceHandles | null>;
  resolveReady: (_handles: ThreeInstanceHandles | null) => void;
  maxPixelRatio: number;
  /** Minimum milliseconds between rendered frames (0 = every RAF). */
  minFrameMs: number;
  lastFrameTimestamp: number;
}

// --- Constants ----------------------------------------------

const TONE_MAPPING_MAP = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
} as const;

// --- Instance Registry ---------------------------------------------

const instances = new Map<string, ThreeInstance>();

let nextId = 0;
let rafId: number | null = null;

// --- Environment Map Cache -----------------------------------------

interface EnvironmentCacheEntry {
  texture: Texture;
  renderTarget: { dispose(): void };
}

// PMREM environment textures are tied to a WebGL context, so they are
// cached per renderer and disposed alongside it in destroy().
const environmentCache = new WeakMap<ThreeRenderer, EnvironmentCacheEntry>();

/**
 * Build a tiny procedural "studio" scene — a dark room with a few soft
 * light cards. Run through PMREMGenerator it produces the reflection
 * gradients that make metallic/glossy materials read as 3D, without
 * shipping an HDR asset.
 */
function buildStudioEnvironmentScene(): Scene {
  const scene = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 20, 20),
    new THREE.MeshBasicMaterial({ color: "#0b0d14", side: THREE.BackSide }),
  );
  scene.add(room);

  const addLightCard = (
    color: string,
    intensity: number,
    width: number,
    height: number,
    position: [number, number, number],
    lookAtOrigin = true,
  ) => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    card.position.set(...position);
    if (lookAtOrigin) card.lookAt(0, 0, 0);
    scene.add(card);
  };

  // Key softbox (upper front-left), cool fill (right), warm kicker (back)
  addLightCard("#ffffff", 6, 8, 5, [-4, 6, 6]);
  addLightCard("#9db4ff", 2.5, 6, 6, [7, 1, 2]);
  addLightCard("#ffd9a8", 3.5, 5, 4, [-2, 2, -7]);
  // Faint floor bounce so under-sides aren't pitch black
  addLightCard("#3a4258", 1.2, 10, 10, [0, -8, 0]);

  return scene;
}

// --- RAF Loop ------------------------------------------------------

function loop(timestamp: number): void {
  for (const instance of instances.values()) {
    if (instance.paused) continue;

    // WebGPU instances render nothing until their async init resolves.
    if (!instance.ready || !instance.renderer) continue;

    // Per-instance FPS cap — skip until the frame interval elapses.
    // The timer is not updated on skipped frames, so deltas stay correct.
    if (
      instance.minFrameMs > 0 &&
      timestamp - instance.lastFrameTimestamp < instance.minFrameMs
    ) {
      continue;
    }
    instance.lastFrameTimestamp = timestamp;

    instance.timer.update(timestamp);

    if (instance.tick) {
      instance.tick({
        scene: instance.scene,
        camera: instance.camera,
        renderer: instance.renderer,
        timer: instance.timer,
        deltaTime: instance.timer.getDelta(),
        elapsed: instance.timer.getElapsed(),
        width: instance.width,
        height: instance.height,
      });
    }

    instance.renderer.render(instance.scene, instance.camera);
  }

  rafId = requestAnimationFrame(loop);
}

function ensureLoop(): void {
  if (rafId === null && instances.size > 0) {
    rafId = requestAnimationFrame(loop);
  }
}

function stopLoopIfEmpty(): void {
  if (instances.size === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// --- Resize Handling -----------------------------------------------

function handleResize(instance: ThreeInstance): void {
  const canvas = instance.canvas;
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  if (canvasWidth === 0 || canvasHeight === 0) return;
  if (canvasWidth === instance.width && canvasHeight === instance.height) return;

  instance.width = canvasWidth;
  instance.height = canvasHeight;

  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  instance.camera.aspect = canvasWidth / canvasHeight;
  instance.camera.updateProjectionMatrix();

  // Renderer still initializing (webgpu): sizes are recorded above and
  // applied by the forced resize when init completes.
  if (!instance.renderer) return;

  const devicePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    instance.maxPixelRatio,
  );
  instance.renderer.setSize(canvasWidth, canvasHeight, false);
  instance.renderer.setPixelRatio(devicePixelRatio);
}

// --- WebGPU init ---------------------------------------------------

interface RendererConfig {
  antialias: boolean;
  alpha: boolean;
  toneMapping: keyof typeof TONE_MAPPING_MAP;
  toneMappingExposure: number;
  outputColorSpace: "srgb" | "linear";
}

function applyOutputSettings(
  renderer: ThreeRenderer,
  config: RendererConfig,
): void {
  renderer.toneMapping =
    TONE_MAPPING_MAP[config.toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = config.toneMappingExposure;
  renderer.outputColorSpace =
    config.outputColorSpace === "linear"
      ? THREE.LinearSRGBColorSpace
      : THREE.SRGBColorSpace;
}

/**
 * Create + init a WebGPURenderer for an already-registered instance.
 * On success the instance joins the render loop and `whenReady` resolves;
 * on failure (no `navigator.gpu`, adapter refusal, context loss) the
 * instance simply never renders — the caller's CSS fallback stays up.
 */
async function initializeWebGpuRenderer(
  instance: ThreeInstance,
  config: RendererConfig,
): Promise<void> {
  try {
    const gpu =
      typeof navigator !== "undefined"
        ? (navigator as NavigatorGpuLike).gpu
        : undefined;
    if (!gpu) {
      throw new Error("navigator.gpu is unavailable (no WebGL fallback by design)");
    }

    // Loaded on demand: keeps the node/WGSL system out of WebGL-only bundles.
    const { WebGPURenderer } = await import("three/webgpu");
    const renderer = new WebGPURenderer({
      canvas: instance.canvas,
      antialias: config.antialias,
      alpha: config.alpha,
      powerPreference: "high-performance",
    });
    applyOutputSettings(renderer as unknown as ThreeRenderer, config);

    await renderer.init();

    // Destroyed while initializing (unmount race): drop the renderer.
    if (instances.get(instance.id) !== instance) {
      renderer.dispose();
      return;
    }

    instance.renderer = renderer as unknown as ThreeRenderer;
    instance.ready = true;
    // Re-apply the size recorded while the renderer was absent.
    instance.width = 0;
    instance.height = 0;
    handleResize(instance);
    instance.resolveReady({
      scene: instance.scene,
      camera: instance.camera,
      renderer: instance.renderer,
      timer: instance.timer,
    });
  } catch (error) {
    console.warn(
      "[ThreeService] WebGPU renderer failed to initialize — instance will not render:",
      error,
    );
    instance.resolveReady(null);
  }
}

// --- Disposal Helpers ----------------------------------------------

/**
 * Recursively dispose geometries, materials, and textures in a scene
 * graph. This is critical to avoid GPU memory leaks.
 */
function disposeSceneGraph(object: Object3D): void {
  if (!object) return;

  // Traverse children first
  if (object.children) {
    for (let i = object.children.length - 1; i >= 0; i--) {
      disposeSceneGraph(object.children[i]);
    }
  }

  const mesh = object as Mesh;

  if (mesh.geometry) {
    mesh.geometry.dispose();
  }

  if (mesh.material) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    for (const mat of materials) {
      // Dispose all texture properties
      for (const key of Object.keys(mat)) {
        const value = (mat as Record<string, unknown>)[key];
        if (value && value instanceof THREE.Texture) {
          (value as Texture).dispose();
        }
      }
      (mat as Material).dispose();
    }
  }
}

// --- Public API ----------------------------------------------------

const ThreeService = {
  /**
   * Expose the THREE namespace so consumers don't need a separate import.
   * Keeps all Three.js dependency routing through this service.
   */
  THREE,

  /**
   * Create a new Three.js instance bound to the given canvas element.
   *
   * Returns the instance id synchronously for both backends. A "webgpu"
   * instance initializes in the background — renders are skipped and
   * `whenReady(id)` resolves once its renderer exists.
   */
  create(canvas: HTMLCanvasElement, options: ThreeCreateOptions = {}): string {
    const {
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
    } = options;

    const id = `three-${nextId++}`;
    const rendererConfig: RendererConfig = {
      antialias,
      alpha,
      toneMapping,
      toneMappingExposure,
      outputColorSpace,
    };

    // -- Scene --
    const scene = new THREE.Scene();

    // -- Camera --
    const camera = new THREE.PerspectiveCamera(
      cameraFov,
      1,
      cameraNear,
      cameraFar,
    );
    camera.position.set(...cameraPosition);

    // -- Timer --
    const timer = new THREE.Timer();
    if (typeof document !== "undefined") timer.connect(document);

    // -- Instance --
    let resolveReady: (_handles: ThreeInstanceHandles | null) => void = () => {};
    const readyPromise = new Promise<ThreeInstanceHandles | null>((resolve) => {
      resolveReady = resolve;
    });

    const instance: ThreeInstance = {
      id,
      canvas,
      renderer: null,
      scene,
      camera,
      timer,
      tick: null,
      resizeObserver: null,
      width: 0,
      height: 0,
      paused: false,
      ready: false,
      readyPromise,
      resolveReady,
      maxPixelRatio: Math.max(0.1, maxPixelRatio),
      minFrameMs: maxFps > 0 ? 1000 / maxFps : 0,
      lastFrameTimestamp: -Infinity,
    };

    if (backend === "webgpu") {
      instances.set(id, instance);
      handleResize(instance); // records layout size; applied after init
      void initializeWebGpuRenderer(instance, rendererConfig);
    } else {
      // -- Renderer (classic synchronous WebGL path) --
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias,
        alpha,
        powerPreference: "high-performance",
      });
      applyOutputSettings(renderer, rendererConfig);

      if (shadowMap) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      instance.renderer = renderer;
      instance.ready = true;
      instances.set(id, instance);

      // Initial sizing
      handleResize(instance);
      instance.resolveReady({ scene, camera, renderer, timer });
    }

    // Observe container resizes
    const parent = canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      instance.resizeObserver = new ResizeObserver(() => handleResize(instance));
      instance.resizeObserver.observe(parent);
    }

    ensureLoop();
    return id;
  },

  /**
   * Resolves with the live scene/camera/renderer/timer once the instance's
   * renderer exists — immediately for WebGL, after async init for WebGPU.
   * Resolves null if initialization failed or the instance was destroyed
   * first; callers should simply bail on null.
   */
  whenReady(id: string): Promise<ThreeInstanceHandles | null> {
    const instance = instances.get(id);
    if (!instance) return Promise.resolve(null);
    return instance.readyPromise;
  },

  /**
   * Register a per-frame tick callback for an instance.
   *
   * TickState: { scene, camera, renderer, timer, dt, elapsed, width, height }
   */
  setTick(id: string, callback: TickCallback): void {
    const instance = instances.get(id);
    if (instance) instance.tick = callback;
  },

  /**
   * Pause rendering for an instance (e.g. when off-screen).
   */
  pause(id: string): void {
    const instance = instances.get(id);
    if (instance) instance.paused = true;
  },

  /**
   * Resume rendering for a paused instance.
   */
  resume(id: string): void {
    const instance = instances.get(id);
    if (instance) instance.paused = false;
  },

  /**
   * Get the scene, camera, and renderer for an instance.
   * Useful for imperative setup (adding meshes, lights, etc.).
   * `renderer` is null while a webgpu instance is still initializing —
   * prefer `whenReady` for anything that needs the live renderer.
   */
  getInstance(
    id: string,
  ):
    | (Pick<ThreeInstance, "scene" | "camera" | "timer"> & {
        renderer: ThreeRenderer | null;
      })
    | null {
    const instance = instances.get(id);
    if (!instance) return null;
    return {
      scene: instance.scene,
      camera: instance.camera,
      renderer: instance.renderer,
      timer: instance.timer,
    };
  },

  /**
   * Get (or lazily build) a shared PBR environment texture for a renderer.
   *
   * Assign the result to `scene.environment` to give MeshStandard/Physical
   * materials studio-style reflections. Cached per renderer (environment
   * textures are context-bound) and disposed automatically in destroy().
   *
   * WebGL only — PMREMGenerator drives a WebGLRenderer. Presets that call
   * this (the coin) are WebGL-backend scenes by contract.
   */
  getEnvironment(renderer: ThreeRenderer): Texture {
    const cached = environmentCache.get(renderer);
    if (cached) return cached.texture;

    const pmremGenerator = new THREE.PMREMGenerator(renderer as WebGLRenderer);
    const environmentScene = buildStudioEnvironmentScene();
    const renderTarget = pmremGenerator.fromScene(environmentScene, 0.04);
    pmremGenerator.dispose();
    disposeSceneGraph(environmentScene);

    const entry: EnvironmentCacheEntry = {
      texture: renderTarget.texture,
      renderTarget,
    };
    environmentCache.set(renderer, entry);
    return entry.texture;
  },

  // -- Scene Graph Helpers ---------------------------------------

  /**
   * Create a standard three-point lighting rig and add it to a scene.
   */
  addLightingRig(scene: Scene, options: LightingRigOptions = {}): LightingRig {
    const {
      ambientIntensity = 0.4,
      keyIntensity = 1.0,
      fillIntensity = 0.5,
      rimIntensity = 0.3,
      ambientColor = "#404060",
      keyColor = "#ffffff",
      fillColor = "#8888ff",
      rimColor = "#ff8844",
    } = options;

    const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(keyColor, keyIntensity);
    key.position.set(5, 5, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(fillColor, fillIntensity);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    const rim = new THREE.PointLight(rimColor, rimIntensity, 20);
    rim.position.set(0, 3, -5);
    scene.add(rim);

    return { ambient, key, fill, rim };
  },

  /**
   * Create a mesh with geometry and material, optionally adding it to a scene.
   */
  createMesh(
    geometry: BufferGeometry,
    material: Material | Material[],
    scene?: Scene,
  ): Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    if (scene) scene.add(mesh);
    return mesh;
  },

  /**
   * Create a fog configuration on a scene.
   */
  addFog(scene: Scene, color: string, near = 5, far = 30): void {
    scene.fog = new THREE.Fog(color, near, far);
  },

  /**
   * Set the scene background color.
   */
  setBackground(scene: Scene, color: string | null): void {
    scene.background = color ? new THREE.Color(color) : null;
  },

  // -- Post-Processing Prep -------------------------------------

  /**
   * Placeholder for future EffectComposer integration.
   * Returns null until post-processing passes are needed.
   */
  getComposer(_id: string): null {
    return null;
  },

  // -- Cleanup --------------------------------------------------

  /**
   * Destroy a Three.js instance — disposes all GPU resources,
   * removes from the loop, and disconnects the ResizeObserver.
   */
  destroy(id: string): void {
    const instance = instances.get(id);
    if (!instance) return;

    // Stop observing
    instance.resizeObserver?.disconnect();

    // Dispose scene graph (geometries, materials, textures)
    disposeSceneGraph(instance.scene);

    if (instance.renderer) {
      // Dispose the cached environment map bound to this renderer
      const environmentEntry = environmentCache.get(instance.renderer);
      if (environmentEntry) {
        environmentEntry.renderTarget.dispose();
        environmentCache.delete(instance.renderer);
      }

      // Dispose renderer (GPU context)
      instance.renderer.dispose();
    }
    // else: webgpu init still in flight — initializeWebGpuRenderer sees the
    // registry no longer holds this instance and disposes what it built.

    // Remove from registry
    instances.delete(id);
    stopLoopIfEmpty();

    // Anyone still awaiting readiness gets a null (bail) resolution.
    instance.resolveReady(null);
  },

  /**
   * Destroy all instances. Nuclear option for route transitions.
   */
  destroyAll(): void {
    for (const id of [...instances.keys()]) {
      ThreeService.destroy(id);
    }
  },

  /**
   * Get the count of active instances (for debugging).
   */
  get activeCount(): number {
    return instances.size;
  },
};

export default ThreeService;
