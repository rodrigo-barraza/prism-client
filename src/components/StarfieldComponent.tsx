"use client";

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";

/**
 * StarfieldComponent — Deep-field starry sky with Milky Way band,
 * real northern hemisphere constellations, nebula patches,
 * and a galactic core glow.
 * Sharp pinpoint stars, subtle twinkling, parallax offset.
 */

// -- Type Definitions ------------------------------------------

interface StarfieldProps {
  className?: string;
  style?: CSSProperties;
  panX?: number;
  panY?: number;
}

interface FieldStar {
  x: number;
  y: number;
  radius: number;
  brightness: number;
  r: number;
  g: number;
  b: number;
  twinkleSpeed: number;
  twinklePhase: number;
  twinkleAmount: number;
}

interface ConstellationStar extends FieldStar {}

interface ConstellationData {
  name: string;
  stars: ConstellationStar[];
  edges: number[][];
}

type SeededRng = () => number;

// -- Seeded RNG --

function seededRandom(seed: number): SeededRng {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// -- Real northern hemisphere constellations --
// Coordinates are in a 0–1 normalized space, laid out as they roughly
// appear across the northern sky. Each constellation has named stars
// with (x,y) positions and a list of edge pairs (indices into the stars
// array) defining the stick figure.

const CONSTELLATIONS = [
  {
    name: "Ursa Major",
    stars: [
      { x: 0.08, y: 0.18 }, // Dubhe (α)
      { x: 0.11, y: 0.2 }, // Merak (β)
      { x: 0.12, y: 0.15 }, // Phecda (γ)
      { x: 0.09, y: 0.13 }, // Megrez (δ)
      { x: 0.06, y: 0.11 }, // Alioth (ε)
      { x: 0.04, y: 0.09 }, // Mizar (ζ)
      { x: 0.02, y: 0.07 }, // Alkaid (η)
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    name: "Ursa Minor",
    stars: [
      { x: 0.12, y: 0.04 }, // Polaris (α)
      { x: 0.14, y: 0.06 }, // Kochab (β)
      { x: 0.15, y: 0.05 }, // Pherkad (γ)
      { x: 0.14, y: 0.03 }, // δ
      { x: 0.13, y: 0.02 }, // ε
      { x: 0.12, y: 0.025 }, // ζ
      { x: 0.115, y: 0.035 }, // η
    ],
    edges: [
      [0, 6],
      [6, 5],
      [5, 4],
      [4, 3],
      [3, 2],
      [2, 1],
      [1, 0],
    ],
  },
  {
    name: "Cassiopeia",
    stars: [
      { x: 0.26, y: 0.06 }, // Schedar (α)
      { x: 0.28, y: 0.04 }, // Caph (β)
      { x: 0.24, y: 0.05 }, // γ
      { x: 0.22, y: 0.07 }, // δ
      { x: 0.2, y: 0.06 }, // ε
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    name: "Orion",
    stars: [
      { x: 0.42, y: 0.62 }, // Betelgeuse (α)
      { x: 0.48, y: 0.72 }, // Rigel (β)
      { x: 0.44, y: 0.66 }, // Bellatrix (γ)
      { x: 0.46, y: 0.68 }, // Mintaka (δ) — belt
      { x: 0.45, y: 0.67 }, // Alnilam (ε) — belt
      { x: 0.44, y: 0.68 }, // Alnitak (ζ) — belt
      { x: 0.47, y: 0.62 }, // Saiph (κ)
      { x: 0.43, y: 0.72 }, // Meissa (λ) — head area
    ],
    edges: [
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 1],
      [1, 3],
      [3, 0],
      [3, 4],
      [4, 5],
      [0, 7],
    ],
  },
  {
    name: "Cygnus",
    stars: [
      { x: 0.58, y: 0.14 }, // Deneb (α)
      { x: 0.6, y: 0.2 }, // Sadr (γ) — center
      { x: 0.62, y: 0.26 }, // Albireo (β)
      { x: 0.56, y: 0.2 }, // Gienah (ε)
      { x: 0.64, y: 0.19 }, // δ
    ],
    edges: [
      [0, 1],
      [1, 2],
      [3, 1],
      [1, 4],
    ],
  },
  {
    name: "Leo",
    stars: [
      { x: 0.28, y: 0.42 }, // Regulus (α)
      { x: 0.31, y: 0.38 }, // η
      { x: 0.33, y: 0.36 }, // Algieba (γ)
      { x: 0.35, y: 0.35 }, // ζ
      { x: 0.36, y: 0.37 }, // μ
      { x: 0.34, y: 0.4 }, // Denebola (β)
      { x: 0.3, y: 0.4 }, // δ
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 0],
    ],
  },
  {
    name: "Lyra",
    stars: [
      { x: 0.54, y: 0.16 }, // Vega (α)
      { x: 0.55, y: 0.18 }, // ε1
      { x: 0.56, y: 0.18 }, // ε2
      { x: 0.55, y: 0.2 }, // ζ
      { x: 0.56, y: 0.2 }, // δ
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 4],
    ],
  },
  {
    name: "Gemini",
    stars: [
      { x: 0.34, y: 0.52 }, // Castor (α)
      { x: 0.35, y: 0.54 }, // Pollux (β)
      { x: 0.32, y: 0.56 }, // γ
      { x: 0.33, y: 0.58 }, // μ
      { x: 0.36, y: 0.58 }, // ε
      { x: 0.37, y: 0.56 }, // ξ
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 3],
      [1, 5],
      [5, 4],
    ],
  },
  {
    name: "Draco",
    stars: [
      { x: 0.16, y: 0.08 }, // Eltanin (γ)
      { x: 0.17, y: 0.1 }, // Rastaban (β)
      { x: 0.19, y: 0.09 }, // ξ
      { x: 0.2, y: 0.07 }, // δ
      { x: 0.19, y: 0.04 }, // ε
      { x: 0.17, y: 0.03 }, // τ
      { x: 0.15, y: 0.05 }, // χ
      { x: 0.14, y: 0.08 }, // η
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
  },
  {
    name: "Boötes",
    stars: [
      { x: 0.22, y: 0.22 }, // Arcturus (α)
      { x: 0.21, y: 0.18 }, // η
      { x: 0.2, y: 0.14 }, // γ
      { x: 0.23, y: 0.14 }, // δ
      { x: 0.24, y: 0.18 }, // β
      { x: 0.22, y: 0.26 }, // ε
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
      [0, 5],
    ],
  },
  {
    name: "Auriga",
    stars: [
      { x: 0.37, y: 0.46 }, // Capella (α)
      { x: 0.39, y: 0.44 }, // Menkalinan (β)
      { x: 0.4, y: 0.48 }, // θ
      { x: 0.38, y: 0.5 }, // ι
      { x: 0.36, y: 0.48 }, // ε
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
    ],
  },
  {
    name: "Perseus",
    stars: [
      { x: 0.32, y: 0.28 }, // Mirfak (α)
      { x: 0.3, y: 0.3 }, // Algol (β)
      { x: 0.31, y: 0.26 }, // γ
      { x: 0.33, y: 0.24 }, // δ
      { x: 0.34, y: 0.3 }, // ε
      { x: 0.29, y: 0.32 }, // ρ
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 3],
      [0, 4],
      [1, 5],
    ],
  },
  {
    name: "Andromeda",
    stars: [
      { x: 0.3, y: 0.16 }, // Alpheratz (α)
      { x: 0.28, y: 0.14 }, // Mirach (β)
      { x: 0.26, y: 0.12 }, // Almach (γ)
      { x: 0.29, y: 0.12 }, // δ
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
  },
  {
    name: "Aquila",
    stars: [
      { x: 0.62, y: 0.32 }, // Altair (α)
      { x: 0.61, y: 0.3 }, // Tarazed (γ)
      { x: 0.63, y: 0.3 }, // Alshain (β)
      { x: 0.6, y: 0.27 }, // δ
      { x: 0.64, y: 0.34 }, // θ
    ],
    edges: [
      [1, 0],
      [0, 2],
      [1, 3],
      [0, 4],
    ],
  },
  {
    name: "Corona Borealis",
    stars: [
      { x: 0.3, y: 0.2 }, // Alphecca (α)
      { x: 0.29, y: 0.21 }, // β
      { x: 0.28, y: 0.22 }, // γ
      { x: 0.29, y: 0.23 }, // δ
      { x: 0.31, y: 0.21 }, // θ
      { x: 0.32, y: 0.22 }, // ε
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 4],
      [4, 5],
    ],
  },
  {
    name: "Taurus",
    stars: [
      { x: 0.39, y: 0.58 }, // Aldebaran (α)
      { x: 0.38, y: 0.56 }, // Hyades cluster star
      { x: 0.37, y: 0.55 }, // γ
      { x: 0.4, y: 0.54 }, // ε — horn tip
      { x: 0.42, y: 0.54 }, // ζ — horn tip
      { x: 0.38, y: 0.57 }, // θ
    ],
    edges: [
      [0, 5],
      [5, 2],
      [2, 1],
      [1, 0],
      [0, 3],
      [0, 4],
    ],
  },
  {
    name: "Scorpius",
    stars: [
      { x: 0.72, y: 0.7 }, // Antares (α)
      { x: 0.71, y: 0.68 }, // σ
      { x: 0.7, y: 0.66 }, // δ
      { x: 0.73, y: 0.72 }, // τ
      { x: 0.74, y: 0.75 }, // ε
      { x: 0.76, y: 0.78 }, // ζ — tail
      { x: 0.78, y: 0.8 }, // η
      { x: 0.77, y: 0.82 }, // Shaula (λ) — stinger
    ],
    edges: [
      [0, 1],
      [1, 2],
      [0, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
  },
  {
    name: "Hercules",
    stars: [
      { x: 0.44, y: 0.18 }, // Ras Algethi (α)
      { x: 0.46, y: 0.16 }, // Kornephoros (β)
      { x: 0.48, y: 0.18 }, // γ
      { x: 0.46, y: 0.2 }, // ε — keystone
      { x: 0.44, y: 0.22 }, // ζ
      { x: 0.42, y: 0.2 }, // η
      { x: 0.48, y: 0.22 }, // θ
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 5],
      [5, 4],
      [2, 6],
    ],
  },
];

// -- Star generation --

function generateFieldStars(
  count: number,
  w: number,
  h: number,
  rng: SeededRng,
): FieldStar[] {
  const stars: FieldStar[] = [];
  const padX = w * 0.35;
  const padY = h * 0.35;
  const totalW = w + padX * 2;
  const totalH = h + padY * 2;

  // Milky Way band parameters — a diagonal band of higher density
  const bandAngle = -0.35; // radians (~-20°)
  const bandCenterY = 0.4; // normalized
  const bandWidth = 0.18; // normalized half-width
  const cosA = Math.cos(bandAngle);
  const sinA = Math.sin(bandAngle);

  for (let i = 0; i < count; i++) {
    const x = rng() * totalW - padX;
    let y = rng() * totalH - padY;

    // Density boosting in the Milky Way band
    const nx = x / w;
    const ny = y / h;
    const rotY = -nx * sinA + ny * cosA;
    const distFromBand = Math.abs(rotY - bandCenterY) / bandWidth;
    if (distFromBand < 1.0 && rng() < 0.4) {
      // Extra clumping toward the band center
      const jitter = (rng() - 0.5) * bandWidth * h * 0.6;
      y = (bandCenterY * cosA + nx * sinA) * h + jitter;
    }

    // Size distribution — mostly tiny, few medium
    const sizeRoll = rng();
    let radius;
    if (sizeRoll < 0.65)
      radius = rng() * 0.35 + 0.15; // 0.15–0.5px — dust
    else if (sizeRoll < 0.9)
      radius = rng() * 0.35 + 0.5; // 0.5–0.85px — faint
    else if (sizeRoll < 0.98)
      radius = rng() * 0.3 + 0.85; // 0.85–1.15px — medium
    else radius = rng() * 0.3 + 1.15; // 1.15–1.45px — bright

    const brightness = rng() * 0.35 + 0.25 + (radius > 0.85 ? 0.3 : 0);

    // Color temperature
    const temp = rng();
    let r, g, b;
    if (temp < 0.1) {
      r = 165 + rng() * 50;
      g = 185 + rng() * 40;
      b = 235 + rng() * 20;
    } else if (temp < 0.18) {
      r = 255;
      g = 230 + rng() * 25;
      b = 185 + rng() * 35;
    } else if (temp < 0.23) {
      r = 255;
      g = 155 + rng() * 50;
      b = 115 + rng() * 40;
    } else {
      r = 225 + rng() * 30;
      g = 225 + rng() * 30;
      b = 230 + rng() * 25;
    }

    const twinkleSpeed = rng() * 3.0 + 0.3;
    const twinklePhase = rng() * Math.PI * 2;
    const twinkleAmount =
      radius > 0.7 ? rng() * 0.45 + 0.1 : rng() * 0.2 + 0.05;

    stars.push({
      x,
      y,
      radius,
      brightness,
      r: r | 0,
      g: g | 0,
      b: b | 0,
      twinkleSpeed,
      twinklePhase,
      twinkleAmount,
    });
  }
  return stars;
}

// -- Nebula & galactic core pre-render --

function renderNebulaLayer(
  w: number,
  h: number,
  rng: SeededRng,
): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const context = offscreen.getContext("2d");
  if (!context) return offscreen;

  // Milky Way band parameters (must match field star generation)
  const bandAngle = -0.35;
  const bandCenterY = 0.4;
  const cosA = Math.cos(bandAngle);
  const sinA = Math.sin(bandAngle);

  // -- Galactic core glow --
  // A warm, very subtle elongated glow near the densest part of the band
  const coreX = w * 0.55;
  const coreY = (bandCenterY * cosA + 0.55 * sinA) * h;
  const coreRadius = Math.max(w, h) * 0.22;

  // Elongated ellipse via scale transform
  context.save();
  context.translate(coreX, coreY);
  context.rotate(bandAngle);
  context.scale(1.8, 1); // stretch along the band
  const coreGrad = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
  coreGrad.addColorStop(0, "rgba(180, 160, 120, 0.06)");
  coreGrad.addColorStop(0.3, "rgba(160, 140, 100, 0.035)");
  coreGrad.addColorStop(0.6, "rgba(140, 120, 90, 0.015)");
  coreGrad.addColorStop(1, "rgba(100, 90, 80, 0)");
  context.fillStyle = coreGrad;
  context.fillRect(
    -coreRadius * 2,
    -coreRadius,
    coreRadius * 4,
    coreRadius * 2,
  );
  context.restore();

  // -- Milky Way diffuse glow band --
  // Multiple overlapping soft patches along the band
  const bandPatches = 8;
  for (let i = 0; i < bandPatches; i++) {
    const nx = rng() * 1.2 - 0.1; // normalized x across canvas
    const patchX = nx * w;
    const patchY =
      (bandCenterY * cosA + nx * sinA) * h + (rng() - 0.5) * h * 0.12;
    const patchR = (rng() * 0.12 + 0.06) * Math.max(w, h);
    const alpha = rng() * 0.02 + 0.01; // 0.01–0.03 — barely visible

    context.save();
    context.translate(patchX, patchY);
    context.rotate(bandAngle + (rng() - 0.5) * 0.3);
    context.scale(1.5 + rng() * 0.8, 1);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, patchR);
    gradient.addColorStop(0, `rgba(200, 195, 180, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(180, 175, 165, ${alpha * 0.5})`);
    gradient.addColorStop(1, "rgba(150, 145, 140, 0)");
    context.fillStyle = gradient;
    context.fillRect(-patchR * 2, -patchR, patchR * 4, patchR * 2);
    context.restore();
  }

  // -- Nebula patches --
  // Scattered across the sky — emission (red/pink), reflection (blue),
  // and a couple of subtle purple/teal wisps
  const nebulae = [
    // Emission nebulae (reddish) — near Orion, Cygnus
    { x: 0.44, y: 0.67, r: 0.07, color: [180, 60, 70], a: 0.025 },
    { x: 0.6, y: 0.22, r: 0.055, color: [170, 55, 65], a: 0.02 },
    { x: 0.72, y: 0.72, r: 0.04, color: [185, 50, 60], a: 0.018 },

    // Reflection nebulae (blue) — scattered
    { x: 0.26, y: 0.12, r: 0.05, color: [80, 110, 180], a: 0.018 },
    { x: 0.52, y: 0.15, r: 0.04, color: [70, 100, 170], a: 0.015 },

    // Purple/teal wisps
    { x: 0.35, y: 0.35, r: 0.06, color: [120, 80, 160], a: 0.012 },
    { x: 0.68, y: 0.45, r: 0.05, color: [60, 130, 140], a: 0.012 },

    // Very faint large-scale patches
    { x: 0.15, y: 0.55, r: 0.09, color: [160, 70, 80], a: 0.008 },
    { x: 0.8, y: 0.3, r: 0.08, color: [90, 100, 160], a: 0.008 },
  ];

  for (const n of nebulae) {
    const nx = n.x * w;
    const ny = n.y * h;
    const nr = n.r * Math.max(w, h);
    const [cr, cg, callback] = n.color;

    context.save();
    context.translate(nx, ny);
    context.rotate((rng() - 0.5) * 1.2);
    context.scale(1 + rng() * 0.6, 1);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, nr);
    gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${callback}, ${n.a})`);
    gradient.addColorStop(0.4, `rgba(${cr}, ${cg}, ${callback}, ${n.a * 0.5})`);
    gradient.addColorStop(0.7, `rgba(${cr}, ${cg}, ${callback}, ${n.a * 0.2})`);
    gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${callback}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(-nr * 2, -nr, nr * 4, nr * 2);
    context.restore();
  }

  return offscreen;
}

// -- Component --

export default function StarfieldComponent({
  className,
  style,
  panX = 0,
  panY = 0,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<FieldStar[] | null>(null);
  const constellationStarsRef = useRef<ConstellationData[] | null>(null);
  const nebulaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const panRef = useRef({ x: panX, y: panY });

  useEffect(() => {
    panRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  const PARALLAX_FACTOR = 0.04;

  const ensureStars = useCallback((w: number, h: number) => {
    if (
      starsRef.current &&
      Math.abs(sizeRef.current.w - w) < 100 &&
      Math.abs(sizeRef.current.h - h) < 100
    ) {
      return;
    }
    sizeRef.current = { w, h };
    const area = w * h;
    // Dense deep-field: ~1.2 stars per 1000px²
    const density = 0.0012;
    const count = Math.max(800, Math.min(8000, Math.floor(area * density)));
    const rng = seededRandom(42);
    starsRef.current = generateFieldStars(count, w, h, rng);

    // Pre-render nebula layer (static — painted once)
    const nebulaRng = seededRandom(1337);
    nebulaCanvasRef.current = renderNebulaLayer(w, h, nebulaRng);

    // Map constellation data to pixel coordinates
    constellationStarsRef.current = CONSTELLATIONS.map((c) => ({
      name: c.name,
      stars: c.stars.map((s) => ({
        x: s.x * w,
        y: s.y * h,
        radius: 0.55 + Math.random() * 0.3, // slightly brighter than dust, but still sharp
        brightness: 0.8 + Math.random() * 0.2,
        r: (220 + Math.random() * 35) | 0,
        g: (225 + Math.random() * 30) | 0,
        b: (235 + Math.random() * 20) | 0,
        twinkleSpeed: 1.0 + Math.random() * 2.0,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleAmount: 0.2 + Math.random() * 0.25,
      })),
      edges: c.edges,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const canvasWidth = rect.width;
      const canvasHeight = rect.height;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      ensureStars(canvasWidth, canvasHeight);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (time: number) => {
      const elapsedSeconds = time / 1000;
      const scaledWidth = sizeRef.current.w;
      const scaledHeight = sizeRef.current.h;
      const fieldStars = starsRef.current;
      const constellations = constellationStarsRef.current;
      if (!fieldStars) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const px = panRef.current.x * PARALLAX_FACTOR;
      const py = panRef.current.y * PARALLAX_FACTOR;

      context.clearRect(0, 0, scaledWidth, scaledHeight);
      context.save();
      context.translate(px, py);

      // -- Draw nebula / galactic core layer (pre-rendered) --
      if (nebulaCanvasRef.current) {
        context.drawImage(
          nebulaCanvasRef.current,
          0,
          0,
          scaledWidth,
          scaledHeight,
        );
      }

      // -- Draw field stars with atmospheric scintillation --
      for (const star of fieldStars) {
        // Slow twinkle (intrinsic)
        const twinkle =
          1 -
          star.twinkleAmount +
          star.twinkleAmount *
            (0.5 +
              0.5 *
                Math.sin(
                  elapsedSeconds * star.twinkleSpeed + star.twinklePhase,
                ));
        // Fast atmospheric scintillation — rapid micro-flicker
        // Brighter/larger stars scintillate more (realistic)
        const scintAmount = star.radius > 0.6 ? 0.12 : 0.05;
        const scintillation =
          1 -
          scintAmount +
          scintAmount *
            (0.5 +
              0.5 *
                Math.sin(elapsedSeconds * 11.3 + star.x * 0.7 + star.y * 1.3)) *
            (0.5 +
              0.5 *
                Math.cos(elapsedSeconds * 7.7 + star.y * 0.9 + star.x * 0.4));
        const alpha = star.brightness * twinkle * scintillation;

        context.globalAlpha = alpha;
        context.fillStyle = `rgb(${star.r},${star.g},${star.b})`;

        if (star.radius <= 0.5) {
          // Sub-pixel dust — single pixel
          context.fillRect(star.x, star.y, 1, 1);
        } else if (star.radius <= 0.8) {
          // Small point
          context.fillRect(star.x - 0.5, star.y - 0.5, 1, 1);
        } else {
          // Slightly larger star — tiny arc
          context.beginPath();
          context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      // -- Draw constellation lines --
      if (constellations) {
        for (const c of constellations) {
          const pulse =
            0.05 + 0.025 * Math.sin(elapsedSeconds * 0.6 + c.stars[0].x * 0.01);
          context.globalAlpha = 1;
          context.strokeStyle = `rgba(140, 165, 220, ${pulse})`;
          context.lineWidth = 0.4;

          for (const [a, b] of c.edges) {
            if (!c.stars[a] || !c.stars[b]) continue;
            context.beginPath();
            context.moveTo(c.stars[a].x, c.stars[a].y);
            context.lineTo(c.stars[b].x, c.stars[b].y);
            context.stroke();
          }

          // Draw constellation anchor stars (brighter than field stars)
          for (const star of c.stars) {
            const twinkle =
              1 -
              star.twinkleAmount +
              star.twinkleAmount *
                (0.5 +
                  0.5 *
                    Math.sin(
                      elapsedSeconds * star.twinkleSpeed + star.twinklePhase,
                    ));
            // Atmospheric scintillation for constellation stars too
            const scint = 0.1;
            const scintillation =
              1 -
              scint +
              scint *
                (0.5 +
                  0.5 *
                    Math.sin(
                      elapsedSeconds * 9.1 + star.x * 0.5 + star.y * 1.1,
                    )) *
                (0.5 +
                  0.5 *
                    Math.cos(
                      elapsedSeconds * 6.3 + star.y * 0.7 + star.x * 0.3,
                    ));
            const alpha = star.brightness * twinkle * scintillation;

            context.globalAlpha = alpha;
            context.fillStyle = `rgb(${star.r},${star.g},${star.b})`;
            context.beginPath();
            context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      context.globalAlpha = 1;
      context.restore();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ensureStars]);

  return (
    <canvas
      ref={canvasRef}
      className={`starfield-component ${className || ""}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        willChange: "transform",
        ...style,
      }}
    />
  );
}
