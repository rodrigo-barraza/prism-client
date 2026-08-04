"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ThreeBackgroundComponent from "./ThreeBackgroundComponent";
import type {
  CloudsAnimationOptions,
  ThreeAnimationFactory,
  ThreeAnimationHandle,
} from "../services/three-animations";
import type { ThreeBackendName } from "../services/ThreeService";
import type { ChatBackgroundName } from "../hooks/useChatBackgroundSetting";
import { EVENT_NAME_USER_TYPING } from "../constants";
import styles from "./ChatBackgroundComponent.module.css";

// Each keystroke kicks the forward fly-through speed by this much (the preset
// accumulates it toward its cap and decays back), mirroring the coin's spin.
// Large so even a few keystrokes launch a fast fly-through through the clouds.
const TYPE_IMPULSE_PER_KEYSTROKE = 26;

interface ChatBackgroundScene {
  /**
   * Lazy module loader for the preset factory. Scenes load on demand
   * because the clouds module statically imports `three/webgpu` (the
   * node/WGSL system) — as a dynamic import it stays a separate chunk
   * that only pages actually showing the backdrop ever fetch.
   */
  // Registry holds heterogeneous option shapes — erased to `any` on purpose
  load: () => Promise<ThreeAnimationFactory<any>>;
  /** GPU backend the scene's materials require (clouds carry raw WGSL). */
  backend: ThreeBackendName;
  options: unknown;
  /** CSS-gradient stand-in shown under the canvas (and without a GPU). */
  fallbackClassName: string;
  maxPixelRatio: number;
  maxFps: number;
}

/**
 * Scene registry for ambient chat backdrops. Adding a scene:
 *   1. Write a preset in src/services/three-animations.
 *   2. Add its name to CHAT_BACKGROUND_NAMES (useChatBackgroundSetting).
 *   3. Register it here with a lazy loader + a CSS fallback gradient.
 */
const CHAT_BACKGROUND_SCENES: Partial<
  Record<ChatBackgroundName, ChatBackgroundScene>
> = {
  clouds: {
    load: () =>
      import("../services/three-animations/CloudsAnimation").then(
        (module) => module.createCloudsAnimation,
      ),
    // Raw-WGSL shader — needs WebGPU; without it the gradient stays.
    backend: "webgpu",
    options: {} satisfies CloudsAnimationOptions,
    fallbackClassName: styles["fallback-clouds"],
    // Full-screen raymarch: render at most at 1:1 CSS pixels, 30 fps
    maxPixelRatio: 1,
    maxFps: 30,
  },
};

/**
 * QA affordances: set localStorage["prism:sky-hour"] to a number (0..24) to
 * pin the clouds scene to that canonical solar hour (6 = sunrise, 12 = noon,
 * 18 = sunset, regardless of the real sun times), and/or
 * localStorage["prism:moon-phase"] to a number (0 new … 0.5 full) to pin the
 * lunar phase for screenshots. Unset/invalid follows the real clock/calendar.
 */
const DEBUG_SKY_HOUR_KEY = "prism:sky-hour";
const DEBUG_MOON_PHASE_KEY = "prism:moon-phase";

function readDebugNumber(key: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
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
 * unmounting is what frees the GPU when messages arrive. The CSS fallback
 * gradient paints immediately; the canvas fades in over it once the scene
 * module loads and its first frame renders.
 */
export default function ChatBackgroundComponent({
  background,
}: ChatBackgroundComponentProps) {
  const scene = CHAT_BACKGROUND_SCENES[background];
  const handleRef = useRef<ThreeAnimationHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [animation, setAnimation] =
    useState<ThreeAnimationFactory<any> | null>(null);

  // Load the scene's preset module (a separate chunk — see the registry).
  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    scene
      .load()
      .then((factory) => {
        if (!cancelled) setAnimation(() => factory);
      })
      .catch((error) => {
        console.warn("[ChatBackground] scene module failed to load:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Pin the backdrop to the scrollport: it is absolutely positioned inside
  // the scrollable messages list, so without this it would scroll away with
  // the content (visible with a long raw system prompt). Counter-translate
  // by the list's scroll offset; scroll events fire before paint, so the
  // canvas tracks without visible lag.
  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.parentElement;
    if (!root || !scroller) return;
    const syncToScroll = () => {
      root.style.transform = `translate3d(0, ${scroller.scrollTop}px, 0)`;
    };
    syncToScroll();
    scroller.addEventListener("scroll", syncToScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", syncToScroll);
  }, [background]);

  // Typing → forward fly-through impulse (decay lives inside the preset).
  // Harmless for scenes that ignore "typeImpulse".
  useEffect(() => {
    const handleTyping = () => {
      handleRef.current?.setParameter?.(
        "typeImpulse",
        TYPE_IMPULSE_PER_KEYSTROKE,
      );
    };
    window.addEventListener(EVENT_NAME_USER_TYPING, handleTyping);
    return () =>
      window.removeEventListener(EVENT_NAME_USER_TYPING, handleTyping);
  }, []);

  // Options are captured once at mount by the bridge, so compute here.
  const options = useMemo(() => {
    if (!scene) return undefined;
    if (background === "clouds") {
      const debugHour = readDebugNumber(DEBUG_SKY_HOUR_KEY);
      const debugMoonPhase = readDebugNumber(DEBUG_MOON_PHASE_KEY);
      const cloudsOptions = scene.options as CloudsAnimationOptions;
      if (debugHour === undefined && debugMoonPhase === undefined) {
        return cloudsOptions;
      }
      return {
        ...cloudsOptions,
        ...(debugHour !== undefined ? { debugHour } : {}),
        ...(debugMoonPhase !== undefined ? { debugMoonPhase } : {}),
      };
    }
    return scene.options;
  }, [scene, background]);

  if (!scene) return null;

  return (
    <div ref={rootRef} className={styles["chat-background"]} aria-hidden>
      <div className={`${styles["fallback"]} ${scene.fallbackClassName}`} />
      {animation && (
        <ThreeBackgroundComponent
          animation={animation}
          options={options}
          backend={scene.backend}
          maxPixelRatio={scene.maxPixelRatio}
          maxFps={scene.maxFps}
          handleRef={handleRef}
        />
      )}
    </div>
  );
}
