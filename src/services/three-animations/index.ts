/**
 * three-animations — registry of reusable Three.js animation presets.
 *
 * To add a new animation to prism-client:
 *   1. Write a preset factory in this directory (see CoinAnimation.ts).
 *   2. Register it here.
 *   3. Render it anywhere with:
 *        <ThreeAnimationComponent animation={createMyAnimation} options={...} />
 *
 * The clouds preset is the exception: it is NOT re-exported or registered
 * here at runtime, because its module statically imports `three/webgpu`
 * (the node/WGSL system — a heavy chunk). Anything that imported this
 * index would drag that into its bundle, and the coin badge imports this
 * index everywhere. ChatBackgroundComponent lazy-imports
 * `./CloudsAnimation` directly instead; only its types re-export from
 * here (types are erased and cost nothing).
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
export type {
  CloudsAnimationOptions,
  CloudsPalette,
} from "./CloudsAnimation";

import { createCoinAnimation } from "./CoinAnimation";

/** Name → factory registry for discoverability (WebGL-backend presets
 *  only — see the header note about the clouds). */
export const THREE_ANIMATION_PRESETS = {
  coin: createCoinAnimation,
} as const;

export type ThreeAnimationPresetName = keyof typeof THREE_ANIMATION_PRESETS;
