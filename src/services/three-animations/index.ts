/**
 * three-animations — registry of reusable Three.js animation presets.
 *
 * To add a new animation to prism-client:
 *   1. Write a preset factory in this directory (see CoinAnimation.ts).
 *   2. Register it here.
 *   3. Render it anywhere with:
 *        <ThreeAnimationComponent animation={createMyAnimation} options={...} />
 */

export type {
  ThreeAnimationContext,
  ThreeAnimationHandle,
  ThreeAnimationFactory,
} from "./ThreeAnimationTypes";
export {
  extractRenderableFromContainer,
  renderCoinFace,
  renderCoinRimStrip,
  type FaceSource,
  type FaceSourceMode,
} from "./TextureUtilities";
export { createCoinAnimation, type CoinAnimationOptions } from "./CoinAnimation";
export {
  createCloudsAnimation,
  type CloudsAnimationOptions,
  type CloudsPalette,
} from "./CloudsAnimation";

import { createCoinAnimation } from "./CoinAnimation";
import { createCloudsAnimation } from "./CloudsAnimation";

/** Name → factory registry for discoverability. */
export const THREE_ANIMATION_PRESETS = {
  coin: createCoinAnimation,
  clouds: createCloudsAnimation,
} as const;

export type ThreeAnimationPresetName = keyof typeof THREE_ANIMATION_PRESETS;
