"use client";

import ThreeBackgroundComponent from "./ThreeBackgroundComponent";
import {
  createCloudsAnimation,
  type CloudsAnimationOptions,
  type ThreeAnimationFactory,
} from "../services/three-animations";
import type { ChatBackgroundName } from "../hooks/useChatBackgroundSetting";
import styles from "./ChatBackgroundComponent.module.css";

interface ChatBackgroundScene {
  // Registry holds heterogeneous option shapes — erased to `any` on purpose
  animation: ThreeAnimationFactory<any>;
  options: unknown;
  /** CSS-gradient stand-in shown under the canvas (and without WebGL2). */
  fallbackClassName: string;
  maxPixelRatio: number;
  maxFps: number;
}

/**
 * Scene registry for ambient chat backdrops. Adding a scene:
 *   1. Write a preset in src/services/three-animations.
 *   2. Add its name to CHAT_BACKGROUND_NAMES (useChatBackgroundSetting).
 *   3. Register it here with a CSS fallback gradient.
 */
const CHAT_BACKGROUND_SCENES: Partial<
  Record<ChatBackgroundName, ChatBackgroundScene>
> = {
  clouds: {
    animation: createCloudsAnimation,
    options: {} satisfies CloudsAnimationOptions,
    fallbackClassName: styles["fallback-clouds"],
    // Full-screen raymarch: render at most at 1:1 CSS pixels, 30 fps
    maxPixelRatio: 1,
    maxFps: 30,
  },
};

export interface ChatBackgroundComponentProps {
  background: ChatBackgroundName;
}

/**
 * ChatBackgroundComponent — ambient 3D backdrop for the empty chat state.
 *
 * Fills the messages list behind the empty-state content. Renders nothing
 * for "none" or unknown scenes. Mount only while the conversation is empty —
 * unmounting is what frees the GPU when messages arrive.
 */
export default function ChatBackgroundComponent({
  background,
}: ChatBackgroundComponentProps) {
  const scene = CHAT_BACKGROUND_SCENES[background];
  if (!scene) return null;

  return (
    <div className={styles["chat-background"]} aria-hidden>
      <div className={`${styles["fallback"]} ${scene.fallbackClassName}`} />
      <ThreeBackgroundComponent
        animation={scene.animation}
        options={scene.options}
        maxPixelRatio={scene.maxPixelRatio}
        maxFps={scene.maxFps}
      />
    </div>
  );
}
