import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useChatSidebar from "../useChatSidebar";
import PrismService from "../../services/PrismService";
import ToolsApiService from "../../services/ToolsApiService";

type Options = Parameters<typeof useChatSidebar>[0];

function options(overrides: Partial<Options> = {}): Options {
  return {
    initialTabKey: null,
    initialTabBottomKey: null,
    reportUrlChange: () => {},
    isAdmin: false,
    agentId: "CODING",
    agentProject: "prism-chat",
    conversationId: "conversation-1",
    isWorkspaceTabVisible: false,
    hasOrchestratorTools: false,
    isToolsetKnown: false,
    hasLoadedModelSettings: false,
    hasAnyMemoryModelSet: false,
    setSubAgentToolActivity: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(PrismService, "getAgentMemories").mockResolvedValue({ total: 0 } as never);
  vi.spyOn(PrismService, "getWorkflowMemories").mockResolvedValue({ total: 0 } as never);
  vi.spyOn(PrismService, "getCoordinatorSubAgents").mockResolvedValue({ subAgents: [] } as never);
  vi.spyOn(ToolsApiService, "getAllAgenticTasks").mockResolvedValue({ tasks: [] } as never);
  vi.spyOn(ToolsApiService, "queryDatastore").mockResolvedValue({ namespaces: [] } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChatSidebar — a ?tab= link", () => {
  it.each(["subAgents", "workspace"])("keeps ?tab=%s while the tools and workspaces load, and after they offer it", (tab) => {
    const { result, rerender } = renderHook((props: Options) => useChatSidebar(props), {
      initialProps: options({ initialTabKey: tab }),
    });
    expect(result.current.leftTab).toBe(tab);
    rerender(options({ initialTabKey: tab, isToolsetKnown: true, hasOrchestratorTools: true, isWorkspaceTabVisible: true }));
    expect(result.current.leftTab).toBe(tab);
  });

  it.each(["subAgents", "workspace"])("falls back to Settings once the loaded tools do not offer %s", (tab) => {
    const { result, rerender } = renderHook((props: Options) => useChatSidebar(props), {
      initialProps: options({ initialTabKey: tab }),
    });
    rerender(options({ initialTabKey: tab, isToolsetKnown: true }));
    expect(result.current.leftTab).toBe("settings");
  });
});
