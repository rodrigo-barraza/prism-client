import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useChatModelSettings from "../useChatModelSettings";
import PrismService from "../../services/PrismService";
import StorageService from "../../services/StorageService";
import { AGENT_IDS, STORAGE_KEY_MODEL_MEMORY_AGENT } from "../../constants";
import type { PrismConfig } from "../../types/types";

const toolCalling = ["Tool Calling"];

/** Two tool-calling models; the server recommends the first for agents. */
const catalog = {
  textToText: {
    models: {
      google: [
        { name: "gemini-3.5-flash", tools: toolCalling },
        { name: "gemini-3.8-flash", tools: toolCalling },
      ],
    },
    recommendedAgenticDefault: { provider: "google", model: "gemini-3.5-flash", temperature: 1 },
  },
} as unknown as PrismConfig;

function loadCatalog() {
  vi.spyOn(PrismService, "getFavorites").mockResolvedValue([]);
  // The real loader hands the same catalog to both callbacks, one after the other.
  vi.spyOn(PrismService, "getConfigWithLocalModels").mockImplementation(async (options) => {
    options?.onConfig?.(catalog);
    options?.onLocalMerge?.(catalog);
    return catalog;
  });
}

function renderSettings(initialModel: string | null) {
  return renderHook(() =>
    useChatModelSettings({
      agentId: AGENT_IDS.CODING,
      isNoAgent: false,
      initialModel,
      initialFcEnabled: false,
      initialThinkingEnabled: false,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useChatModelSettings — the model a new chat starts with", () => {
  it("keeps the ?model= of a deep link once the local models are merged in", async () => {
    loadCatalog();
    const { result } = renderSettings("google:gemini-3.8-flash");
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.settings).toMatchObject({ provider: "google", model: "gemini-3.8-flash" });
  });

  it("starts on the remembered model without a URL model", async () => {
    StorageService.set(STORAGE_KEY_MODEL_MEMORY_AGENT, { provider: "google", model: "gemini-3.8-flash", isLocal: false });
    loadCatalog();
    const { result } = renderSettings(null);
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.settings).toMatchObject({ provider: "google", model: "gemini-3.8-flash" });
  });

  it("falls back to the server's agentic default with neither", async () => {
    loadCatalog();
    const { result } = renderSettings(null);
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.settings).toMatchObject({ provider: "google", model: "gemini-3.5-flash" });
  });
});
