/**
 * CloudsAnimation — hyper-real "above the clouds" background preset with a
 * full client-time-driven day/night cycle.
 *
 * The shader is **raw WGSL** (three's `wgslFn` + `wgsl` helper blocks — the
 * same idiom as games-client's volumetric clouds) on a WebGPU renderer.
 * TSL appears only as inert wiring: uniforms in, one function call out.
 * This preset therefore REQUIRES `backend: "webgpu"` on its Three instance
 * (ChatBackgroundComponent mounts it that way); there is deliberately no
 * WebGL/GLSL fallback — without WebGPU the CSS gradient behind it stays.
 *
 * ⚠ The WGSL lives inside JS template literals, so **no backtick may appear
 * anywhere in it — comments included** (games-client lost an afternoon to
 * one: the string closes early and the failure surfaces as a parse error
 * pointing at prose). Name things the long way in here. A WGSL compile
 * failure is also silent at runtime — the material simply draws nothing —
 * so console-check the browser when touching shader code.
 *
 * A single fullscreen triangle raymarches two volumetric cloud layers:
 *   - a near stratocumulus DECK just below the camera that recedes to a
 *     horizon ~70 km away (real planet-curvature term, so it sinks and
 *     curls over the limb like the view from a plane window), and
 *   - a higher, sparser CUMULUS layer that upward rays hit — the puffy
 *     clouds that sit above the horizon line in a separate pressure layer.
 * Over an analytic sky whose sun arcs across the sky, moon, star field,
 * and palette are all driven by the *client's real sun times*: the local
 * clock is warped through today's sunrise/sunset (shared NOAA sun math from
 * the components library, coordinates estimated from the IANA timezone) so
 * golden hour on screen lines up with golden hour out the window, in any
 * timezone and season.
 *
 * Time of day (computed on the CPU from `new Date()`, fed as uniforms):
 *   - Day: bright blue-shifted sky, small overexposed sun, sunlit tops.
 *   - Golden hour: warm horizon, golden cloud tops, long shadows.
 *   - Night: dark sky, moonlit clouds, procedural 3D star field + a subtle
 *     Milky Way band and a moon disc showing the real current lunar phase
 *     (terminator + earthshine); moonlight dims toward the new moon.
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
 *   - "timeOfDayHours": number|null — force a canonical solar hour (0..24,
 *     6 = sunrise, 12 = noon, 18 = sunset) for the sky, or null to follow
 *     the real clock again
 *   - "moonPhase": number|null — force a lunar phase (0 new … 0.5 full …
 *     wraps at 1), or null to follow the real calendar again
 *   - "typeImpulse": number — kick the forward fly-through speed (typing
 *     feedback); accumulates toward a cap and decays back to the idle drift,
 *     mirroring the agent coin's "spinImpulse"
 */

import { clamp } from "@rodrigo-barraza/utilities-library";
import {
  autoDayWindowMinutes,
  estimateClientCoordinates,
} from "@rodrigo-barraza/components-library";
import { NodeMaterial } from "three/webgpu";
import {
  positionGeometry,
  sampler,
  screenCoordinate,
  texture,
  uniform,
  wgsl,
  wgslFn,
} from "three/tsl";
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
   * Force a canonical solar hour (0..24, 6 = sunrise, 12 = noon,
   * 18 = sunset) instead of reading the client clock. For previews/QA;
   * leave undefined in production to follow real time.
   */
  debugHour?: number;
  /**
   * Force a lunar phase (0 = new, 0.25 = first quarter, 0.5 = full,
   * 0.75 = last quarter) instead of computing it from the date. For
   * previews/QA; leave undefined in production to follow the calendar.
   */
  debugMoonPhase?: number;
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

// Forward fly-through: idle drift speed and how a typing "impulse" ramps it.
// Idle stays slow (the scene should "drift by slowly"); typing kicks the
// camera into a fast fly-through that decays back to the calm drift.
const BASE_FORWARD_SPEED = 3.0; // units/sec — the calm idle drift
const FORWARD_BOOST_DECAY_PER_SECOND = 1.5; // eases back to idle after typing
const MAX_FORWARD_BOOST = 180.0; // cap so sustained typing tops out (~540 u/s)

// -- Camera / world constants (meters) — baked into the WGSL below -----
const CAMERA_HEIGHT = 430.0;
const CLOUD_BASE = -140.0;
const CLOUD_TOP = 330.0;
const HIGH_BASE = 1500.0;
const HIGH_TOP = 2650.0;
const EARTH_RADIUS = 6371000.0;
const CURVATURE = 1.0 / (2.0 * EARTH_RADIUS);
const MAX_DISTANCE = 120000.0;
const FOV_TAN = 0.4877; // vertical FOV ~52 deg
const PITCH_SIN = 0.0785; // ~4.5 deg downward pitch
const PITCH_COS = 0.9969;
const MAX_STEPS = 96;
const HIGH_STEPS = 44;
// Stylized moon size (real moon is ~0.0045 rad) — shared by the disc edge,
// limb darkening, and the phase terminator's disc-plane coordinates.
const MOON_ANGULAR_RADIUS = 0.0088;

/** Bake a JS number as a WGSL f32 literal ("430" becomes "430.0"). */
function f(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

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
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Client coordinates estimated once from the IANA timezone (city-level, no
// geolocation prompt) — they anchor the scene's sunrise/sunset to the sky
// the user can actually see.
const CLIENT_COORDINATES = estimateClientCoordinates();

/**
 * Canonical solar hour in [0, 24): the real clock warped so today's actual
 * sunrise lands on 6, solar noon on 12, and sunset on 18 — the fixed points
 * all the sun-arc/palette math below is written against. The night span is
 * stretched to fill sunset→sunrise the same way. During polar day/night
 * autoDayWindowMinutes falls back to fixed 07:00/19:00 bounds.
 */
function currentSolarHour(): number {
  const now = new Date();
  const minutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const { dayStart, dayEnd } = autoDayWindowMinutes(
    now,
    CLIENT_COORDINATES.latitude,
    CLIENT_COORDINATES.longitude,
  );
  if (minutes >= dayStart && minutes < dayEnd) {
    return 6 + (12 * (minutes - dayStart)) / (dayEnd - dayStart);
  }
  // Night: sunset→sunrise mapped onto 18→30 (mod 24). Today's window stands
  // in for the adjacent days' — sun times drift only ~1 minute per day.
  const nightLength = 1440 - (dayEnd - dayStart);
  const sinceSunset =
    minutes >= dayEnd ? minutes - dayEnd : minutes + 1440 - dayEnd;
  return (18 + (12 * sinceSunset) / nightLength) % 24;
}

// Mean synodic month + a known new-moon epoch (2000-01-06 18:14 UTC). The
// mean-cycle approximation is within ~half a day of the true phase — more
// than enough for a backdrop moon.
const SYNODIC_MONTH_DAYS = 29.530588853;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);

/** Lunar phase in [0, 1): 0 = new, 0.5 = full. */
function currentMoonPhase(): number {
  const days = (Date.now() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const phase = (days / SYNODIC_MONTH_DAYS) % 1;
  return phase < 0 ? phase + 1 : phase;
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

// ==================================================================
// The shader, in raw WGSL.
//
// Direct port of the original GLSL: identical constants, formulas, and
// march structure. The mechanical differences are WGSL-shaped only —
//   - scalars never broadcast across + and -, so additions splat through
//     explicit vec constructors
//   - no mod(): the floor-mod is written out where the noise lattice wraps
//   - no writes through swizzles: the accumulation vec4 is rebuilt (from
//     the PRE-update alpha, exactly as the GLSL read it)
//   - ternaries become select(), textureLod becomes textureSampleLevel
//   - the fragment coordinate runs top-down, so the ray flips it back
// ==================================================================

/** Shared world constants — one module-scope block every function reads. */
const WGSL_CONSTANTS = wgsl(/* wgsl */ `
const CLOUDS_CAMERA_HEIGHT: f32 = ${f(CAMERA_HEIGHT)};
const CLOUDS_BASE: f32 = ${f(CLOUD_BASE)};
const CLOUDS_TOP: f32 = ${f(CLOUD_TOP)};
const CLOUDS_HIGH_BASE: f32 = ${f(HIGH_BASE)};
const CLOUDS_HIGH_TOP: f32 = ${f(HIGH_TOP)};
const CLOUDS_CURVATURE: f32 = ${f(CURVATURE)};
const CLOUDS_MAX_DISTANCE: f32 = ${f(MAX_DISTANCE)};
const CLOUDS_FOV_TAN: f32 = ${f(FOV_TAN)};
const CLOUDS_PITCH_SIN: f32 = ${f(PITCH_SIN)};
const CLOUDS_PITCH_COS: f32 = ${f(PITCH_COS)};
const CLOUDS_MAX_STEPS: i32 = ${MAX_STEPS};
const CLOUDS_HIGH_STEPS: i32 = ${HIGH_STEPS};
const CLOUDS_MOON_RADIUS: f32 = ${f(MOON_ANGULAR_RADIUS)};
`);

const WGSL_HASHES = wgsl(/* wgsl */ `
fn cloudsHash12(p: vec2<f32>) -> f32 {
  var p3 = fract(p.xyx * 0.1031);
  p3 = p3 + vec3<f32>(dot(p3, p3.yzx + vec3<f32>(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}
fn cloudsHash13(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 + vec3<f32>(dot(p3, p3.zyx + vec3<f32>(31.32)));
  return fract((p3.x + p3.y) * p3.z);
}
fn cloudsHash33(p: vec3<f32>) -> vec3<f32> {
  var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + vec3<f32>(dot(p3, p3.yxz + vec3<f32>(33.33)));
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
`);

// Virtual 3D value noise from the packed 2D texture: R = slice z, G = slice
// z+1, bilinear filtering interpolates x/y, mix() interpolates z. The
// integer lattice wraps BEFORE adding the fraction — cell products are
// exact integers in float32, so texture coordinates stay small and precise
// even 100 km from the origin (avoids far-field banding).
const WGSL_NOISE = wgsl(/* wgsl */ `
fn cloudsNoise3(tex: texture_2d<f32>, samp: sampler, x: vec3<f32>) -> f32 {
  let cell = floor(x);
  var fr = fract(x);
  fr = fr * fr * (vec3<f32>(3.0) - 2.0 * fr);
  let lattice = cell.xy + vec2<f32>(37.0, 239.0) * cell.z;
  let wrapped = lattice - 256.0 * floor(lattice / 256.0);
  let uv = wrapped + fr.xy;
  let rg = textureSampleLevel(tex, samp, (uv + vec2<f32>(0.5)) / 256.0, 0.0).rg;
  return mix(rg.x, rg.y, fr.z) * 2.0 - 1.0;
}

fn cloudsFbm(tex: texture_2d<f32>, samp: sampler, pIn: vec3<f32>, octaves: i32) -> f32 {
  let rotation = mat3x3<f32>(
    vec3<f32>(0.0, 0.80, 0.60),
    vec3<f32>(-0.80, 0.36, -0.48),
    vec3<f32>(-0.60, -0.48, 0.64));
  var p = pIn;
  var value = 0.0;
  var amplitude = 0.5;
  for (var i = 0; i < 5; i = i + 1) {
    if (i >= octaves) { break; }
    value = value + amplitude * cloudsNoise3(tex, samp, p);
    p = rotation * p * 2.04;
    amplitude = amplitude * 0.46;
  }
  return value;
}
`);

// Densities: ultra-low-frequency clump coverage breaks the deck into
// distinct cloud systems with blue gaps (~6 km wavelength); the vertical
// profiles erode upward for cauliflower tops (deck) and round the sparse
// high cumulus toward their mid-slab.
const WGSL_DENSITY = wgsl(/* wgsl */ `
fn cloudsClumpAt(tex: texture_2d<f32>, samp: sampler, p: vec3<f32>, seed: vec3<f32>) -> f32 {
  return cloudsNoise3(tex, samp, vec3<f32>(
    p.x * 0.00016 + seed.x * 39.0,
    3.7 + seed.y * 17.0,
    p.z * 0.00016 + seed.z * 27.0));
}

fn cloudsDeckDensity(tex: texture_2d<f32>, samp: sampler, p: vec3<f32>,
    heightFraction: f32, clump: f32, octaves: i32,
    time: f32, seed: vec3<f32>, coverage: f32) -> f32 {
  let q = p * 0.0016
    + vec3<f32>(time * 0.030, 0.0, time * 0.011)
    + seed * 23.0;
  let shape = cloudsFbm(tex, samp, q, octaves);
  var density = coverage + 0.38 * clump + 0.68 * shape;
  density = density - 0.85 * pow(heightFraction, 1.35);
  density = density - 0.22 * pow(1.0 - heightFraction, 3.0);
  return clamp(density * 1.5, 0.0, 1.0);
}

fn cloudsHighDensity(tex: texture_2d<f32>, samp: sampler, p: vec3<f32>,
    heightFraction: f32, octaves: i32,
    time: f32, seed: vec3<f32>, coverage: f32) -> f32 {
  let q = p * 0.00105
    + vec3<f32>(time * 0.020, 0.0, time * 0.006)
    + seed * 7.0;
  let shape = cloudsFbm(tex, samp, q, octaves);
  let clump = cloudsNoise3(tex, samp, vec3<f32>(
    p.x * 0.000085 + seed.z * 9.0,
    12.0,
    p.z * 0.000085 + seed.x * 5.0));
  var density = (coverage * 0.62 - 0.09) + 0.52 * clump + 0.62 * shape;
  let centered = (heightFraction - 0.46) * 2.0;
  density = density - 1.05 * centered * centered;
  return clamp(density * 1.5, 0.0, 1.0);
}
`);

// Star field: 3 cell-hash layers with diffraction spikes and twinkle, a
// Milky Way dust band across a tilted great circle, and faint airglow so
// the night sky is never a dead flat navy.
const WGSL_STARS = wgsl(/* wgsl */ `
fn cloudsStarField(tex: texture_2d<f32>, samp: sampler, rd: vec3<f32>,
    time: f32, seed: vec3<f32>) -> vec3<f32> {
  var col = vec3<f32>(0.0);
  for (var starLayer = 0; starLayer < 3; starLayer = starLayer + 1) {
    let scale = 110.0 + f32(starLayer) * 95.0;
    let p = rd * scale;
    let cell = floor(p);
    let fr = p - cell;
    let r = cloudsHash33(cell + vec3<f32>(f32(starLayer) * 23.0));
    let bright = cloudsHash13(cell * 1.31 + vec3<f32>(f32(starLayer) * 7.0));
    let present = smoothstep(0.80, 0.965, bright);
    if (present > 0.0) {
      let starPos = vec3<f32>(0.25) + 0.5 * r;
      let d = length(fr - starPos);
      var core = exp(-d * d * 300.0);
      let spike = max(0.0, 1.0 - abs(fr.x - starPos.x) * 42.0)
                + max(0.0, 1.0 - abs(fr.y - starPos.y) * 42.0);
      core = core + spike * smoothstep(0.93, 0.965, bright) * 0.18
              * exp(-d * d * 40.0);
      let twinkle = 0.55 + 0.45 * sin(time * 1.6 + r.x * 40.0);
      let tint = mix(vec3<f32>(0.70, 0.81, 1.0), vec3<f32>(1.0, 0.86, 0.68), r.z);
      col = col + core * present * twinkle * tint * (0.7 + bright * 1.3);
    }
  }
  let bandNormal = normalize(vec3<f32>(0.62, 0.34, -0.71));
  let band = 1.0 - smoothstep(0.0, 0.40, abs(dot(rd, bandNormal)));
  let glow = cloudsFbm(tex, samp, rd * 4.0 + seed * 5.0, 4) * 0.5 + 0.5;
  let dust = cloudsFbm(tex, samp, rd * 9.0 + vec3<f32>(11.0), 3) * 0.5 + 0.5;
  col = col + band * band * glow * (1.0 - dust * 0.5) * vec3<f32>(0.40, 0.48, 0.70) * 0.16;
  col = col + vec3<f32>(0.02, 0.03, 0.055) * (cloudsFbm(tex, samp, rd * 2.2 + vec3<f32>(7.0), 3) * 0.5 + 0.5);
  return col;
}
`);

// Sky gradient with the abyss below the horizon line, a haze convergence
// band that hides the sky/deck seam, night stars, and the sun as a small
// overexposed disc + tight glow + wide subtle veil.
const WGSL_SKY = wgsl(/* wgsl */ `
fn cloudsSkyColor(tex: texture_2d<f32>, samp: sampler, rd: vec3<f32>,
    time: f32, seed: vec3<f32>,
    skyZenith: vec3<f32>, skyHorizon: vec3<f32>, abyss: vec3<f32>, haze: vec3<f32>,
    starAmount: f32, sunDir: vec3<f32>, sunColor: vec3<f32>, sunDiscAmount: f32) -> vec3<f32> {
  let up = rd.y;
  var sky = mix(
    skyHorizon,
    skyZenith,
    pow(clamp(up * 1.25 + 0.14, 0.0, 1.0), 0.55));
  let depth = mix(skyHorizon, abyss, clamp(-up * 7.0, 0.0, 1.0));
  sky = mix(depth, sky, step(0.0, up));
  sky = mix(haze, sky, smoothstep(0.0, 0.04, abs(up)));
  if (starAmount > 0.001 && up > -0.02) {
    sky = sky + cloudsStarField(tex, samp, rd, time, seed) * starAmount
        * smoothstep(-0.02, 0.06, up);
  }
  let sunDot = clamp(dot(rd, sunDir), 0.0, 1.0);
  sky = sky + sunColor * sunDiscAmount * (
    pow(sunDot, 18000.0) * 2.4 +
    pow(sunDot, 800.0) * 0.16 +
    pow(sunDot, 24.0) * 0.04);
  return sky;
}
`);

// Moon: phase-lit disc (terminator + earthshine) with limb darkening,
// subtle maria and a halo that dims toward the new moon. Composited
// separately in the main function with partial transmittance through the
// high cloud layer, so the moon glows through thin cumulus instead of
// vanishing behind it. moonPhase packs (sin elongation, cos phase angle,
// illuminated fraction); basisX points toward the bright limb.
const WGSL_MOON = wgsl(/* wgsl */ `
fn cloudsMoonLight(tex: texture_2d<f32>, samp: sampler, rd: vec3<f32>, seed: vec3<f32>,
    moonDir: vec3<f32>, moonBasisX: vec3<f32>, moonBasisY: vec3<f32>,
    moonPhase: vec3<f32>, moonDiscAmount: f32, sunColor: vec3<f32>) -> vec3<f32> {
  if (moonDiscAmount <= 0.001) { return vec3<f32>(0.0); }

  let moonDot = clamp(dot(rd, moonDir), 0.0, 1.0);
  let ang = acos(min(moonDot, 1.0));
  let disc = 1.0 - smoothstep(0.0075, CLOUDS_MOON_RADIUS, ang);

  let offAxis = rd - moonDir * moonDot;
  let discX = dot(offAxis, moonBasisX) / CLOUDS_MOON_RADIUS;
  let discY = dot(offAxis, moonBasisY) / CLOUDS_MOON_RADIUS;
  let discZ = sqrt(max(0.0, 1.0 - discX * discX - discY * discY));

  let lit = smoothstep(-0.10, 0.14, discX * moonPhase.x - discZ * moonPhase.y);
  let shade = 0.07 + 0.93 * lit;

  let limb = sqrt(clamp(1.0 - pow(ang / CLOUDS_MOON_RADIUS, 2.0), 0.0, 1.0));
  let maria = 0.72 + 0.28 * cloudsFbm(tex, samp, rd * 380.0 + seed, 3);
  let halo = 0.25 + 0.75 * moonPhase.z;
  return sunColor * moonDiscAmount * (
    disc * (0.62 + 0.38 * limb) * maria * shade * 1.5 +
    (pow(moonDot, 5000.0) * 0.4 + pow(moonDot, 40.0) * 0.03) * halo);
}
`);

// Low deck march: slab entry with planet curvature (a t*t + rd.y t +
// (h - TOP) = 0), distance-growing steps, octave LOD by distance, one
// light sample toward the sun for self-shadowed silver tops.
const WGSL_MARCH_DECK = wgsl(/* wgsl */ `
fn cloudsMarchDeck(tex: texture_2d<f32>, samp: sampler,
    ro: vec3<f32>, rd: vec3<f32>, dither: f32,
    time: f32, seed: vec3<f32>, coverage: f32,
    lightDir: vec3<f32>, lightIntensity: f32,
    cloudShadow: vec3<f32>, cloudMid: vec3<f32>, cloudBright: vec3<f32>,
    haze: vec3<f32>) -> vec4<f32> {
  // Upward rays only rise relative to the curved shell — they can never
  // enter the deck below. Sky pixels skip the deck march.
  if (rd.y >= 0.0) { return vec4<f32>(0.0); }

  let aboveTop = ro.y - CLOUDS_TOP;
  let discriminant = rd.y * rd.y - 4.0 * CLOUDS_CURVATURE * aboveTop;
  if (discriminant < 0.0) { return vec4<f32>(0.0); }

  let sqrtDisc = sqrt(discriminant);
  let tEnter = (-rd.y - sqrtDisc) / (2.0 * CLOUDS_CURVATURE);
  let tExit = min((-rd.y + sqrtDisc) / (2.0 * CLOUDS_CURVATURE), CLOUDS_MAX_DISTANCE);
  if (tEnter >= tExit) { return vec4<f32>(0.0); }

  var accumulated = vec4<f32>(0.0);
  var t = tEnter + dither * max(14.0, tEnter * 0.024);

  for (var i = 0; i < CLOUDS_MAX_STEPS; i = i + 1) {
    if (accumulated.a > 0.985 || t > tExit) { break; }

    let stepLength = max(14.0, t * 0.024);
    let samplePoint = ro + rd * t;
    let shellY = samplePoint.y + (t * t) * CLOUDS_CURVATURE;

    if (shellY < CLOUDS_BASE - 30.0) { break; }

    let heightFraction = (shellY - CLOUDS_BASE) / (CLOUDS_TOP - CLOUDS_BASE);
    if (heightFraction >= 0.0 && heightFraction <= 1.0) {
      let clump = cloudsClumpAt(tex, samp, samplePoint, seed);
      let octaves = select(select(3, 4, t < 22000.0), 5, t < 6000.0);
      let density = cloudsDeckDensity(tex, samp, samplePoint, heightFraction,
        clump, octaves, time, seed, coverage);

      if (density > 0.012) {
        let lightPoint = samplePoint + lightDir * 55.0;
        let lightShellY = lightPoint.y + (t * t) * CLOUDS_CURVATURE;
        let lightHeight = clamp(
          (lightShellY - CLOUDS_BASE) / (CLOUDS_TOP - CLOUDS_BASE), 0.0, 1.0);
        let lightDensity = cloudsDeckDensity(tex, samp, lightPoint, lightHeight,
          clump, max(octaves - 2, 2), time, seed, coverage);
        let sunlight = clamp((density - lightDensity) * 3.4 + 0.02, 0.0, 1.0);

        var cloudColor = mix(cloudShadow, cloudMid, heightFraction)
          + cloudBright * sunlight * lightIntensity;

        let hazeAmount = 1.0 - exp(-t * 0.000022);
        cloudColor = mix(cloudColor, haze, hazeAmount);

        let alpha = 1.0 - exp(-density * stepLength * 0.016);
        // Rebuilt from the PRE-update alpha on both lanes, exactly as the
        // GLSL read it (rgb blended by the old coverage, then a updated).
        let previousAlpha = accumulated.a;
        accumulated = vec4<f32>(
          accumulated.rgb + cloudColor * alpha * (1.0 - previousAlpha),
          previousAlpha + alpha * (1.0 - previousAlpha));

        t = t + stepLength;
        continue;
      }
    }
    t = t + stepLength * 1.35;
  }
  return accumulated;
}
`);

// High cumulus march: forward crossings of the two shell heights (the
// camera sits below both), fixed step count across the slab span.
const WGSL_MARCH_HIGH = wgsl(/* wgsl */ `
fn cloudsMarchHigh(tex: texture_2d<f32>, samp: sampler,
    ro: vec3<f32>, rd: vec3<f32>, dither: f32,
    time: f32, seed: vec3<f32>, coverage: f32,
    lightDir: vec3<f32>, lightIntensity: f32,
    cloudShadow: vec3<f32>, cloudMid: vec3<f32>, cloudBright: vec3<f32>,
    haze: vec3<f32>) -> vec4<f32> {
  // Only rays aimed at or above the horizon reach the upper layer.
  if (rd.y < -0.02) { return vec4<f32>(0.0); }

  let belowBase = ro.y - CLOUDS_HIGH_BASE;
  let belowTop = ro.y - CLOUDS_HIGH_TOP;
  let discBase = rd.y * rd.y - 4.0 * CLOUDS_CURVATURE * belowBase;
  if (discBase < 0.0) { return vec4<f32>(0.0); }
  let tEnter = (-rd.y + sqrt(discBase)) / (2.0 * CLOUDS_CURVATURE);
  if (tEnter > CLOUDS_MAX_DISTANCE) { return vec4<f32>(0.0); }

  let discTop = rd.y * rd.y - 4.0 * CLOUDS_CURVATURE * belowTop;
  var tExit = CLOUDS_MAX_DISTANCE;
  if (discTop >= 0.0) {
    tExit = (-rd.y + sqrt(discTop)) / (2.0 * CLOUDS_CURVATURE);
  }
  tExit = min(tExit, CLOUDS_MAX_DISTANCE);
  if (tEnter >= tExit) { return vec4<f32>(0.0); }

  var accumulated = vec4<f32>(0.0);
  let span = tExit - tEnter;
  let stepLength = max(55.0, span / f32(CLOUDS_HIGH_STEPS));
  var t = tEnter + dither * stepLength;

  for (var i = 0; i < CLOUDS_HIGH_STEPS; i = i + 1) {
    if (accumulated.a > 0.97 || t > tExit) { break; }

    let samplePoint = ro + rd * t;
    let shellY = samplePoint.y + (t * t) * CLOUDS_CURVATURE;
    let heightFraction = (shellY - CLOUDS_HIGH_BASE) / (CLOUDS_HIGH_TOP - CLOUDS_HIGH_BASE);

    if (heightFraction >= 0.0 && heightFraction <= 1.0) {
      let octaves = select(3, 4, t < 16000.0);
      let density = cloudsHighDensity(tex, samp, samplePoint, heightFraction,
        octaves, time, seed, coverage);

      if (density > 0.02) {
        let lightPoint = samplePoint + lightDir * 90.0;
        let lightShellY = lightPoint.y + (t * t) * CLOUDS_CURVATURE;
        let lightHeight = clamp(
          (lightShellY - CLOUDS_HIGH_BASE) / (CLOUDS_HIGH_TOP - CLOUDS_HIGH_BASE), 0.0, 1.0);
        let lightDensity = cloudsHighDensity(tex, samp, lightPoint, lightHeight,
          2, time, seed, coverage);
        let sunlight = clamp((density - lightDensity) * 3.0 + 0.05, 0.0, 1.0);

        var cloudColor = mix(cloudShadow, cloudMid, heightFraction)
          + cloudBright * sunlight * lightIntensity;

        let hazeAmount = 1.0 - exp(-t * 0.000013);
        cloudColor = mix(cloudColor, haze, hazeAmount * 0.92);

        let alpha = 1.0 - exp(-density * stepLength * 0.02);
        let previousAlpha = accumulated.a;
        accumulated = vec4<f32>(
          accumulated.rgb + cloudColor * alpha * (1.0 - previousAlpha),
          previousAlpha + alpha * (1.0 - previousAlpha));
      }
    }
    t = t + stepLength;
  }
  return accumulated;
}
`);

/**
 * The whole frame: fixed-basis ray, sky, far-to-near composite (high
 * cumulus, moon punching partially through it, then the near deck), and
 * the legibility vignette. One wgslFn — everything above rides in as
 * includes; TSL's only job is delivering the uniforms.
 */
const CLOUDS_FRAGMENT = wgslFn(
  /* wgsl */ `
fn cloudsFragment(
  pixel: vec2<f32>,
  resolution: vec2<f32>,
  time: f32,
  forward: f32,
  seed: vec3<f32>,
  coverage: f32,
  sunDir: vec3<f32>,
  moonDir: vec3<f32>,
  lightDir: vec3<f32>,
  lightIntensity: f32,
  skyZenith: vec3<f32>,
  skyHorizon: vec3<f32>,
  abyss: vec3<f32>,
  haze: vec3<f32>,
  cloudBright: vec3<f32>,
  cloudMid: vec3<f32>,
  cloudShadow: vec3<f32>,
  sunColor: vec3<f32>,
  starAmount: f32,
  sunDiscAmount: f32,
  moonDiscAmount: f32,
  nightAmount: f32,
  moonBasisX: vec3<f32>,
  moonBasisY: vec3<f32>,
  moonPhase: vec3<f32>,
  noiseTex: texture_2d<f32>,
  noiseSamp: sampler
) -> vec4<f32> {
  // Fragment coordinates run top-down on WebGPU; the camera math below is
  // written y-up like the original, so flip before building the ray.
  let frag = vec2<f32>(pixel.x, resolution.y - pixel.y);
  let ndc = (frag * 2.0 - resolution) / resolution.y;

  // Fixed camera basis: forward +Z with a slight downward pitch
  let rayCamera = normalize(vec3<f32>(ndc.x * CLOUDS_FOV_TAN, ndc.y * CLOUDS_FOV_TAN, 1.0));
  let rd = vec3<f32>(
    rayCamera.x,
    rayCamera.y * CLOUDS_PITCH_COS - rayCamera.z * CLOUDS_PITCH_SIN,
    rayCamera.y * CLOUDS_PITCH_SIN + rayCamera.z * CLOUDS_PITCH_COS);

  // Forward fly-through position (accelerates while the user types)
  let ro = vec3<f32>(0.0, CLOUDS_CAMERA_HEIGHT, forward);

  var color = cloudsSkyColor(noiseTex, noiseSamp, rd, time, seed,
    skyZenith, skyHorizon, abyss, haze,
    starAmount, sunDir, sunColor, sunDiscAmount);

  let dither = cloudsHash12(pixel);

  // Composite far to near: high cumulus behind, then the near deck in front
  let high = cloudsMarchHigh(noiseTex, noiseSamp, ro, rd, dither,
    time, seed, coverage, lightDir, lightIntensity,
    cloudShadow, cloudMid, cloudBright, haze);
  color = color * (1.0 - high.a) + high.rgb;

  // The moon punches partially through the high layer — behind cumulus it
  // dims to a diffuse glow instead of disappearing for hours at a time.
  color = color + cloudsMoonLight(noiseTex, noiseSamp, rd, seed,
    moonDir, moonBasisX, moonBasisY, moonPhase, moonDiscAmount, sunColor)
    * (1.0 - 0.72 * high.a);

  let deck = cloudsMarchDeck(noiseTex, noiseSamp, ro, rd, dither,
    time, seed, coverage, lightDir, lightIntensity,
    cloudShadow, cloudMid, cloudBright, haze);
  color = color * (1.0 - deck.a) + deck.rgb;

  // Gentle vignette keeps centered UI legible (softened at night)
  let vignetteUv = ndc * vec2<f32>(0.72, 0.85);
  let vignette = 0.16 * (1.0 - 0.45 * nightAmount);
  color = color * (1.0 - vignette * smoothstep(0.55, 1.35, length(vignetteUv)));

  return vec4<f32>(color, 1.0);
}
`,
  [
    WGSL_CONSTANTS,
    WGSL_HASHES,
    WGSL_NOISE,
    WGSL_DENSITY,
    WGSL_STARS,
    WGSL_SKY,
    WGSL_MOON,
    WGSL_MARCH_DECK,
    WGSL_MARCH_HIGH,
  ],
);

/** Fullscreen triangle passthrough — positions are already clip-space. */
const CLOUDS_VERTEX = wgslFn(/* wgsl */ `
fn cloudsVertex(position: vec3<f32>) -> vec4<f32> {
  return vec4<f32>(position.x, position.y, 0.0, 1.0);
}
`);

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
    debugMoonPhase,
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

  // Forward position starts at a per-mount offset (matches the old uTime*3
  // drift seed) so every conversation flies through a different stretch.
  let forwardDistance = seed.x * 1200;
  let forwardBoost = 1; // 1 = idle drift; typing kicks this up (see coin spin)

  // TSL uniform nodes. Same keys and `.value` mutation semantics as the
  // old ShaderMaterial uniforms — applySkyState/update below are untouched.
  const uniforms = {
    uResolution: uniform(new THREE.Vector2(1, 1)),
    uTime: uniform(reducedMotion ? 120 + seed.x * 400 : seed.x * 400),
    uForward: uniform(forwardDistance),
    uSeed: uniform(seed),
    uCoverage: uniform(coverage),
    uSunDir: uniform(new THREE.Vector3(0, 1, 0)),
    uMoonDir: uniform(new THREE.Vector3(0, 1, 0)),
    uLightDir: uniform(new THREE.Vector3(0, 1, 0)),
    uLightIntensity: uniform(1),
    uSkyZenith: uniform(new THREE.Vector3()),
    uSkyHorizon: uniform(new THREE.Vector3()),
    uAbyss: uniform(new THREE.Vector3()),
    uHaze: uniform(new THREE.Vector3()),
    uCloudBright: uniform(new THREE.Vector3()),
    uCloudMid: uniform(new THREE.Vector3()),
    uCloudShadow: uniform(new THREE.Vector3()),
    uSunColor: uniform(new THREE.Vector3()),
    uStarAmount: uniform(0),
    uSunDiscAmount: uniform(1),
    uMoonDiscAmount: uniform(0),
    uNightAmount: uniform(0),
    uMoonBasisX: uniform(new THREE.Vector3(1, 0, 0)),
    uMoonBasisY: uniform(new THREE.Vector3(0, 1, 0)),
    uMoonPhase: uniform(new THREE.Vector3(0, -1, 1)),
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
  // Kept under the ~21° frame top so the moon stays visible through the
  // whole night instead of arcing out of frame around midnight.
  const MAX_MOON_ELEVATION = 0.3; // radians (~17°)
  // Narrow horizontal swing keeps the disc inside the ~±26° horizontal frame
  // when it is low enough to clear the frame top — so the sun/moon read as
  // rising front-left in the morning and setting front-right in the evening.
  const AZIMUTH_SWING = 0.55; // radians (~±16° across daylight hours)

  const applySkyState = (hours: number) => {
    // `hours` is the canonical solar hour (see currentSolarHour): sun arc
    // rises at 6, peaks at 12, sets at 18, bottoms out at 0/24.
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

    // Real lunar phase → terminator shape and how bright the night is.
    // The shader's terminator uses the elongation form (|sin|), so waxing
    // vs waning shows up through the bright-limb basis below, which tracks
    // the sun's (possibly below-horizon) side of the sky.
    const moonPhase = forcedMoonPhase ?? currentMoonPhase();
    const phaseAngle = moonPhase * Math.PI * 2;
    const phaseCos = Math.cos(phaseAngle);
    const elongationSin = Math.abs(Math.sin(phaseAngle));
    const moonIllumination = 0.5 * (1 - phaseCos);

    // Bright-limb axis: sun direction projected off the moon axis…
    const sunAlongMoon =
      sunDir[0] * moonDir[0] + sunDir[1] * moonDir[1] + sunDir[2] * moonDir[2];
    let basisX: Rgb = [
      sunDir[0] - moonDir[0] * sunAlongMoon,
      sunDir[1] - moonDir[1] * sunAlongMoon,
      sunDir[2] - moonDir[2] * sunAlongMoon,
    ];
    const basisLength = Math.hypot(basisX[0], basisX[1], basisX[2]);
    basisX =
      basisLength > 1e-4
        ? [
            basisX[0] / basisLength,
            basisX[1] / basisLength,
            basisX[2] / basisLength,
          ]
        : [1, 0, 0]; // sun collinear with the moon — orientation is moot
    // …and its perpendicular completes the disc-plane frame
    const basisY: Rgb = [
      moonDir[1] * basisX[2] - moonDir[2] * basisX[1],
      moonDir[2] * basisX[0] - moonDir[0] * basisX[2],
      moonDir[0] * basisX[1] - moonDir[1] * basisX[0],
    ];
    uniforms.uMoonBasisX.value.set(basisX[0], basisX[1], basisX[2]);
    uniforms.uMoonBasisY.value.set(basisY[0], basisY[1], basisY[2]);
    uniforms.uMoonPhase.value.set(elongationSin, phaseCos, moonIllumination);

    // Light comes from whichever body is up (blended across the transition)
    const lightWeight = smoothstep(-0.05, 0.05, sunHeight);
    const lx = moonDir[0] + (sunDir[0] - moonDir[0]) * lightWeight;
    const ly = moonDir[1] + (sunDir[1] - moonDir[1]) * lightWeight;
    const lz = moonDir[2] + (sunDir[2] - moonDir[2]) * lightWeight;
    uniforms.uLightDir.value.set(lx, ly, lz).normalize();
    // Night floor scales with the moon's illumination — a full-moon night
    // matches the old 0.3, a new-moon night drops noticeably darker.
    const nightIntensity = 0.16 + 0.14 * moonIllumination;
    uniforms.uLightIntensity.value =
      nightIntensity + (1 - nightIntensity) * dayAmount;

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
    typeof debugHour === "number" ? debugHour : currentSolarHour();

  let forcedHour: number | null =
    typeof debugHour === "number" ? debugHour : null;
  let forcedMoonPhase: number | null =
    typeof debugMoonPhase === "number"
      ? ((debugMoonPhase % 1) + 1) % 1
      : null;

  applySkyState(resolveHour());

  // -- Material: raw-WGSL fragment on a node material ----------------
  // The instance renders with the identity output transform (see
  // ThreeBackgroundComponent), so the shader's sRGB-authored palette
  // reaches the canvas byte-for-byte like the old raw ShaderMaterial.
  const material = new NodeMaterial();
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  material.vertexNode = CLOUDS_VERTEX({ position: positionGeometry });
  material.fragmentNode = CLOUDS_FRAGMENT({
    pixel: screenCoordinate,
    resolution: uniforms.uResolution,
    time: uniforms.uTime,
    forward: uniforms.uForward,
    seed: uniforms.uSeed,
    coverage: uniforms.uCoverage,
    sunDir: uniforms.uSunDir,
    moonDir: uniforms.uMoonDir,
    lightDir: uniforms.uLightDir,
    lightIntensity: uniforms.uLightIntensity,
    skyZenith: uniforms.uSkyZenith,
    skyHorizon: uniforms.uSkyHorizon,
    abyss: uniforms.uAbyss,
    haze: uniforms.uHaze,
    cloudBright: uniforms.uCloudBright,
    cloudMid: uniforms.uCloudMid,
    cloudShadow: uniforms.uCloudShadow,
    sunColor: uniforms.uSunColor,
    starAmount: uniforms.uStarAmount,
    sunDiscAmount: uniforms.uSunDiscAmount,
    moonDiscAmount: uniforms.uMoonDiscAmount,
    nightAmount: uniforms.uNightAmount,
    moonBasisX: uniforms.uMoonBasisX,
    moonBasisY: uniforms.uMoonBasisY,
    moonPhase: uniforms.uMoonPhase,
    noiseTex: texture(noiseTexture),
    noiseSamp: sampler(noiseTexture),
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

    const delta = clamp(deltaTime, 0, 0.25);

    // Refresh the time-of-day roughly every 4s — the sun moves slowly and
    // this keeps `new Date()` off the per-frame path.
    skyRefreshAccumulator += delta;
    if (skyRefreshAccumulator >= 4) {
      skyRefreshAccumulator = 0;
      applySkyState(forcedHour ?? currentSolarHour());
    }

    if (reducedMotion) return;
    uniforms.uTime.value += delta * currentTimeScale;

    // Forward fly-through: decay the typing boost back toward idle (1) with
    // frame-rate-independent easing, then advance the camera by the boosted
    // speed. Sustained typing keeps re-kicking it → faster and faster.
    forwardBoost =
      1 + (forwardBoost - 1) * Math.exp(-FORWARD_BOOST_DECAY_PER_SECOND * delta);
    forwardDistance +=
      delta * BASE_FORWARD_SPEED * forwardBoost * currentTimeScale;
    uniforms.uForward.value = forwardDistance;
  };

  const setParameter = (key: string, value: unknown) => {
    if (key === "timeScale" && typeof value === "number") {
      currentTimeScale = Math.max(0, value);
      return;
    }
    if (key === "typeImpulse" && typeof value === "number") {
      forwardBoost = Math.min(forwardBoost + value, MAX_FORWARD_BOOST);
      return;
    }
    if (key === "timeOfDayHours") {
      forcedHour =
        typeof value === "number" ? ((value % 24) + 24) % 24 : null;
      applySkyState(forcedHour ?? currentSolarHour());
      return;
    }
    if (key === "moonPhase") {
      forcedMoonPhase =
        typeof value === "number" ? ((value % 1) + 1) % 1 : null;
      applySkyState(forcedHour ?? currentSolarHour());
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
