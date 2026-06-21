/**
 * ThreeService — Three.js lifecycle manager for Prism.
 *
 * Provides a clean API for creating WebGL renderers, scenes, cameras,
 * and lighting rigs. Manages a shared requestAnimationFrame loop with
 * per-instance tick callbacks, DPR-aware resize handling, and
 * deterministic GPU resource disposal.
 *
 * Design:
 *   - Each "instance" gets its own renderer, scene, and camera, but they
 *     all share a single RAF loop to avoid frame budget contention.
 *   - The service is stateless/singleton — no React dependency. The
 *     ThreeCanvasComponent handles the React integration layer.
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
}

export interface TickState {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  timer: Timer;
  dt: number;
  elapsed: number;
  width: number;
  height: number;
}

export type TickCallback = (state: TickState) => void;

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

interface ThreeInstance {
  id: string;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  timer: Timer;
  tick: TickCallback | null;
  resizeObserver: ResizeObserver | null;
  width: number;
  height: number;
  paused: boolean;
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

// --- RAF Loop ------------------------------------------------------

function loop(timestamp: number): void {
  for (const inst of instances.values()) {
    if (inst.paused) continue;

    inst.timer.update(timestamp);

    if (inst.tick) {
      inst.tick({
        scene: inst.scene,
        camera: inst.camera,
        renderer: inst.renderer,
        timer: inst.timer,
        dt: inst.timer.getDelta(),
        elapsed: inst.timer.getElapsed(),
        width: inst.width,
        height: inst.height,
      });
    }

    inst.renderer.render(inst.scene, inst.camera);
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

function handleResize(inst: ThreeInstance): void {
  const canvas = inst.canvas;
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  if (canvasWidth === 0 || canvasHeight === 0) return;
  if (canvasWidth === inst.width && canvasHeight === inst.height) return;

  inst.width = canvasWidth;
  inst.height = canvasHeight;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  inst.renderer.setSize(canvasWidth, canvasHeight, false);
  inst.renderer.setPixelRatio(dpr);
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  inst.camera.aspect = canvasWidth / canvasHeight;
  inst.camera.updateProjectionMatrix();
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
    } = options;

    const id = `three-${nextId++}`;

    // -- Renderer --
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias,
      alpha,
      powerPreference: "high-performance",
    });

    renderer.toneMapping =
      TONE_MAPPING_MAP[toneMapping] ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = toneMappingExposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

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
    const inst: ThreeInstance = {
      id,
      canvas,
      renderer,
      scene,
      camera,
      timer,
      tick: null,
      resizeObserver: null,
      width: 0,
      height: 0,
      paused: false,
    };

    instances.set(id, inst);

    // Initial sizing
    handleResize(inst);

    // Observe container resizes
    const parent = canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      inst.resizeObserver = new ResizeObserver(() => handleResize(inst));
      inst.resizeObserver.observe(parent);
    }

    ensureLoop();
    return id;
  },

  /**
   * Register a per-frame tick callback for an instance.
   *
   * TickState: { scene, camera, renderer, timer, dt, elapsed, width, height }
   */
  setTick(id: string, toolFunction: TickCallback): void {
    const inst = instances.get(id);
    if (inst) inst.tick = toolFunction;
  },

  /**
   * Pause rendering for an instance (e.g. when off-screen).
   */
  pause(id: string): void {
    const inst = instances.get(id);
    if (inst) inst.paused = true;
  },

  /**
   * Resume rendering for a paused instance.
   */
  resume(id: string): void {
    const inst = instances.get(id);
    if (inst) inst.paused = false;
  },

  /**
   * Get the scene, camera, and renderer for an instance.
   * Useful for imperative setup (adding meshes, lights, etc.).
   */
  getInstance(
    id: string,
  ): Pick<ThreeInstance, "scene" | "camera" | "renderer" | "timer"> | null {
    const inst = instances.get(id);
    if (!inst) return null;
    return {
      scene: inst.scene,
      camera: inst.camera,
      renderer: inst.renderer,
      timer: inst.timer,
    };
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
    const inst = instances.get(id);
    if (!inst) return;

    // Stop observing
    inst.resizeObserver?.disconnect();

    // Dispose scene graph (geometries, materials, textures)
    disposeSceneGraph(inst.scene);

    // Dispose renderer (WebGL context)
    inst.renderer.dispose();

    // Remove from registry
    instances.delete(id);
    stopLoopIfEmpty();
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
