/**
 * Whether the UI offers "No Thinking" is decided here. The old inline rule —
 * "the model declares a minimal rung" — is wrong in both directions on the
 * current Gemini line, which is why the server now states it outright.
 */
import { describe, it, expect } from "vitest";

import {
  canDisableThinking,
  isThinkingAlwaysOn,
  resolveThinkingLevel,
} from "@/utils/modelCapabilities";

describe("canDisableThinking", () => {
  it("obeys the server when it states the answer", () => {
    // 3.7 Flash — the default — has no "minimal" rung but turns thinking off
    // with thinkingBudget: 0. The heuristic alone would hide the option.
    expect(
      canDisableThinking({
        thinkingLevels: ["low", "medium", "high"],
        canDisableThinking: true,
      }),
    ).toBe(true);

    // 3.1 Pro cannot turn thinking off by any mechanism.
    expect(
      canDisableThinking({
        thinkingLevels: ["low", "medium", "high"],
        canDisableThinking: false,
      }),
    ).toBe(false);
  });

  it("falls back to the minimal heuristic when the server says nothing", () => {
    expect(
      canDisableThinking({ thinkingLevels: ["minimal", "low", "high"] }),
    ).toBe(true);
    // Anthropic's adaptive models list low..max and genuinely always think —
    // the fallback must keep treating them as always-on.
    expect(
      canDisableThinking({ thinkingLevels: ["low", "high", "max"] }),
    ).toBe(false);
  });

  it("treats a model with no levels at all as toggleable", () => {
    expect(canDisableThinking({})).toBe(true);
    expect(canDisableThinking(null)).toBe(true);
    expect(canDisableThinking(undefined)).toBe(true);
  });
});

describe("isThinkingAlwaysOn", () => {
  it("is true only for a leveled model that cannot disable", () => {
    expect(
      isThinkingAlwaysOn({ thinkingLevels: ["low"], canDisableThinking: false }),
    ).toBe(true);
    expect(
      isThinkingAlwaysOn({ thinkingLevels: ["low"], canDisableThinking: true }),
    ).toBe(false);
    // No declared levels → not a leveled thinking model, so never "always on".
    expect(isThinkingAlwaysOn({})).toBe(false);
  });
});

describe("resolveThinkingLevel", () => {
  it("keeps a saved level the model offers", () => {
    expect(
      resolveThinkingLevel({ thinkingLevels: ["low", "medium", "high"] }, "medium"),
    ).toBe("medium");
  });

  it("replaces a saved level the model does not offer", () => {
    // A user carrying "minimal" onto 3.7 Flash would otherwise see a value
    // that is not among the dropdown's options.
    expect(
      resolveThinkingLevel({ thinkingLevels: ["low", "medium", "high"] }, "minimal"),
    ).toBe("high");
  });

  it("falls back to the top rung when high is not offered", () => {
    // Nano Banana 2 image models offer only minimal and high... and when a
    // list has no "high" at all, the last rung is the closest thing to it.
    expect(resolveThinkingLevel({ thinkingLevels: ["minimal", "low"] }, "xhigh")).toBe(
      "low",
    );
  });

  it("leaves models without levels to the caller's default", () => {
    expect(resolveThinkingLevel({}, "medium")).toBe("medium");
    expect(resolveThinkingLevel({}, undefined)).toBe("high");
  });
});
