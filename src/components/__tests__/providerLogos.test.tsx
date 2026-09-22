import { afterEach, describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProviderLogo, {
  resolveProviderLabel,
  resolveProviderLogoKey,
  setLocalProviderMeta,
} from "../ProviderLogosComponent";

afterEach(() => {
  setLocalProviderMeta([]);
});

describe("ProviderLogosComponent — SGLang", () => {
  it("draws the SGLang logo for the first and the numbered instances", () => {
    expect(resolveProviderLogoKey("sglang")).toBe("sglang");
    expect(resolveProviderLogoKey("sglang-2")).toBe("sglang");
    const { container } = render(<ProviderLogo provider="sglang-2" />);
    expect(container.querySelector("svg")?.textContent).toBe("SG");
  });

  it("labels instances by nickname, then by number", () => {
    expect(resolveProviderLabel("sglang")).toBe("SGLang");
    setLocalProviderMeta([
      { id: "sglang", nickname: "Desktop", instanceNumber: 1 },
      { id: "sglang-2", instanceNumber: 2 },
    ]);
    expect(resolveProviderLabel("sglang")).toBe("SGLang (Desktop)");
    expect(resolveProviderLabel("sglang-2")).toBe("SGLang #2");
  });
});
