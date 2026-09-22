import { afterEach, describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import useModelMemory from "../useModelMemory";
import StorageService from "../../services/StorageService";

const KEY = "test-model-memory";

afterEach(() => {
  localStorage.clear();
});

function rememberedAfterSaving(provider: string, model: string) {
  const { result } = renderHook(() => useModelMemory(KEY));
  result.current.saveModel(provider, model);
  return StorageService.get<{ provider: string; model: string; isLocal: boolean }>(KEY);
}

describe("useModelMemory — local classification", () => {
  it("remembers a numbered self-hosted instance as local", () => {
    expect(rememberedAfterSaving("sglang-2", "Qwen/Qwen3.6-27B")).toEqual({
      provider: "sglang-2",
      model: "Qwen/Qwen3.6-27B",
      isLocal: true,
    });
    expect(rememberedAfterSaving("vllm-2", "gemma-4-12b")?.isLocal).toBe(true);
  });

  it("remembers a first instance as local and a cloud provider as not", () => {
    expect(rememberedAfterSaving("sglang", "m")?.isLocal).toBe(true);
    expect(rememberedAfterSaving("openai", "gpt-6")?.isLocal).toBe(false);
  });
});
