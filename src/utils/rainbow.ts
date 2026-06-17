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
