/**
 * CloudsAnimation — hyper-real "above the clouds" background preset.
 *
 * A single fullscreen triangle runs a raymarched volumetric cloudscape:
 * the camera floats just above a cumulus deck that recedes to a horizon
 * ~70 km away (real planet-curvature term, so the deck sinks and curls
 * over the limb like the view from a plane window), under an analytic
 * sky gradient with a small, barely-there sun and faint high cirrus.
 *
 * Realism comes from:
 *   - fbm density field (texture-based value noise — 1 bilinear fetch per
 *     octave) shaped by a vertical profile for cauliflower tops
 *   - single-scatter sun lighting via a directional density gradient,
 *     blue-shifted ambient by height inside the cloud
 *   - per-sample aerial perspective (exponential haze by distance)
 *   - earth-curvature drop + horizon dip, so distant clouds compress
 *     into the far deck exactly like the reference photography
 *
 * Optimizations (this shader is designed for a *background*):
 *   - march only inside the analytically-intersected cloud slab; pure-sky
 *     pixels never march
 *   - distance-growing step size + octave LOD by distance
 *   - ultra-low-frequency "clump" coverage tested before fbm so empty gaps
 *     skip 5 noise fetches per sample
 *   - early exit at ~full opacity; dithered march start hides banding
 *   - designed to run under maxPixelRatio<=1 and maxFps 30 (see
 *     ThreeBackgroundComponent) — do not mount it at display DPR/rate
 *
 * The preset ignores the scene camera — rays are built in-shader from a
 * fixed basis (slight downward pitch). `reducedMotion` freezes time at a
 * pleasant phase and renders a static frame.
 *
 * Runtime parameters (setParameter):
 *   - "timeScale": number — drift speed multiplier (default 1)
 */

import type { TickState } from "../ThreeService";
import type {
  ThreeAnimationContext,
  ThreeAnimationHandle,
} from "./ThreeAnimationTypes";

export interface CloudsPalette {
  /** Deep saturated blue at the top of the sky. */
  skyZenith: string;
  /** Pale icy blue just above the cloud line. */
  skyHorizon: string;
  /** Deep blue seen through gaps between near clouds. */
  abyss: string;
  /** Sunlit cloud tops. */
  cloudBright: string;
  /** Mid cloud tone (upper ambient). */
  cloudMid: string;
  /** Blue-shifted shadowed cloud undersides. */
  cloudShadow: string;
  /** Distance haze the far deck dissolves into. */
  haze: string;
  /** Sun disc/glow tint. */
  sun: string;
  /** High cirrus streak tint. */
  cirrus: string;
}

export interface CloudsAnimationOptions {
  /** Cloud coverage bias (≈0.2 sparse … ≈0.45 solid deck). Default 0.3. */
  coverage?: number;
  /** Drift speed multiplier. Default 1. */
  timeScale?: number;
  /** Palette overrides — defaults match the blue reference artwork. */
  palette?: Partial<CloudsPalette>;
}

/** Colors sampled from the reference image (bright blue-shifted alpine sky). */
const DEFAULT_PALETTE: CloudsPalette = {
  skyZenith: "#0e59b7",
  skyHorizon: "#cfe9f8",
  abyss: "#16407e",
  cloudBright: "#ffffff",
  cloudMid: "#b4cfec",
  cloudShadow: "#5c88c4",
  haze: "#bdddf4",
  sun: "#fff6e8",
  cirrus: "#e8f4fc",
};

const NOISE_TEXTURE_SIZE = 256;

/**
 * Deterministic PRNG (mulberry32) — the noise texture is identical every
 * mount; per-mount variety comes from the uSeed field offset instead.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Value-noise lookup texture. R holds hash(x, y); G holds the SAME hash
 * shifted by (37, 239) — the shader samples one texel and gets two adjacent
 * z-slices of a virtual 3D noise for the price of a single bilinear fetch
 * (iq's classic technique). Requires REPEAT wrap + LINEAR filter + no mips.
 */
function buildNoiseTextureData(): Uint8Array {
  const size = NOISE_TEXTURE_SIZE;
  const random = mulberry32(0x5eedc10d);
  const base = new Uint8Array(size * size);
  for (let i = 0; i < base.length; i++) base[i] = Math.floor(random() * 256);

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const out = (y * size + x) * 4;
      const shiftedX = (x + 37) & (size - 1);
      const shiftedY = (y + 239) & (size - 1);
      data[out] = base[y * size + x];
      data[out + 1] = base[shiftedY * size + shiftedX];
      data[out + 2] = 0;
      data[out + 3] = 255;
    }
  }
  return data;
}

/** Parse "#rrggbb" into raw sRGB components, bypassing color management. */
function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

const VERTEX_SHADER = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uSeed;
uniform float uCoverage;
uniform sampler2D uNoiseTexture;
uniform vec3 uSunDirection;
uniform vec3 uLightDirection;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uAbyss;
uniform vec3 uCloudBright;
uniform vec3 uCloudMid;
uniform vec3 uCloudShadow;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uCirrusColor;

// -- Camera / world constants (meters) ------------------------------
const float CAMERA_HEIGHT = 430.0;
const float CLOUD_BASE = -140.0;
const float CLOUD_TOP = 330.0;
const float CIRRUS_HEIGHT = 7500.0;
const float EARTH_RADIUS = 6371000.0;
const float MAX_DISTANCE = 120000.0;
const float FOV_TAN = 0.4877;      // vertical FOV ~52 deg
const float PITCH_SIN = 0.0785;    // ~4.5 deg downward pitch
const float PITCH_COS = 0.9969;
const int MAX_STEPS = 96;

// -- Noise -----------------------------------------------------------
// Virtual 3D value noise from the packed 2D texture: R = slice z, G = slice
// z+1, bilinear filtering interpolates x/y, mix() interpolates z.
float noise3(vec3 x) {
  vec3 cell = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  // Wrap the integer lattice BEFORE adding the fraction — cell products are
  // exact integers in float32, so this keeps texture coordinates small and
  // precise even 100 km from the origin (avoids far-field banding).
  vec2 uv = mod(cell.xy + vec2(37.0, 239.0) * cell.z, 256.0) + f.xy;
  vec2 rg = textureLod(uNoiseTexture, (uv + 0.5) / 256.0, 0.0).rg;
  return mix(rg.x, rg.y, f.z) * 2.0 - 1.0;
}

const mat3 NOISE_ROTATION = mat3(
   0.00,  0.80,  0.60,
  -0.80,  0.36, -0.48,
  -0.60, -0.48,  0.64
);

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    value += amplitude * noise3(p);
    p = NOISE_ROTATION * p * 2.04;
    amplitude *= 0.46;
  }
  return value;
}

// -- Cloud field ------------------------------------------------------
// Ultra-low-frequency coverage: breaks the deck into distinct cloud
// systems with blue gaps (~6 km wavelength).
float clumpAt(vec3 p) {
  return noise3(vec3(
    p.x * 0.00016 + uSeed.x * 39.0,
    3.7 + uSeed.y * 17.0,
    p.z * 0.00016 + uSeed.z * 27.0
  ));
}

float cloudDensity(vec3 p, float heightFraction, float clump, int octaves) {
  vec3 q = p * 0.0016
    + vec3(uTime * 0.030, 0.0, uTime * 0.011)
    + uSeed * 23.0;
  float shape = fbm(q, octaves);
  float density = uCoverage + 0.38 * clump + 0.68 * shape;
  // Vertical profile: erode upward for cauliflower tops, soften bases
  density -= 0.85 * pow(heightFraction, 1.35);
  density -= 0.28 * pow(1.0 - heightFraction, 3.0);
  return clamp(density * 1.35, 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// -- Sky --------------------------------------------------------------
vec3 skyColor(vec3 rayDirection) {
  float up = rayDirection.y;
  vec3 sky = mix(
    uSkyHorizon,
    uSkyZenith,
    pow(clamp(up * 1.25 + 0.14, 0.0, 1.0), 0.55)
  );
  // Below the horizon line: deep blue through-holes to the world below
  vec3 depth = mix(uSkyHorizon, uAbyss, clamp(-up * 7.0, 0.0, 1.0));
  sky = mix(depth, sky, step(0.0, up));

  // Sun: small overexposed disc + tight glow + wide subtle veil
  float sunDot = clamp(dot(rayDirection, uSunDirection), 0.0, 1.0);
  sky += uSunColor * (
    pow(sunDot, 18000.0) * 2.2 +
    pow(sunDot, 800.0) * 0.30 +
    pow(sunDot, 24.0) * 0.06
  );

  // Faint stretched cirrus sheet high above
  if (up > 0.01) {
    float tCirrus = (CIRRUS_HEIGHT - CAMERA_HEIGHT) / up;
    vec2 sheet = rayDirection.xz * tCirrus;
    float streaks = fbm(vec3(
      sheet.x * 0.000045 + uSeed.x * 11.0,
      7.7 + uSeed.z * 9.0,
      sheet.y * 0.00030
    ), 4);
    float cirrus = smoothstep(0.12, 0.62, streaks) * 0.22;
    cirrus *= smoothstep(0.005, 0.12, up);
    sky = mix(sky, uCirrusColor, cirrus);
  }
  return sky;
}

// -- Volumetric march ---------------------------------------------------
vec4 marchClouds(vec3 rayOrigin, vec3 rayDirection, float dither) {
  // Slab entry with planet curvature: solve A*t^2 + rd.y*t + (h - TOP) = 0.
  // No real root = the ray passes above the cloud shell (pure sky).
  float A = 1.0 / (2.0 * EARTH_RADIUS);
  float aboveTop = rayOrigin.y - CLOUD_TOP;
  float discriminant = rayDirection.y * rayDirection.y - 4.0 * A * aboveTop;
  if (discriminant < 0.0) return vec4(0.0);

  float sqrtDisc = sqrt(discriminant);
  float tEnter = (-rayDirection.y - sqrtDisc) / (2.0 * A);
  float tExit = min((-rayDirection.y + sqrtDisc) / (2.0 * A), MAX_DISTANCE);
  if (tEnter >= tExit) return vec4(0.0);

  vec4 accumulated = vec4(0.0);
  float t = tEnter + dither * max(14.0, tEnter * 0.024);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (accumulated.a > 0.985 || t > tExit) break;

    float stepLength = max(14.0, t * 0.024);
    vec3 samplePoint = rayOrigin + rayDirection * t;
    // Curvature: the cloud shell drops away with distance; equivalently
    // the sample rises relative to the shell.
    float shellY = samplePoint.y + (t * t) * A;

    if (shellY < CLOUD_BASE - 30.0 && rayDirection.y < 0.0) break;

    float heightFraction = (shellY - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    if (heightFraction >= 0.0 && heightFraction <= 1.0) {
      float clump = clumpAt(samplePoint);
      int octaves = t < 6000.0 ? 5 : (t < 22000.0 ? 4 : 3);
      float density = cloudDensity(samplePoint, heightFraction, clump, octaves);

      if (density > 0.012) {
        // Single-scatter approximation: density gradient toward the light
        vec3 lightPoint = samplePoint + uLightDirection * 55.0;
        float lightShellY = lightPoint.y + (t * t) * A;
        float lightHeight = clamp(
          (lightShellY - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
        float lightDensity = cloudDensity(
          lightPoint, lightHeight, clump, max(octaves - 2, 2));
        float sunlight = clamp((density - lightDensity) * 2.4 + 0.06, 0.0, 1.0);

        // Blue-shifted ambient by height inside the cloud + white sun term
        vec3 cloudColor = mix(uCloudShadow, uCloudMid, heightFraction)
          + uCloudBright * sunlight;

        // Aerial perspective: dissolve into haze with distance
        float hazeAmount = 1.0 - exp(-t * 0.000022);
        cloudColor = mix(cloudColor, uHaze, hazeAmount);

        float alpha = 1.0 - exp(-density * stepLength * 0.016);
        accumulated.rgb += cloudColor * alpha * (1.0 - accumulated.a);
        accumulated.a += alpha * (1.0 - accumulated.a);

        t += stepLength;
        continue;
      }
    }

    // Empty space — stride a little farther
    t += stepLength * 1.35;
  }

  return accumulated;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;

  // Fixed camera basis: forward +Z with a slight downward pitch
  vec3 rayCamera = normalize(vec3(ndc.x * FOV_TAN, ndc.y * FOV_TAN, 1.0));
  vec3 rayDirection = vec3(
    rayCamera.x,
    rayCamera.y * PITCH_COS - rayCamera.z * PITCH_SIN,
    rayCamera.y * PITCH_SIN + rayCamera.z * PITCH_COS
  );

  // Slow forward drift for near-cloud parallax
  vec3 rayOrigin = vec3(0.0, CAMERA_HEIGHT, uTime * 3.0);

  vec3 color = skyColor(rayDirection);

  float dither = hash12(gl_FragCoord.xy);
  vec4 clouds = marchClouds(rayOrigin, rayDirection, dither);
  color = color * (1.0 - clouds.a) + clouds.rgb;

  // Gentle vignette keeps centered UI legible over the bright deck
  vec2 vignetteUv = ndc * vec2(0.72, 0.85);
  color *= 1.0 - 0.16 * smoothstep(0.55, 1.35, length(vignetteUv));

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createCloudsAnimation(
  context: ThreeAnimationContext,
  options: CloudsAnimationOptions = {},
): ThreeAnimationHandle {
  const { scene, THREE, reducedMotion } = context;
  const { coverage = 0.3, timeScale = 1, palette: paletteOverride } = options;
  const palette: CloudsPalette = { ...DEFAULT_PALETTE, ...paletteOverride };

  // -- Noise lookup texture -----------------------------------------
  const noiseTexture = new THREE.DataTexture(
    buildNoiseTextureData(),
    NOISE_TEXTURE_SIZE,
    NOISE_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  noiseTexture.wrapS = THREE.RepeatWrapping;
  noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.minFilter = THREE.LinearFilter;
  noiseTexture.generateMipmaps = false;
  noiseTexture.needsUpdate = true;

  // Sun sits high in frame, slightly left of center (reference image);
  // cloud shading uses a steeper light so tops read sunlit from above.
  const sunDirection = new THREE.Vector3(-0.096, 0.234, 0.967).normalize();
  const lightDirection = new THREE.Vector3(-0.096, 0.62, 0.75).normalize();

  const colorUniform = (hex: string) => ({
    value: new THREE.Vector3(...hexToRgb(hex)),
  });

  // Random field offset — a different stretch of sky every conversation
  const seed = new THREE.Vector3(Math.random(), Math.random(), Math.random());

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: reducedMotion ? 120 + seed.x * 400 : seed.x * 400 },
      uSeed: { value: seed },
      uCoverage: { value: coverage },
      uNoiseTexture: { value: noiseTexture },
      uSunDirection: { value: sunDirection },
      uLightDirection: { value: lightDirection },
      uSkyZenith: colorUniform(palette.skyZenith),
      uSkyHorizon: colorUniform(palette.skyHorizon),
      uAbyss: colorUniform(palette.abyss),
      uCloudBright: colorUniform(palette.cloudBright),
      uCloudMid: colorUniform(palette.cloudMid),
      uCloudShadow: colorUniform(palette.cloudShadow),
      uHaze: colorUniform(palette.haze),
      uSunColor: colorUniform(palette.sun),
      uCirrusColor: colorUniform(palette.cirrus),
    },
  });

  // Fullscreen triangle — covers the viewport with 3 vertices, no camera
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
      3,
    ),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let currentTimeScale = timeScale;
  const drawingBufferSize = new THREE.Vector2();

  const update = ({ deltaTime, renderer: activeRenderer }: TickState) => {
    activeRenderer.getDrawingBufferSize(drawingBufferSize);
    material.uniforms.uResolution.value.copy(drawingBufferSize);

    if (reducedMotion) return;
    const delta = Math.min(Math.max(deltaTime, 0), 0.25);
    material.uniforms.uTime.value += delta * currentTimeScale;
  };

  const setParameter = (key: string, value: unknown) => {
    if (key === "timeScale" && typeof value === "number") {
      currentTimeScale = Math.max(0, value);
    }
  };

  const dispose = () => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    noiseTexture.dispose();
  };

  return { update, setParameter, dispose };
}
