/**
 * CoinAnimation — the agent "coin" preset: a real 3D minted coin.
 *
 * Scene graph:
 *   pivot (entrance scale, precession wobble, bob, pointer parallax)
 *     └─ spinner (Y-axis spin)
 *          ├─ coin cylinder  — [rim strip, front face, back face] materials
 *          ├─ front rim ring — raised metallic torus, tinted to the artwork
 *          └─ back rim ring
 *
 * The face texture (brand gradient + agent icon/avatar) wraps onto both
 * caps, and its border colors are sampled into an edge strip so the
 * artwork visually continues around the reeded side of the coin. PBR
 * materials + the shared studio environment map give it metallic glints
 * as it spins.
 *
 * Geometry orientation: CylinderGeometry is baked with rotateX(π/2) then
 * rotateZ(π/2) so the caps face the camera with cap UVs upright — the
 * rim-strip sampling in TextureUtilities depends on this exact baking.
 *
 * Runtime parameters (setParameter):
 *   - "spinImpulse":  number — kick the spin speed (typing feedback)
 *   - "faceSource":   FaceSource — composite an image/icon onto the face
 *   - "pointerTilt":  { x, y } in [-1, 1] — parallax tilt toward pointer
 */

import ThreeService from "../ThreeService";
import type { TickState } from "../ThreeService";
import type {
  ThreeAnimationContext,
  ThreeAnimationHandle,
} from "./ThreeAnimationTypes";
import {
  renderCoinFace,
  renderCoinRimStrip,
  type FaceSource,
} from "./TextureUtilities";

export interface CoinAnimationOptions {
  /** Brand gradient for the coin face (CSS color strings, oklch fine). */
  gradient: [string, string];
  /** Idle spin speed in radians/second. */
  baseSpinSpeed?: number;
  /** Precession tilt amplitude in radians (0 disables wobble). */
  wobbleAmplitude?: number;
  /** Face texture resolution in pixels. */
  faceTextureSize?: number;
}

const COIN_RADIUS = 1;
const COIN_THICKNESS = 0.16;
const RIM_RING_TUBE_RADIUS = 0.045;
const RIM_RING_RADIUS = COIN_RADIUS - RIM_RING_TUBE_RADIUS;
const RADIAL_SEGMENTS = 96;
const RIM_STRIP_WIDTH = 1024;
const RIM_STRIP_HEIGHT = 64;
const CAMERA_FOV_DEGREES = 26;
const ENTRANCE_DURATION_SECONDS = 1.1;
const ENTRANCE_SPIN_MULTIPLIER = 6;
const MAXIMUM_SPIN_MULTIPLIER = 12;
const SPIN_DECAY_PER_SECOND = 2.6;
const MAXIMUM_DELTA_SECONDS = 0.1;

function easeOutBack(progress: number): number {
  const overshoot = 1.70158;
  const cubic = overshoot + 1;
  const shifted = progress - 1;
  return 1 + cubic * shifted * shifted * shifted + overshoot * shifted * shifted;
}

function easeOutCubic(progress: number): number {
  const shifted = 1 - progress;
  return 1 - shifted * shifted * shifted;
}

export function createCoinAnimation(
  context: ThreeAnimationContext,
  options: CoinAnimationOptions,
): ThreeAnimationHandle {
  const { scene, camera, renderer, THREE, contentScale, reducedMotion } = context;
  const {
    gradient,
    baseSpinSpeed = 1.2,
    wobbleAmplitude = 0.16,
    faceTextureSize = 256,
  } = options;

  // -- Camera: frame the coin to the content box, leaving the bleed
  //    margin free for wobble/overshoot excursions -------------------
  const visibleHalfHeight = COIN_RADIUS / Math.max(0.05, contentScale);
  const cameraDistance =
    visibleHalfHeight / Math.tan((CAMERA_FOV_DEGREES / 2) * (Math.PI / 180));
  camera.fov = CAMERA_FOV_DEGREES;
  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  // -- Textures ------------------------------------------------------
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = faceTextureSize;
  faceCanvas.height = faceTextureSize;

  const rimCanvas = document.createElement("canvas");
  rimCanvas.width = RIM_STRIP_WIDTH;
  rimCanvas.height = RIM_STRIP_HEIGHT;

  let currentOverlay: FaceSource | null = null;
  renderCoinFace(faceCanvas, gradient, currentOverlay);
  const initialEdgeColor = renderCoinRimStrip(rimCanvas, faceCanvas);

  const maximumAnisotropy = Math.min(
    8,
    renderer.capabilities?.getMaxAnisotropy?.() ?? 1,
  );

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  faceTexture.anisotropy = maximumAnisotropy;

  // The back cap renders the shared face canvas rotated 180° so the
  // artwork reads upright when the coin's reverse faces the camera.
  const backTexture = faceTexture.clone();
  backTexture.center.set(0.5, 0.5);
  backTexture.rotation = Math.PI;

  const rimTexture = new THREE.CanvasTexture(rimCanvas);
  rimTexture.colorSpace = THREE.SRGBColorSpace;
  rimTexture.anisotropy = maximumAnisotropy;
  rimTexture.wrapS = THREE.RepeatWrapping;

  // -- Materials -----------------------------------------------------
  scene.environment = ThreeService.getEnvironment(renderer);

  const frontMaterial = new THREE.MeshStandardMaterial({
    map: faceTexture,
    metalness: 0.35,
    roughness: 0.34,
    envMapIntensity: 0.9,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    map: backTexture,
    metalness: 0.35,
    roughness: 0.34,
    envMapIntensity: 0.9,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    map: rimTexture,
    metalness: 0.55,
    roughness: 0.42,
    envMapIntensity: 1.0,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.9,
    roughness: 0.24,
    envMapIntensity: 1.15,
  });

  const applyRingTint = (edgeColor: { r: number; g: number; b: number }) => {
    ringMaterial.color
      .setRGB(edgeColor.r / 255, edgeColor.g / 255, edgeColor.b / 255)
      .convertSRGBToLinear()
      .lerp(new THREE.Color(1, 1, 1), 0.2);
  };
  applyRingTint(initialEdgeColor);

  // -- Geometry ------------------------------------------------------
  const coinGeometry = new THREE.CylinderGeometry(
    COIN_RADIUS,
    COIN_RADIUS,
    COIN_THICKNESS,
    RADIAL_SEGMENTS,
    1,
  );
  // Bake caps to face the camera with upright UVs (see module docs)
  coinGeometry.rotateX(Math.PI / 2);
  coinGeometry.rotateZ(Math.PI / 2);

  const ringGeometry = new THREE.TorusGeometry(
    RIM_RING_RADIUS,
    RIM_RING_TUBE_RADIUS,
    20,
    RADIAL_SEGMENTS,
  );

  // Cylinder material slots after baking: [side, front (+Z), back (−Z)]
  const coinMesh = new THREE.Mesh(coinGeometry, [
    sideMaterial,
    frontMaterial,
    backMaterial,
  ]);

  const frontRing = new THREE.Mesh(ringGeometry, ringMaterial);
  frontRing.position.z = COIN_THICKNESS * 0.42;
  const backRing = new THREE.Mesh(ringGeometry, ringMaterial);
  backRing.position.z = -COIN_THICKNESS * 0.42;

  const spinner = new THREE.Group();
  spinner.add(coinMesh);
  spinner.add(frontRing);
  spinner.add(backRing);

  const pivot = new THREE.Group();
  pivot.add(spinner);
  scene.add(pivot);

  // -- Lights (the shared environment map provides the base) ---------
  const keyLight = new THREE.DirectionalLight("#ffffff", 1.3);
  keyLight.position.set(2.5, 3, 4);
  scene.add(keyLight);

  const kickerLight = new THREE.DirectionalLight("#ffd9a8", 0.8);
  kickerLight.position.set(-3, 1.5, -4);
  scene.add(kickerLight);

  // -- Animation state ------------------------------------------------
  let elapsedSeconds = 0;
  let spinAngle = -0.35; // start mid-turn so the entrance sweeps to face-on
  let spinMultiplier = reducedMotion ? 1 : ENTRANCE_SPIN_MULTIPLIER;
  const pointerTarget = { x: 0, y: 0 };
  const pointerCurrent = { x: 0, y: 0 };

  if (reducedMotion) {
    // Calm static pose: three-quarter view with a hint of tilt
    pivot.scale.setScalar(1);
    spinner.rotation.y = -0.55;
    pivot.rotation.x = 0.12;
  }

  const update = ({ deltaTime }: TickState) => {
    const delta = Math.min(Math.max(deltaTime, 0), MAXIMUM_DELTA_SECONDS);
    elapsedSeconds += delta;

    // Entrance: scale in with a slight overshoot
    const entranceProgress = Math.min(
      elapsedSeconds / ENTRANCE_DURATION_SECONDS,
      1,
    );
    const entranceScale = reducedMotion
      ? easeOutCubic(entranceProgress)
      : easeOutBack(entranceProgress);
    pivot.scale.setScalar(Math.max(0.001, entranceScale));

    if (reducedMotion) return;

    // Spin with frame-rate-independent decay back to idle speed
    spinMultiplier = 1 + (spinMultiplier - 1) * Math.exp(-SPIN_DECAY_PER_SECOND * delta);
    spinAngle += delta * baseSpinSpeed * spinMultiplier;
    spinner.rotation.y = spinAngle;

    // Pointer parallax eases toward its target
    const pointerEase = Math.min(1, delta * 8);
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerEase;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerEase;

    // Gyroscopic precession + gentle bob
    pivot.rotation.x =
      0.1 +
      wobbleAmplitude * Math.sin(elapsedSeconds * 0.9) +
      pointerCurrent.y * 0.22;
    pivot.rotation.z =
      wobbleAmplitude * 0.7 * Math.sin(elapsedSeconds * 0.73 + 1.3) -
      pointerCurrent.x * 0.18;
    pivot.position.y = 0.045 * Math.sin(elapsedSeconds * 1.35);

    // Slow reflection drift so highlights move even at steady spin
    scene.environmentRotation.y += delta * 0.12;
  };

  const setParameter = (key: string, value: unknown) => {
    if (key === "spinImpulse" && typeof value === "number") {
      spinMultiplier = Math.min(spinMultiplier + value, MAXIMUM_SPIN_MULTIPLIER);
      return;
    }
    if (key === "faceSource" && value && typeof value === "object") {
      currentOverlay = value as FaceSource;
      renderCoinFace(faceCanvas, gradient, currentOverlay);
      applyRingTint(renderCoinRimStrip(rimCanvas, faceCanvas));
      faceTexture.needsUpdate = true;
      backTexture.needsUpdate = true;
      rimTexture.needsUpdate = true;
      return;
    }
    if (key === "pointerTilt" && value && typeof value === "object") {
      const tilt = value as { x?: number; y?: number };
      pointerTarget.x = Math.max(-1, Math.min(1, tilt.x ?? 0));
      pointerTarget.y = Math.max(-1, Math.min(1, tilt.y ?? 0));
    }
  };

  const dispose = () => {
    scene.remove(pivot);
    scene.remove(keyLight);
    scene.remove(kickerLight);
    keyLight.dispose();
    kickerLight.dispose();
    coinGeometry.dispose();
    ringGeometry.dispose();
    frontMaterial.dispose();
    backMaterial.dispose();
    sideMaterial.dispose();
    ringMaterial.dispose();
    faceTexture.dispose();
    backTexture.dispose();
    rimTexture.dispose();
    // The environment texture is shared and owned by ThreeService's cache
    scene.environment = null;
  };

  return { update, setParameter, dispose };
}
