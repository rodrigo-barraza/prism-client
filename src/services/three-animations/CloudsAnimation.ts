/**
 * CloudsAnimation — hyper-real "above the clouds" background preset with a
 * full client-time-driven day/night cycle.
 *
 * A single fullscreen triangle raymarches two volumetric cloud layers:
 *   - a near stratocumulus DECK just below the camera that recedes to a
 *     horizon ~70 km away (real planet-curvature term, so it sinks and
 *     curls over the limb like the view from a plane window), and
 *   - a higher, sparser CUMULUS layer that upward rays hit — the puffy
 *     clouds that sit above the horizon line in a separate pressure layer.
 * Over an analytic sky whose sun arcs across the sky, moon, star field,
 * and palette are all driven by the *client's local time of day*.
 *
 * Time of day (computed on the CPU from `new Date()`, fed as uniforms):
 *   - Day: bright blue-shifted sky, small overexposed sun, sunlit tops.
 *   - Golden hour: warm horizon, golden cloud tops, long shadows.
 *   - Night: dark sky, moonlit clouds, procedural 3D star field + a subtle
 *     Milky Way band and a soft moon disc.
 *
 * Optimizations (this shader is designed for a *background*):
 *   - march only inside analytically-intersected cloud slabs; sky pixels
 *     skip the deck march entirely, and high clouds only march upward rays
 *   - distance-growing step size + octave LOD by distance
 *   - early exit at ~full opacity; dithered march start hides banding
 *   - stars/Milky Way only sampled for sky rays when it is actually dark
 *   - designed to run under maxPixelRatio<=1 and maxFps 30 (see
 *     ThreeBackgroundComponent) — do not mount it at display DPR/rate
 *
 * The preset ignores the scene camera — rays are built in-shader from a
 * fixed basis (slight downward pitch). `reducedMotion` freezes the drift
 * (the correct time-of-day is still applied).
 *
 * Runtime parameters (setParameter):
 *   - "timeScale": number — cloud drift speed multiplier (default 1)
 *   - "timeOfDayHours": number|null — force a local hour (0..24) for the
 *     sky, or null to follow the real clock again
 */

import type { TickState } from "../ThreeService";
import type {
  ThreeAnimationContext,
  ThreeAnimationHandle,
} from "./ThreeAnimationTypes";

export interface CloudsPalette {
  /** Deep saturated blue at the top of the daytime sky. */
  skyZenith: string;
  /** Pale icy blue just above the daytime cloud line. */
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
}

export interface CloudsAnimationOptions {
  /** Cloud coverage bias (≈0.2 sparse … ≈0.45 solid deck). Default 0.3. */
  coverage?: number;
  /** Drift speed multiplier. Default 1. */
  timeScale?: number;
  /** Daytime palette overrides — defaults match the blue reference artwork. */
  palette?: Partial<CloudsPalette>;
  /**
   * Force a local hour (0..24) instead of reading the client clock. For
   * previews/QA; leave undefined in production to follow real time.
   */
  debugHour?: number;
}

type Rgb = [number, number, number];

/** Daytime palette — sampled from the reference image. */
const DAY_PALETTE: CloudsPalette = {
  skyZenith: "#0c55c0",
  skyHorizon: "#c2e0f5",
  abyss: "#16407e",
  cloudBright: "#ffffff",
  cloudMid: "#9fc0e6",
  cloudShadow: "#4f7fc2",
  haze: "#9cc4e8",
  sun: "#fff6e8",
};

/** Golden-hour palette (sunrise / sunset). */
const TWILIGHT_PALETTE: CloudsPalette = {
  skyZenith: "#1d3576",
  skyHorizon: "#ff9d5c",
  abyss: "#0e1f52",
  cloudBright: "#ffd0a0",
  cloudMid: "#b98f97",
  cloudShadow: "#483f6a",
  haze: "#f0895f",
  sun: "#ffc07a",
};

/** Night palette (moonlit). */
const NIGHT_PALETTE: CloudsPalette = {
  skyZenith: "#030614",
  skyHorizon: "#0a1836",
  abyss: "#01030c",
  cloudBright: "#93a6cc",
  cloudMid: "#3c4866",
  cloudShadow: "#141d38",
  haze: "#0b1c40",
  sun: "#d3dce8",
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
function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace("#", ""), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Local hour in [0, 24) from the client clock. */
function currentLocalHour(): number {
  const now = new Date();
  return (
    now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
  );
}

// -- Precomputed palette tables (RGB, indexed by CloudsPalette key) ------

type PaletteTable = Record<keyof CloudsPalette, Rgb>;

function toTable(palette: CloudsPalette): PaletteTable {
  return {
    skyZenith: hexToRgb(palette.skyZenith),
    skyHorizon: hexToRgb(palette.skyHorizon),
    abyss: hexToRgb(palette.abyss),
    cloudBright: hexToRgb(palette.cloudBright),
    cloudMid: hexToRgb(palette.cloudMid),
    cloudShadow: hexToRgb(palette.cloudShadow),
    haze: hexToRgb(palette.haze),
    sun: hexToRgb(palette.sun),
  };
}

/** Direction (world) from elevation + azimuth. Camera looks toward +Z. */
function directionFromElevationAzimuth(
  elevation: number,
  azimuth: number,
): Rgb {
  const cosE = Math.cos(elevation);
  return [Math.sin(azimuth) * cosE, Math.sin(elevation), Math.cos(azimuth) * cosE];
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

uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uLightDir;
uniform float uLightIntensity;

uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uAbyss;
uniform vec3 uHaze;
uniform vec3 uCloudBright;
uniform vec3 uCloudMid;
uniform vec3 uCloudShadow;
uniform vec3 uSunColor;

uniform float uStarAmount;
uniform float uSunDiscAmount;
uniform float uMoonDiscAmount;
uniform float uNightAmount;

// -- Camera / world constants (meters) ------------------------------
const float CAMERA_HEIGHT = 430.0;
const float CLOUD_BASE = -140.0;
const float CLOUD_TOP = 330.0;
const float HIGH_BASE = 1500.0;
const float HIGH_TOP = 2650.0;
const float EARTH_RADIUS = 6371000.0;
const float CURVATURE = 1.0 / (2.0 * EARTH_RADIUS);
const float MAX_DISTANCE = 120000.0;
const float FOV_TAN = 0.4877;      // vertical FOV ~52 deg
const float PITCH_SIN = 0.0785;    // ~4.5 deg downward pitch
const float PITCH_COS = 0.9969;
const int MAX_STEPS = 96;
const int HIGH_STEPS = 44;

// -- Hashes ----------------------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

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

// -- Low deck density -------------------------------------------------
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
  density -= 0.22 * pow(1.0 - heightFraction, 3.0);
  return clamp(density * 1.5, 0.0, 1.0);
}

// -- High cumulus density (sparse, puffy, bigger scale) ---------------
float highDensity(vec3 p, float heightFraction, int octaves) {
  vec3 q = p * 0.00105
    + vec3(uTime * 0.020, 0.0, uTime * 0.006)
    + uSeed * 7.0;
  float shape = fbm(q, octaves);
  float clump = noise3(vec3(
    p.x * 0.000085 + uSeed.z * 9.0,
    12.0,
    p.z * 0.000085 + uSeed.x * 5.0
  ));
  float density = (uCoverage * 0.62 - 0.09) + 0.52 * clump + 0.62 * shape;
  // Rounded cumulus profile — densest mid-slab, feathered top and bottom
  float centered = (heightFraction - 0.46) * 2.0;
  density -= 1.05 * centered * centered;
  return clamp(density * 1.5, 0.0, 1.0);
}

// -- Star field (night sky) ------------------------------------------
vec3 starField(vec3 rd) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = 110.0 + float(layer) * 95.0;
    vec3 p = rd * scale;
    vec3 cell = floor(p);
    vec3 f = p - cell;
    vec3 r = hash33(cell + vec3(float(layer) * 23.0));
    float bright = hash13(cell * 1.31 + float(layer) * 7.0);
    float present = smoothstep(0.80, 0.965, bright);
    if (present > 0.0) {
      vec3 starPos = 0.25 + 0.5 * r;
      float d = length(f - starPos);
      float core = exp(-d * d * 300.0);
      // Occasional four-point diffraction spike for the brightest stars
      float spike = max(0.0, 1.0 - abs(f.x - starPos.x) * 42.0)
                  + max(0.0, 1.0 - abs(f.y - starPos.y) * 42.0);
      core += spike * smoothstep(0.93, 0.965, bright) * 0.18
              * exp(-d * d * 40.0);
      float twinkle = 0.55 + 0.45 * sin(uTime * 1.6 + r.x * 40.0);
      vec3 tint = mix(vec3(0.70, 0.81, 1.0), vec3(1.0, 0.86, 0.68), r.z);
      col += core * present * twinkle * tint * (0.7 + bright * 1.3);
    }
  }
  // Milky Way — a soft dusty band across a tilted great circle
  vec3 bandNormal = normalize(vec3(0.62, 0.34, -0.71));
  float band = 1.0 - smoothstep(0.0, 0.40, abs(dot(rd, bandNormal)));
  float glow = fbm(rd * 4.0 + uSeed * 5.0, 4) * 0.5 + 0.5;
  float dust = fbm(rd * 9.0 + 11.0, 3) * 0.5 + 0.5;
  col += band * band * glow * (1.0 - dust * 0.5) * vec3(0.40, 0.48, 0.70) * 0.16;
  // Faint scattered airglow so the night sky is never a dead flat navy
  col += vec3(0.02, 0.03, 0.055) * (fbm(rd * 2.2 + 7.0, 3) * 0.5 + 0.5);
  return col;
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

  // Converge to the haze tint at the horizon so the grazing band between
  // sky and the far cloud deck blends without a seam.
  sky = mix(uHaze, sky, smoothstep(0.0, 0.04, abs(up)));

  // Stars + Milky Way (night only), above the horizon
  if (uStarAmount > 0.001 && up > -0.02) {
    sky += starField(rayDirection) * uStarAmount * smoothstep(-0.02, 0.06, up);
  }

  // Sun: small overexposed disc + tight glow + wide subtle veil
  float sunDot = clamp(dot(rayDirection, uSunDir), 0.0, 1.0);
  sky += uSunColor * uSunDiscAmount * (
    pow(sunDot, 18000.0) * 2.4 +
    pow(sunDot, 800.0) * 0.16 +
    pow(sunDot, 24.0) * 0.04
  );

  // Moon: soft disc with limb darkening + subtle maria + halo
  if (uMoonDiscAmount > 0.001) {
    float moonDot = clamp(dot(rayDirection, uMoonDir), 0.0, 1.0);
    float ang = acos(min(moonDot, 1.0));
    float disc = 1.0 - smoothstep(0.0075, 0.0088, ang);
    float limb = sqrt(clamp(1.0 - pow(ang / 0.0088, 2.0), 0.0, 1.0));
    float maria = 0.72 + 0.28 * fbm(rayDirection * 380.0 + uSeed, 3);
    sky += uSunColor * uMoonDiscAmount * (
      disc * (0.5 + 0.5 * limb) * maria * 1.5 +
      pow(moonDot, 5000.0) * 0.4 +
      pow(moonDot, 40.0) * 0.03
    );
  }
  return sky;
}

// -- Low deck volumetric march ---------------------------------------
vec4 marchDeck(vec3 rayOrigin, vec3 rayDirection, float dither) {
  // Upward rays only rise relative to the curved shell — they can never
  // enter the deck below. Sky pixels skip the deck march.
  if (rayDirection.y >= 0.0) return vec4(0.0);

  // Slab entry with planet curvature: A t^2 + rd.y t + (h - TOP) = 0.
  float aboveTop = rayOrigin.y - CLOUD_TOP;
  float discriminant =
    rayDirection.y * rayDirection.y - 4.0 * CURVATURE * aboveTop;
  if (discriminant < 0.0) return vec4(0.0);

  float sqrtDisc = sqrt(discriminant);
  float tEnter = (-rayDirection.y - sqrtDisc) / (2.0 * CURVATURE);
  float tExit =
    min((-rayDirection.y + sqrtDisc) / (2.0 * CURVATURE), MAX_DISTANCE);
  if (tEnter >= tExit) return vec4(0.0);

  vec4 accumulated = vec4(0.0);
  float t = tEnter + dither * max(14.0, tEnter * 0.024);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (accumulated.a > 0.985 || t > tExit) break;

    float stepLength = max(14.0, t * 0.024);
    vec3 samplePoint = rayOrigin + rayDirection * t;
    float shellY = samplePoint.y + (t * t) * CURVATURE;

    if (shellY < CLOUD_BASE - 30.0) break;

    float heightFraction = (shellY - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    if (heightFraction >= 0.0 && heightFraction <= 1.0) {
      float clump = clumpAt(samplePoint);
      int octaves = t < 6000.0 ? 5 : (t < 22000.0 ? 4 : 3);
      float density = cloudDensity(samplePoint, heightFraction, clump, octaves);

      if (density > 0.012) {
        vec3 lightPoint = samplePoint + uLightDir * 55.0;
        float lightShellY = lightPoint.y + (t * t) * CURVATURE;
        float lightHeight = clamp(
          (lightShellY - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
        float lightDensity = cloudDensity(
          lightPoint, lightHeight, clump, max(octaves - 2, 2));
        float sunlight = clamp((density - lightDensity) * 3.4 + 0.02, 0.0, 1.0);

        vec3 cloudColor = mix(uCloudShadow, uCloudMid, heightFraction)
          + uCloudBright * sunlight * uLightIntensity;

        float hazeAmount = 1.0 - exp(-t * 0.000022);
        cloudColor = mix(cloudColor, uHaze, hazeAmount);

        float alpha = 1.0 - exp(-density * stepLength * 0.016);
        accumulated.rgb += cloudColor * alpha * (1.0 - accumulated.a);
        accumulated.a += alpha * (1.0 - accumulated.a);

        t += stepLength;
        continue;
      }
    }
    t += stepLength * 1.35;
  }
  return accumulated;
}

// -- High cumulus volumetric march -----------------------------------
vec4 marchHighClouds(vec3 rayOrigin, vec3 rayDirection, float dither) {
  // Only rays aimed at or above the horizon reach the upper layer.
  if (rayDirection.y < -0.02) return vec4(0.0);

  // Forward crossings of the two shell heights (camera sits below both).
  float belowBase = rayOrigin.y - HIGH_BASE;
  float belowTop = rayOrigin.y - HIGH_TOP;
  float discBase =
    rayDirection.y * rayDirection.y - 4.0 * CURVATURE * belowBase;
  if (discBase < 0.0) return vec4(0.0);
  float tEnter = (-rayDirection.y + sqrt(discBase)) / (2.0 * CURVATURE);
  if (tEnter > MAX_DISTANCE) return vec4(0.0);

  float discTop = rayDirection.y * rayDirection.y - 4.0 * CURVATURE * belowTop;
  float tExit = discTop < 0.0
    ? MAX_DISTANCE
    : (-rayDirection.y + sqrt(discTop)) / (2.0 * CURVATURE);
  tExit = min(tExit, MAX_DISTANCE);
  if (tEnter >= tExit) return vec4(0.0);

  vec4 accumulated = vec4(0.0);
  float span = tExit - tEnter;
  float stepLength = max(55.0, span / float(HIGH_STEPS));
  float t = tEnter + dither * stepLength;

  for (int i = 0; i < HIGH_STEPS; i++) {
    if (accumulated.a > 0.97 || t > tExit) break;

    vec3 samplePoint = rayOrigin + rayDirection * t;
    float shellY = samplePoint.y + (t * t) * CURVATURE;
    float heightFraction = (shellY - HIGH_BASE) / (HIGH_TOP - HIGH_BASE);

    if (heightFraction >= 0.0 && heightFraction <= 1.0) {
      int octaves = t < 16000.0 ? 4 : 3;
      float density = highDensity(samplePoint, heightFraction, octaves);

      if (density > 0.02) {
        vec3 lightPoint = samplePoint + uLightDir * 90.0;
        float lightShellY = lightPoint.y + (t * t) * CURVATURE;
        float lightHeight = clamp(
          (lightShellY - HIGH_BASE) / (HIGH_TOP - HIGH_BASE), 0.0, 1.0);
        float lightDensity = highDensity(lightPoint, lightHeight, 2);
        float sunlight = clamp((density - lightDensity) * 3.0 + 0.05, 0.0, 1.0);

        vec3 cloudColor = mix(uCloudShadow, uCloudMid, heightFraction)
          + uCloudBright * sunlight * uLightIntensity;

        float hazeAmount = 1.0 - exp(-t * 0.000013);
        cloudColor = mix(cloudColor, uHaze, hazeAmount * 0.92);

        float alpha = 1.0 - exp(-density * stepLength * 0.02);
        accumulated.rgb += cloudColor * alpha * (1.0 - accumulated.a);
        accumulated.a += alpha * (1.0 - accumulated.a);
      }
    }
    t += stepLength;
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

  // Composite far→near: high cumulus behind, then the near deck in front
  vec4 high = marchHighClouds(rayOrigin, rayDirection, dither);
  color = color * (1.0 - high.a) + high.rgb;

  vec4 deck = marchDeck(rayOrigin, rayDirection, dither);
  color = color * (1.0 - deck.a) + deck.rgb;

  // Gentle vignette keeps centered UI legible (softened at night)
  vec2 vignetteUv = ndc * vec2(0.72, 0.85);
  float vignette = 0.16 * (1.0 - 0.45 * uNightAmount);
  color *= 1.0 - vignette * smoothstep(0.55, 1.35, length(vignetteUv));

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createCloudsAnimation(
  context: ThreeAnimationContext,
  options: CloudsAnimationOptions = {},
): ThreeAnimationHandle {
  const { scene, THREE, reducedMotion } = context;
  const {
    coverage = 0.3,
    timeScale = 1,
    palette: paletteOverride,
    debugHour,
  } = options;

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

  // Palette tables: day (user-overridable), twilight, night
  const dayTable = toTable({ ...DAY_PALETTE, ...paletteOverride });
  const twilightTable = toTable(TWILIGHT_PALETTE);
  const nightTable = toTable(NIGHT_PALETTE);

  // Random field offset — a different stretch of sky every conversation
  const seed = new THREE.Vector3(Math.random(), Math.random(), Math.random());

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: reducedMotion ? 120 + seed.x * 400 : seed.x * 400 },
    uSeed: { value: seed },
    uCoverage: { value: coverage },
    uNoiseTexture: { value: noiseTexture },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightIntensity: { value: 1 },
    uSkyZenith: { value: new THREE.Vector3() },
    uSkyHorizon: { value: new THREE.Vector3() },
    uAbyss: { value: new THREE.Vector3() },
    uHaze: { value: new THREE.Vector3() },
    uCloudBright: { value: new THREE.Vector3() },
    uCloudMid: { value: new THREE.Vector3() },
    uCloudShadow: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Vector3() },
    uStarAmount: { value: 0 },
    uSunDiscAmount: { value: 1 },
    uMoonDiscAmount: { value: 0 },
    uNightAmount: { value: 0 },
  };

  // -- Time-of-day → uniforms --------------------------------------
  // Scratch vectors reused each refresh (no per-frame allocation).
  const blend3 = (out: Rgb, a: Rgb, b: Rgb, t: number): Rgb => {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  };
  const scratch: Rgb = [0, 0, 0];
  const scratchSun: Rgb = [0, 0, 0];

  const setVecFromKey = (
    target: { value: { set(_x: number, _y: number, _z: number): void } },
    key: keyof CloudsPalette,
    dayAmount: number,
    twilightAmount: number,
  ) => {
    blend3(scratch, nightTable[key], dayTable[key], dayAmount);
    blend3(scratch, scratch, twilightTable[key], twilightAmount);
    target.value.set(scratch[0], scratch[1], scratch[2]);
  };

  // Kept low so the sun/moon stay within the gently down-pitched frame for
  // most of the day/night (the visible band tops out near +21° elevation);
  // a true overhead arc would hide them for hours around noon/midnight.
  const MAX_SUN_ELEVATION = 0.62; // radians (~35°)
  const MAX_MOON_ELEVATION = 0.5; // radians (~29°)
  // Narrow horizontal swing keeps the disc inside the ~±26° horizontal frame
  // when it is low enough to clear the frame top — so the sun/moon read as
  // rising front-left in the morning and setting front-right in the evening.
  const AZIMUTH_SWING = 0.55; // radians (~±16° across daylight hours)

  const applySkyState = (hours: number) => {
    // Sun arc: 0 at 06:00, peak at 12:00, 0 at 18:00, lowest at 00:00
    const sunProgress = (hours - 6) / 12;
    const sunElevation = Math.sin(sunProgress * Math.PI) * MAX_SUN_ELEVATION;
    const sunAzimuth = ((hours - 12) / 12) * AZIMUTH_SWING;
    const sunDir = directionFromElevationAzimuth(sunElevation, sunAzimuth);

    // Moon: same arc phase-shifted 12h, so it is up through the night
    const moonHours = (hours + 12) % 24;
    const moonProgress = (moonHours - 6) / 12;
    const moonElevation =
      Math.sin(moonProgress * Math.PI) * MAX_MOON_ELEVATION;
    const moonAzimuth = ((moonHours - 12) / 12) * AZIMUTH_SWING;
    const moonDir = directionFromElevationAzimuth(moonElevation, moonAzimuth);

    const sunHeight = sunDir[1]; // sine of the sun's elevation angle
    const dayAmount = smoothstep(-0.04, 0.18, sunHeight);
    const nightAmount = smoothstep(0.05, -0.08, sunHeight);
    const twilightAmount =
      Math.max(0, 1 - Math.abs(sunHeight) / 0.16) * 0.9;

    uniforms.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    uniforms.uMoonDir.value.set(moonDir[0], moonDir[1], moonDir[2]);

    // Light comes from whichever body is up (blended across the transition)
    const lightWeight = smoothstep(-0.05, 0.05, sunHeight);
    const lx = moonDir[0] + (sunDir[0] - moonDir[0]) * lightWeight;
    const ly = moonDir[1] + (sunDir[1] - moonDir[1]) * lightWeight;
    const lz = moonDir[2] + (sunDir[2] - moonDir[2]) * lightWeight;
    uniforms.uLightDir.value.set(lx, ly, lz).normalize();
    uniforms.uLightIntensity.value = 0.3 + 0.7 * dayAmount;

    setVecFromKey(uniforms.uSkyZenith, "skyZenith", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uSkyHorizon, "skyHorizon", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uAbyss, "abyss", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uHaze, "haze", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uCloudBright, "cloudBright", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uCloudMid, "cloudMid", dayAmount, twilightAmount);
    setVecFromKey(uniforms.uCloudShadow, "cloudShadow", dayAmount, twilightAmount);

    // Disc color: warm sun when it is up, cool moon when it is down
    blend3(scratchSun, dayTable.sun, twilightTable.sun, twilightAmount);
    blend3(scratchSun, nightTable.sun, scratchSun, lightWeight);
    uniforms.uSunColor.value.set(scratchSun[0], scratchSun[1], scratchSun[2]);

    uniforms.uStarAmount.value = smoothstep(0.06, -0.06, sunHeight);
    uniforms.uSunDiscAmount.value = smoothstep(-0.02, 0.03, sunHeight);
    uniforms.uMoonDiscAmount.value =
      smoothstep(-0.02, 0.05, moonDir[1]) * nightAmount;
    uniforms.uNightAmount.value = nightAmount;
  };

  const resolveHour = (): number =>
    typeof debugHour === "number" ? debugHour : currentLocalHour();

  let forcedHour: number | null =
    typeof debugHour === "number" ? debugHour : null;

  applySkyState(resolveHour());

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    uniforms,
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
  let skyRefreshAccumulator = Infinity; // force a refresh on the first tick
  const drawingBufferSize = new THREE.Vector2();

  const update = ({ deltaTime, renderer: activeRenderer }: TickState) => {
    activeRenderer.getDrawingBufferSize(drawingBufferSize);
    uniforms.uResolution.value.copy(drawingBufferSize);

    const delta = Math.min(Math.max(deltaTime, 0), 0.25);

    // Refresh the time-of-day roughly every 4s — the sun moves slowly and
    // this keeps `new Date()` off the per-frame path.
    skyRefreshAccumulator += delta;
    if (skyRefreshAccumulator >= 4) {
      skyRefreshAccumulator = 0;
      applySkyState(forcedHour ?? currentLocalHour());
    }

    if (reducedMotion) return;
    uniforms.uTime.value += delta * currentTimeScale;
  };

  const setParameter = (key: string, value: unknown) => {
    if (key === "timeScale" && typeof value === "number") {
      currentTimeScale = Math.max(0, value);
      return;
    }
    if (key === "timeOfDayHours") {
      forcedHour =
        typeof value === "number" ? ((value % 24) + 24) % 24 : null;
      applySkyState(forcedHour ?? currentLocalHour());
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
