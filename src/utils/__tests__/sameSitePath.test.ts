import { describe, it, expect } from "vitest";
import { DEFAULT_SIGNED_IN_PATH, sameSitePath } from "../sameSitePath";

const ORIGIN = "https://prism.rod.dev";

describe("sameSitePath — where /login sends a user who signed in", () => {
  it("follows a path, or an address, on this site", () => {
    expect(sameSitePath("/chat?conversation=c-1", ORIGIN)).toBe("/chat?conversation=c-1");
    expect(sameSitePath("/admin/traces#latest", ORIGIN)).toBe("/admin/traces#latest");
    expect(sameSitePath("https://prism.rod.dev/settings?tab=hooks", ORIGIN)).toBe("/settings?tab=hooks");
  });

  it("never leaves the site", () => {
    for (const candidate of [
      "https://evil.example/phish",
      "//evil.example/phish",
      "/\\evil.example/phish",
      "javascript:alert(1)",
      "http://prism.rod.dev/chat",
    ]) {
      expect(sameSitePath(candidate, ORIGIN)).toBe(DEFAULT_SIGNED_IN_PATH);
    }
  });

  it("goes to the chat when there is nowhere to go back to", () => {
    expect(sameSitePath(null, ORIGIN)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(sameSitePath("", ORIGIN)).toBe("/chat");
  });
});
