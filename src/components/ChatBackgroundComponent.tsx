"use client";

import { useMemo } from "react";
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

/**
 * QA affordance: set localStorage["prism:sky-hour"] to a number (0..24) to
 * pin the clouds scene to that local hour for screenshots. Unset/invalid
 * follows the real client clock.
 */
const DEBUG_SKY_HOUR_KEY = "prism:sky-hour";

function readDebugSkyHour(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(DEBUG_SKY_HOUR_KEY);
    if (raw === null || raw.trim() === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

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

  // Options are captured once at mount by the bridge, so compute here.
  const options = useMemo(() => {
    if (!scene) return undefined;
    if (background === "clouds") {
      const debugHour = readDebugSkyHour();
      const cloudsOptions = scene.options as CloudsAnimationOptions;
      return debugHour !== undefined
        ? { ...cloudsOptions, debugHour }
        : cloudsOptions;
    }
    return scene.options;
  }, [scene, background]);

  if (!scene) return null;

  return (
    <div className={styles["chat-background"]} aria-hidden>
      <div className={`${styles["fallback"]} ${scene.fallbackClassName}`} />
      <ThreeBackgroundComponent
        animation={scene.animation}
        options={options}
        maxPixelRatio={scene.maxPixelRatio}
        maxFps={scene.maxFps}
      />
    </div>
  );
}
