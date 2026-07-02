/**
 * Single source of truth for all StatusBar phase visual tokens.
 *
 * Consumed by:
 *   - StatusBarComponent.tsx        (gradient stops, labels, icons, phase CSS custom props)
 *   - agentConversationStates.ts    (pulse colors for sidebar dot and table column dot)
 *
 * The two color sub-systems here are intentionally distinct:
 *   gradientStops — the 7-stop animated bar fill (dramatic, motion-oriented)
 *   overlay       — background tint + text + pulse glow (ambient phase identity)
 *
 * Both are needed because the bar fill and the ambient glow serve different
 * perceptual roles. The overlay.pulse color is the "signature" hue of a phase.
 */

export type StatusBarPhase =
  | "starting"
  | "loading"
  | "prefilling"
  | "generating"
  | "thinking"
  | "executing"
  | "synthesizing"
  | "delegating"
  | "awaiting";

export interface PhaseOverlayTokens {
  /** Low-alpha background tint applied to the overlay element */
  background: string;
  /** CSS custom property --phase-text: label and chip text color */
  text: string;
  /** CSS custom property --phase-pulse: glow dot and box-shadow hue */
  pulse: string;
}

export interface PhaseTokens {
  /** Short human-readable label (e.g. "Generating...") */
  label: string;
  /** Emoji icon displayed in the overlay */
  icon: string;
  /** 7 oklch stops for the animated bar fill gradient */
  gradientStops: readonly [string, string, string, string, string, string, string];
  /** Overlay color tokens (background tint, text, pulse glow) */
  overlay: PhaseOverlayTokens;
}

export const PHASE_TOKENS: Readonly<Record<StatusBarPhase, PhaseTokens>> = {
  starting: {
    label: "Starting...",
    icon: "⚡",
    gradientStops: [
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
      "oklch(0.588 0.158 262)",
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
    ],
    overlay: {
      background: "oklch(55.4% 0.0408 257.4 / 0.2)",
      text:       "oklch(0.868 0.0216 265)",
      pulse:      "oklch(0.709 0.0389 269.2)",
    },
  },

  loading: {
    label: "Loading...",
    icon: "📦",
    gradientStops: [
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
      "oklch(0.588 0.158 262)",
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
    ],
    overlay: {
      background: "oklch(62.3% 0.1881 259.8 / 0.25)",
      text:       "oklch(0.879 0.0625 266.8)",
      pulse:      "oklch(0.704 0.158 269.1)",
    },
  },

  prefilling: {
    label: "Prefilling...",
    icon: "📥",
    gradientStops: [
      "oklch(0.795 0.164 90)",
      "oklch(0.852 0.176 95)",
      "oklch(0.783 0.178 71)",
      "oklch(0.852 0.176 95)",
      "oklch(0.795 0.164 90)",
      "oklch(0.852 0.176 95)",
      "oklch(0.783 0.178 71)",
    ],
    overlay: {
      background: "oklch(76.9% 0.1646 70.1 / 0.2)",
      text:       "oklch(0.93 0.1376 105)",
      pulse:      "oklch(0.843 0.1896 94.3)",
    },
  },

  generating: {
    label: "Generating...",
    icon: "✨",
    gradientStops: [
      "oklch(0.588 0.158 262)",
      "oklch(0.546 0.198 275)",
      "oklch(0.541 0.214 292)",
      "oklch(0.553 0.223 303)",
      "oklch(0.714 0.168 300)",
      "oklch(0.541 0.214 292)",
      "oklch(0.546 0.198 275)",
    ],
    overlay: {
      background: "oklch(72.3% 0.192 149.6 / 0.2)",
      text:       "oklch(0.928 0.0952 154.4)",
      pulse:      "oklch(0.807 0.2181 150.3)",
    },
  },

  thinking: {
    label: "Thinking...",
    icon: "🧠",
    gradientStops: [
      "oklch(0.723 0.191 145)",
      "oklch(0.793 0.172 153)",
      "oklch(0.841 0.202 117)",
      "oklch(0.852 0.176 95)",
      "oklch(0.795 0.164 90)",
      "oklch(0.841 0.202 117)",
      "oklch(0.793 0.172 153)",
    ],
    overlay: {
      background: "oklch(62.7% 0.2326 303.9 / 0.2)",
      text:       "oklch(0.82 0.1366 311.3)",
      pulse:      "oklch(0.709 0.2255 311.3)",
    },
  },

  executing: {
    label: "Executing...",
    icon: "🔧",
    gradientStops: [
      "oklch(0.705 0.191 41)",
      "oklch(0.783 0.178 71)",
      "oklch(0.646 0.222 22)",
      "oklch(0.783 0.178 71)",
      "oklch(0.705 0.191 41)",
      "oklch(0.783 0.178 71)",
      "oklch(0.646 0.222 22)",
    ],
    overlay: {
      background: "oklch(70.5% 0.191 41 / 0.2)",
      text:       "oklch(0.93 0.15 60)",
      pulse:      "oklch(0.783 0.178 41)",
    },
  },

  synthesizing: {
    label: "Synthesizing...",
    icon: "🧬",
    gradientStops: [
      "oklch(0.795 0.164 90)",
      "oklch(0.723 0.191 145)",
      "oklch(0.588 0.158 262)",
      "oklch(0.546 0.198 275)",
      "oklch(0.723 0.191 145)",
      "oklch(0.588 0.158 262)",
      "oklch(0.795 0.164 90)",
    ],
    overlay: {
      background: "oklch(72.3% 0.192 149.6 / 0.15)",
      text:       "oklch(0.916 0.0753 207.4)",
      pulse:      "oklch(0.723 0.191 145)",
    },
  },

  delegating: {
    label: "Awaiting Sub-Agents...",
    icon: "👥",
    gradientStops: [
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
      "oklch(0.790 0.090 252)",
      "oklch(0.852 0.176 95)",
      "oklch(0.795 0.164 90)",
      "oklch(0.790 0.090 252)",
      "oklch(0.681 0.126 254)",
    ],
    overlay: {
      background: "oklch(71.5% 0.1258 215.2 / 0.2)",
      text:       "oklch(0.916 0.0753 207.4)",
      pulse:      "oklch(0.794 0.1289 216.3)",
    },
  },

  awaiting: {
    label: "Awaiting For User Input...",
    icon: "⏸️",
    gradientStops: [
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
      "oklch(0.588 0.158 262)",
      "oklch(0.546 0.198 275)",
      "oklch(0.588 0.158 262)",
      "oklch(0.681 0.126 254)",
    ],
    overlay: {
      background: "oklch(55.4% 0.0408 257.4 / 0.15)",
      text:       "oklch(0.868 0.0216 265)",
      pulse:      "oklch(0.709 0.0389 269.2)",
    },
  },
} as const;
