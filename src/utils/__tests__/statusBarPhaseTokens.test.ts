/** The live phase's colours on :root, for the sidebar dot and the history bars. */
import { describe, it, expect, beforeEach } from "vitest";
import { PHASE_TOKENS, applyPhaseTokensToRoot } from "../statusBarPhaseTokens";

describe("applyPhaseTokensToRoot", () => {
  let style: CSSStyleDeclaration;
  beforeEach(() => {
    style = document.createElement("div").style;
  });

  it("sets the phase's pulse colour and its seven gradient stops", () => {
    applyPhaseTokensToRoot("generating", style);
    expect(style.getPropertyValue("--generating-dot-phase-color")).toBe(PHASE_TOKENS.generating.overlay.pulse);
    for (let stop = 0; stop < 7; stop++) {
      expect(style.getPropertyValue(`--live-phase-gradient-stop-${stop + 1}`)).toBe(
        PHASE_TOKENS.generating.gradientStops[stop],
      );
    }
  });

  it("removes them for no phase, or one without tokens", () => {
    for (const phase of [null, "not-a-phase"]) {
      applyPhaseTokensToRoot("thinking", style);
      applyPhaseTokensToRoot(phase, style);
      expect(style.getPropertyValue("--generating-dot-phase-color")).toBe("");
      expect(style.getPropertyValue("--live-phase-gradient-stop-7")).toBe("");
    }
  });
});
