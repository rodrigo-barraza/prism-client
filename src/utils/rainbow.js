// ─────────────────────────────────────────────────────────────
// Rainbow — Shared pixel-level color interpolation for the
// 8-bit dithered rainbow effect used in AnimatedFaviconComponent
// and RainbowCanvasComponent.
//
// NOTE: This uses raw [R,G,B] arrays for canvas pixel operations,
// which is different from the hex-based lerpColor in
// @rodrigo-barraza/utilities-library/color.
// ─────────────────────────────────────────────────────────────

export const RAINBOW = [
  [255, 0, 0],
  [255, 127, 0],
  [255, 255, 0],
  [0, 200, 80],
  [0, 120, 255],
  [100, 0, 255],
  [255, 0, 150],
];

/**
 * Linearly interpolate between two RGB triplets.
 * @param {number[]} a - Start color [r, g, b]
 * @param {number[]} b - End color [r, g, b]
 * @param {number} t - Interpolation factor (0–1)
 * @returns {number[]} Interpolated [r, g, b]
 */
export function lerpRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Sample the rainbow palette at a normalized position.
 * @param {number[]} colors - Array of [r,g,b] triplets
 * @param {number} t - Position (0–1, wraps)
 * @returns {number[]} Interpolated [r, g, b]
 */
export function paletteAt(colors, t) {
  const scaled = (((t % 1) + 1) % 1) * colors.length;
  const i = Math.floor(scaled);
  const f = scaled - i;
  return lerpRgb(
    colors[i % colors.length],
    colors[(i + 1) % colors.length],
    f,
  );
}
