// -------------------------------------------------------------
// Rainbow — Shared pixel-level color interpolation for the
// 8-bit dithered rainbow effect used in AnimatedFaviconComponent
// and RainbowCanvasComponent.
// -------------------------------------------------------------

import {
  lerpRgb,
  paletteAt,
  type RgbTriplet,
} from "@rodrigo-barraza/utilities-library";

export type { RgbTriplet };
export { lerpRgb, paletteAt };

export const RAINBOW: RgbTriplet[] = [
  [255, 0, 0],
  [255, 127, 0],
  [255, 255, 0],
  [0, 200, 80],
  [0, 120, 255],
  [100, 0, 255],
  [255, 0, 150],
];

// -------------------------------------------------------------
// Aurora — tonal palette derived from the active theme's accent
// colors, used by the sidebar banner instead of the full rainbow.
// -------------------------------------------------------------

const AURORA_DEEP: RgbTriplet = [10, 12, 24];
const AURORA_LIGHT: RgbTriplet = [255, 255, 255];

// Fallbacks matching the default indigo theme's accent trio
// (--accent-primary / secondary / tertiary in globals.css).
export const DEFAULT_AURORA_ACCENTS: RgbTriplet[] = [
  [99, 102, 241],
  [167, 139, 250],
  [56, 189, 248],
];

let colorProbeContext: CanvasRenderingContext2D | null = null;

/** Normalize any CSS color (hex, rgb, oklch, …) to an RGB triplet via canvas. */
export function resolveCssColorToRgb(cssColor: string): RgbTriplet | null {
  if (typeof document === "undefined") return null;
  const value = cssColor.trim();
  if (!value) return null;
  if (!colorProbeContext) {
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    colorProbeContext = probeCanvas.getContext("2d", {
      willReadFrequently: true,
    });
  }
  const context = colorProbeContext;
  if (!context) return null;
  context.fillStyle = "#000";
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/**
 * Build a looping tonal palette from accent colors: each accent
 * contributes a deep, base, and lifted stop, so the drift reads as
 * slow waves of the theme's own colors rather than a hue sweep.
 */
export function buildAuroraPalette(accents: RgbTriplet[]): RgbTriplet[] {
  const stops: RgbTriplet[] = [];
  for (const accent of accents) {
    stops.push(
      lerpRgb(accent, AURORA_DEEP, 0.55),
      accent,
      lerpRgb(accent, AURORA_LIGHT, 0.3),
    );
  }
  return stops;
}

/** Aurora palette for the currently applied theme's accent variables. */
export function getThemeAuroraPalette(): RgbTriplet[] {
  if (typeof window === "undefined") {
    return buildAuroraPalette(DEFAULT_AURORA_ACCENTS);
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const accents = [
    "--accent-primary",
    "--accent-secondary",
    "--accent-tertiary",
  ].map(
    (variableName, index) =>
      resolveCssColorToRgb(rootStyle.getPropertyValue(variableName)) ||
      DEFAULT_AURORA_ACCENTS[index],
  );
  return buildAuroraPalette(accents);
}
