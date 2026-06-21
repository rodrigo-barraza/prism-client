import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PrismService from "../src/services/PrismService";

describe("PrismService", () => {
  let fetchSpy: any;
  let lastUrl = "";
  let lastOptions: RequestInit | undefined = undefined;
  let fetchResult: any = { ok: true, json: async () => ({}) };

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, options: any) => {
      lastUrl = String(url);
      lastOptions = options;
      if (typeof fetchResult === "function") {
        return fetchResult();
      }
      return fetchResult;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    fetchResult = { ok: true, json: async () => ({}) };
    lastUrl = "";
    lastOptions = undefined;
  });

  describe("File Reference Resolver", () => {
    it("should resolve local and minio file paths", () => {
      expect(PrismService.getFileUrl("https://example.com/img.png")).toBe("https://example.com/img.png");
      expect(PrismService.getFileUrl("minio://some-bucket/image.png")).toContain("/files/some-bucket/image.png");
    });
  });

  describe("General _request logic & Error Handling", () => {
    it("should throw standard error if fetch fails", async () => {
      fetchResult = {
        ok: false,
        status: 500,
        json: async () => ({ message: "Internal failure error" }),
      };

      await expect(PrismService.getConfig()).rejects.toThrow("Internal failure error");
    });

    it("should fallback to default error message containing status code", async () => {
      fetchResult = {
        ok: false,
        status: 404,
        json: async () => {
          throw new Error("Cannot parse json");
        },
      };

      await expect(PrismService.getConfig()).rejects.toThrow("Prism API error: 404");
    });
  });

  describe("Config & Agent Config Operations", () => {
    it("getConfig", async () => {
      fetchResult = {
        ok: true,
        json: async () => ({ localProviders: [{ id: "test", nickname: "Test Provider" }] }),
      };
      const result = await PrismService.getConfig();
      expect(lastUrl).toContain("/config");
      expect(lastOptions?.method).toBe("GET");
      expect(result.localProviders).toBeDefined();
    });

    it("getConfigWithLocalModels", async () => {
      const onConfig = vi.fn();
      const onLocalMerge = vi.fn();
      fetchResult = {
        ok: true,
        json: async () => ({ localProviders: [{ id: "test", nickname: "Test" }] }),
      };
      await PrismService.getConfigWithLocalModels({ onConfig, onLocalMerge });
      expect(lastUrl).toContain("/config?includeLocal=true");
      expect(onConfig).toHaveBeenCalled();
      expect(onLocalMerge).toHaveBeenCalled();
    });

    it("getBuiltInToolSchemas", async () => {
      await PrismService.getBuiltInToolSchemas("coding");
      expect(lastUrl).toContain("/config/tools?agent=coding");
      expect(lastOptions?.method).toBe("GET");
    });

    it("refreshBuiltInToolSchemas", async () => {
      await PrismService.refreshBuiltInToolSchemas();
      expect(lastUrl).toContain("/config/tools/refresh");
      expect(lastOptions?.method).toBe("POST");
    });

    it("getAgentPersonas", async () => {
      await PrismService.getAgentPersonas();
      expect(lastUrl).toContain("/config/agents");
      expect(lastOptions?.method).toBe("GET");
    });
  });

  describe("Upload Operations", () => {
    it("uploadFile", async () => {
      fetchResult = {
        ok: true,
        json: async () => ({ ref: "minio://uploaded.png", size: 100, contentType: "image/png" }),
      };
      const result = await PrismService.uploadFile("data:image/png;base64,123");
      expect(lastUrl).toContain("/files/upload");
      expect(lastOptions?.method).toBe("POST");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({ data: "data:image/png;base64,123" });
      expect(result.ref).toBe("minio://uploaded.png");
    });
  });

  describe("Stats Operations", () => {
    it("getModelStats & getToolStats", async () => {
      await PrismService.getModelStats();
      expect(lastUrl).toContain("/stats/models");
      await PrismService.getToolStats();
      expect(lastUrl).toContain("/admin/stats/tools");
    });
  });

  describe("Conversation Operations", () => {
    it("getConversations, getConversation, deleteConversation", async () => {
      await PrismService.getConversations({ limit: 10, cursor: "abc" });
      expect(lastUrl).toContain("/conversations?limit=10&cursor=abc");

      await PrismService.getConversation("conv-123");
      expect(lastUrl).toContain("/conversations/conv-123");

      await PrismService.deleteConversation("conv-123");
      expect(lastUrl).toContain("/conversations/conv-123");
      expect(lastOptions?.method).toBe("DELETE");
    });

    it("getConversationTimers & cancelConversationTimer", async () => {
      await PrismService.getConversationTimers("conv-123");
      expect(lastUrl).toContain("/conversations/conv-123/timers");

      await PrismService.cancelConversationTimer("conv-123", "timer-456");
      expect(lastUrl).toContain("/conversations/conv-123/timers/timer-456/cancel");
    });

    it("getAgentConversations, getAgentConversation, deleteAgentConversation", async () => {
      await PrismService.getAgentConversations("project-a", { limit: 5, cursor: "c", agent: "coding" });
      expect(lastUrl).toContain("/conversations?type=agent&project=project-a&agent=coding&limit=5&cursor=c");

      await PrismService.getAgentConversation("conv-123", "project-a");
      expect(lastUrl).toContain("/conversations/conv-123?project=project-a");

      await PrismService.deleteAgentConversation("conv-123", "project-a");
      expect(lastUrl).toContain("/conversations/conv-123?project=project-a");
      expect(lastOptions?.method).toBe("DELETE");
    });

    it("appendMessages & patchConversation", async () => {
      await PrismService.appendMessages("conv-123", [{ role: "user", content: "hi" }], "project-a", { title: "hi" });
      expect(lastUrl).toContain("/conversations/conv-123/messages?project=project-a");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        messages: [{ role: "user", content: "hi" }],
        conversationMeta: { title: "hi" },
      });

      await PrismService.patchConversation("conv-123", { title: "updated" }, "project-a");
      expect(lastUrl).toContain("/conversations/conv-123?project=project-a");
      expect(lastOptions?.method).toBe("PATCH");
    });
  });

  describe("Favorites Operations", () => {
    it("getFavorites, addFavorite, removeFavorite", async () => {
      await PrismService.getFavorites("type-a");
      expect(lastUrl).toContain("/favorites?type=type-a");

      await PrismService.addFavorite("type-a", "key-b", { metaKey: "metaVal" });
      expect(lastUrl).toContain("/favorites");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        type: "type-a",
        key: "key-b",
        meta: { metaKey: "metaVal" },
      });

      await PrismService.removeFavorite("type-a", "key-b");
      expect(lastUrl).toContain("/favorites?type=type-a&key=key-b");
      expect(lastOptions?.method).toBe("DELETE");
    });
  });

  describe("Custom Agent Operations", () => {
    it("getCustomAgents, createCustomAgent, updateCustomAgent, deleteCustomAgent", async () => {
      await PrismService.getCustomAgents();
      expect(lastUrl).toContain("/custom-agents");

      await PrismService.createCustomAgent({ name: "agent-a" } as any);
      expect(lastUrl).toContain("/custom-agents");
      expect(lastOptions?.method).toBe("POST");

      await PrismService.updateCustomAgent("agent-123", { name: "agent-updated" });
      expect(lastUrl).toContain("/custom-agents/agent-123");
      expect(lastOptions?.method).toBe("PUT");

      await PrismService.deleteCustomAgent("agent-123");
      expect(lastUrl).toContain("/custom-agents/agent-123");
      expect(lastOptions?.method).toBe("DELETE");
    });
  });

  describe("Skills Operations", () => {
    it("getSkills, createSkill, updateSkill, deleteSkill", async () => {
      await PrismService.getSkills("project-a");
      expect(lastUrl).toContain("/skills?project=project-a");

      await PrismService.createSkill({ name: "skill-a" } as any);
      expect(lastUrl).toContain("/skills");
      expect(lastOptions?.method).toBe("POST");

      await PrismService.updateSkill("skill-123", { name: "skill-updated" });
      expect(lastUrl).toContain("/skills/skill-123");
      expect(lastOptions?.method).toBe("PUT");

      await PrismService.deleteSkill("skill-123");
      expect(lastUrl).toContain("/skills/skill-123");
      expect(lastOptions?.method).toBe("DELETE");
    });
  });

  describe("Rules Operations", () => {
    it("getRules, createRule, updateRule, deleteRule", async () => {
      await PrismService.getRules("coding");
      expect(lastUrl).toContain("/rules?agent=coding");

      await PrismService.createRule({ name: "rule-a" } as any);
      expect(lastUrl).toContain("/rules");
      expect(lastOptions?.method).toBe("POST");

      await PrismService.updateRule("rule-123", { name: "rule-updated" });
      expect(lastUrl).toContain("/rules/rule-123");
      expect(lastOptions?.method).toBe("PUT");

      await PrismService.deleteRule("rule-123");
      expect(lastUrl).toContain("/rules/rule-123");
      expect(lastOptions?.method).toBe("DELETE");
    });
  });

  describe("Agent Memories Operations", () => {
    it("getAgentMemories, deleteAgentMemory, consolidateMemories, getConsolidationHistory", async () => {
      await PrismService.getAgentMemories("project-a", 10, "coding", 0, "type-x");
      // skip=0 is filtered out due to JS falsy check if (skip) in PrismService.tsx
      expect(lastUrl).toContain("/agent-memories?project=project-a&limit=10&agent=coding&type=type-x");

      await PrismService.deleteAgentMemory("memory-123");
      expect(lastUrl).toContain("/agent-memories/memory-123");

      await PrismService.consolidateMemories("project-a", "coding");
      expect(lastUrl).toContain("/agent-memories/consolidate");

      await PrismService.getConsolidationHistory("project-a", 5);
      expect(lastUrl).toContain("/agent-memories/consolidation-history?project=project-a&limit=5");
    });
  });

  describe("Settings Operations", () => {
    it("getSettings, updateSettings, getSettingsDefaults, getHarnesses", async () => {
      await PrismService.getSettings();
      expect(lastUrl).toContain("/settings");

      await PrismService.updateSettings({ provider: "google" });
      expect(lastUrl).toContain("/settings");
      expect(lastOptions?.method).toBe("PUT");

      await PrismService.getSettingsDefaults();
      expect(lastUrl).toContain("/settings/defaults");

      await PrismService.getHarnesses();
      expect(lastUrl).toContain("/settings/harnesses");
    });

    it("workspace agent download urls", () => {
      expect(PrismService.getWorkspaceAgentDownloadUrl()).toContain("/workspaces/download/agent");
      expect(PrismService.getWorkspaceAgentPlatformDownloadUrl("linux")).toContain("/workspaces/download/agent?platform=linux");
      expect(PrismService.getWorkspaceAgentTrayAppDownloadUrl("windows")).toContain("/workspaces/download/tray-app?platform=windows");
    });
  });

  describe("MCP Server Operations", () => {
    it("getMCPServers, createMCPServer, updateMCPServer, deleteMCPServer, connectMCPServer, disconnectMCPServer", async () => {
      await PrismService.getMCPServers("project-a");
      expect(lastUrl).toContain("/mcp-servers?project=project-a");

      await PrismService.createMCPServer({ name: "mcp-a" } as any);
      expect(lastUrl).toContain("/mcp-servers");

      await PrismService.updateMCPServer("mcp-123", { name: "mcp-updated" });
      expect(lastUrl).toContain("/mcp-servers/mcp-123");

      await PrismService.deleteMCPServer("mcp-123");
      expect(lastUrl).toContain("/mcp-servers/mcp-123");

      await PrismService.connectMCPServer("mcp-123");
      expect(lastUrl).toContain("/mcp-servers/mcp-123/connect");

      await PrismService.disconnectMCPServer("mcp-123");
      expect(lastUrl).toContain("/mcp-servers/mcp-123/disconnect");
    });
  });

  describe("Coordinator Sub-Agents & Scheduled Tasks", () => {
    it("getCoordinatorSubAgents & stopCoordinatorSubAgents", async () => {
      fetchResult = {
        ok: true,
        json: async () => ({
          subAgents: [
            {
              agentId: "sub-1",
              description: "test sub",
              status: "running",
              durationMs: 100,
              toolUses: 2,
              hasChanges: false,
            },
          ],
        }),
      };
      const result = await PrismService.getCoordinatorSubAgents("conv-123");
      expect(lastUrl).toContain("/orchestrator/sub-agents?conversationId=conv-123");
      expect(result.subAgents).toHaveLength(1);
      expect(result.subAgents[0].id).toBe("sub-1");

      await PrismService.stopCoordinatorSubAgents("conv-123");
      expect(lastUrl).toContain("/orchestrator/sub-agents/stop");
    });

    it("cron operations", async () => {
      await PrismService.getCronJobs();
      expect(lastUrl).toContain("/scheduled-tasks");

      await PrismService.getAllCronJobs();
      expect(lastUrl).toContain("/scheduled-tasks/all");

      await PrismService.getTaskConversations("project-a", "task-b", 15);
      expect(lastUrl).toContain("/conversations?type=agent&project=project-a&taskId=task-b&limit=15");

      await PrismService.createCronJob({ name: "cron-a" } as any);
      expect(lastUrl).toContain("/scheduled-tasks");

      await PrismService.updateCronJob("cron-123", { name: "cron-updated" });
      expect(lastUrl).toContain("/scheduled-tasks/cron-123");

      await PrismService.deleteCronJob("cron-123");
      expect(lastUrl).toContain("/scheduled-tasks/cron-123");

      await PrismService.triggerCronJob("cron-123");
      expect(lastUrl).toContain("/scheduled-tasks/cron-123/trigger");
    });
  });

  describe("Chat Generation, Approval, and Modalities", () => {
    it("generateText & generateAgentText", async () => {
      await PrismService.generateText({ prompt: "hi" } as any);
      expect(lastUrl).toContain("/chat?stream=false");

      await PrismService.generateAgentText({ prompt: "hi" } as any);
      expect(lastUrl).toContain("/agent?stream=false");
    });

    it("sendApprovalResponse & sendUserQuestionAnswer", async () => {
      await PrismService.sendApprovalResponse("conv-123", true, { approveAll: true });
      expect(lastUrl).toContain("/agent/approve");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        conversationId: "conv-123",
        approved: true,
        approveAll: true,
      });

      await PrismService.sendUserQuestionAnswer("conv-123", "text-answer");
      expect(lastUrl).toContain("/agent/answer");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        conversationId: "conv-123",
        answer: "text-answer",
      });

      await PrismService.sendUserQuestionAnswer("conv-123", [{ answer: "ans-1" }]);
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        conversationId: "conv-123",
        answers: [{ answer: "ans-1" }],
      });
    });

    it("uploadVisionFrame, transcribeAudio, generateSpeech, generateEmbedding", async () => {
      await PrismService.uploadVisionFrame("conv-123", "data:frame");
      expect(lastUrl).toContain("/agent/conversation/conv-123/frame");

      await PrismService.transcribeAudio({} as any);
      expect(lastUrl).toContain("/audio-to-text");

      fetchResult = {
        ok: true,
        json: async () => ({ audio: "data:audio" }),
      };
      await PrismService.generateSpeech({} as any);
      expect(lastUrl).toContain("/text-to-audio?format=dataUrl");

      fetchResult = {
        ok: true,
        json: async () => ({}),
      };
      await PrismService.generateEmbedding({} as any);
      expect(lastUrl).toContain("/embed");
    });

    it("generateSpeech error fallback logic", async () => {
      fetchResult = {
        ok: false,
        text: async () => '{"message": "Speech generation service unavailable"}',
      };
      await expect(PrismService.generateSpeech({} as any)).rejects.toThrow("Speech generation service unavailable");

      fetchResult = {
        ok: false,
        text: async () => "Plain error text",
      };
      await expect(PrismService.generateSpeech({} as any)).rejects.toThrow("Failed to generate speech");
    });

    it("generateImage & captionImage", async () => {
      await PrismService.generateImage({
        prompt: "landscape",
        images: [{ mimeType: "image/jpeg", imageData: "base64..." }],
        systemPrompt: "sys-prompt",
        conversationId: "conv-123",
        conversationMeta: { title: "title" },
      } as any);
      expect(lastUrl).toContain("/chat?stream=false");
      expect(JSON.parse(lastOptions?.body as string)).toEqual({
        messages: [{
          role: "user",
          content: "landscape",
          images: ["data:image/jpeg;base64,base64..."],
        }],
        systemPrompt: "sys-prompt",
        conversationId: "conv-123",
        conversationMeta: { title: "title" },
      });

      await PrismService.generateImage({
        prompt: "landscape",
        images: ["https://example.com/img.jpg"],
      } as any);
      expect(JSON.parse(lastOptions?.body as string).messages[0].images).toEqual(["https://example.com/img.jpg"]);

      await PrismService.captionImage({} as any);
      expect(lastUrl).toContain("/chat?stream=false");
    });
  });

  describe("Workflows, Media, and Text Lists", () => {
    it("getWorkflows, getWorkflow, saveWorkflow, updateWorkflow, deleteWorkflow, patchWorkflowConversations", async () => {
      await PrismService.getWorkflows();
      expect(lastUrl).toContain("/workflows?source=prism-client");

      await PrismService.getWorkflow("wf-123");
      expect(lastUrl).toContain("/workflows/wf-123");

      await PrismService.saveWorkflow({ name: "wf-a" } as any);
      expect(lastUrl).toContain("/workflows");

      await PrismService.updateWorkflow("wf-123", { name: "wf-updated" });
      expect(lastUrl).toContain("/workflows/wf-123");

      await PrismService.deleteWorkflow("wf-123");
      expect(lastUrl).toContain("/workflows/wf-123");

      await PrismService.patchWorkflowConversations("wf-123", ["conv-1"]);
      expect(lastUrl).toContain("/workflows/wf-123/conversations");
    });

    it("getMedia & getText list with filters", async () => {
      await PrismService.getMedia({ limit: 10, type: "image" });
      expect(lastUrl).toContain("/media?limit=10&type=image");

      await PrismService.getText({ limit: 5, search: "query" });
      expect(lastUrl).toContain("/text?limit=5&search=query");
    });
  });

  describe("LM Studio & Ollama Operations", () => {
    it("getLmStudioModels & getOllamaModels", async () => {
      await PrismService.getLmStudioModels("instance-a");
      expect(lastUrl).toContain("/lm-studio/models?instance=instance-a");

      await PrismService.getOllamaModels("instance-b");
      expect(lastUrl).toContain("/ollama/models?instance=instance-b");
    });

    it("loadLmStudioModel & unloadLmStudioModel & estimateLmStudioMemory", async () => {
      await PrismService.loadLmStudioModel("model-a", { contextLength: 2048 });
      expect(lastUrl).toContain("/lm-studio/load");

      await PrismService.unloadLmStudioModel("instance-a");
      expect(lastUrl).toContain("/lm-studio/unload");

      await PrismService.estimateLmStudioMemory("model-a", { contextLength: 4096 });
      expect(lastUrl).toContain("/lm-studio/estimate");
    });
  });

  describe("Benchmarks & Synthesis & VRAM", () => {
    it("getBenchmarkPresets, getBenchmarks, getBenchmarkStats, getBenchmarkModels", async () => {
      fetchResult = {
        ok: true,
        json: async () => ({ presets: [] }),
      };
      await PrismService.getBenchmarkPresets();
      expect(lastUrl).toContain("/benchmark/presets");

      fetchResult = { ok: true, json: async () => ({}) };
      await PrismService.getBenchmarks();
      expect(lastUrl).toContain("/benchmark");

      await PrismService.getBenchmarkStats();
      expect(lastUrl).toContain("/benchmark/stats");

      await PrismService.getBenchmarkModels();
      expect(lastUrl).toContain("/benchmark/models");
    });

    it("createBenchmark, getBenchmark, deleteBenchmark, runBenchmark, getBenchmarkRuns, rerunBenchmark, abortBenchmarkRun, getActiveBenchmarks, getBenchmarkActive", async () => {
      await PrismService.createBenchmark({} as any);
      expect(lastUrl).toContain("/benchmark");

      await PrismService.getBenchmark("bm-123");
      expect(lastUrl).toContain("/benchmark/bm-123");

      await PrismService.deleteBenchmark("bm-123");
      expect(lastUrl).toContain("/benchmark/bm-123");

      await PrismService.runBenchmark("bm-123", ["model-a"]);
      expect(lastUrl).toContain("/benchmark/bm-123/run");

      await PrismService.getBenchmarkRuns("bm-123");
      expect(lastUrl).toContain("/benchmark/bm-123/runs");

      await PrismService.rerunBenchmark("bm-123", "run-456");
      expect(lastUrl).toContain("/benchmark/bm-123/runs/run-456/rerun");

      await PrismService.abortBenchmarkRun("bm-123");
      expect(lastUrl).toContain("/benchmark/bm-123/abort");

      await PrismService.getActiveBenchmarks();
      expect(lastUrl).toContain("/benchmark/active-list");

      await PrismService.getBenchmarkActive("bm-123");
      expect(lastUrl).toContain("/benchmark/bm-123/active");
    });

    it("getSynthesisRuns, getSynthesisRun, createSynthesisRun, deleteSynthesisRun", async () => {
      await PrismService.getSynthesisRuns();
      expect(lastUrl).toContain("/synthesis");

      await PrismService.getSynthesisRun("syn-123");
      expect(lastUrl).toContain("/synthesis/syn-123");

      await PrismService.createSynthesisRun({} as any);
      expect(lastUrl).toContain("/synthesis");

      await PrismService.deleteSynthesisRun("syn-123");
      expect(lastUrl).toContain("/synthesis/syn-123");
    });

    it("vram benchmarks operations", async () => {
      await PrismService.getVramBenchmarks({ limit: "10" });
      expect(lastUrl).toContain("/vram-benchmarks?limit=10");

      await PrismService.getVramBenchmarkMachines();
      expect(lastUrl).toContain("/vram-benchmarks/machines");

      await PrismService.getVramBenchmarkSettings();
      expect(lastUrl).toContain("/vram-benchmarks/settings");

      await PrismService.getVramBenchmarkContexts({ device: "gpu" });
      expect(lastUrl).toContain("/vram-benchmarks/contexts?device=gpu");
    });
  });

  describe("Prompts Operations", () => {
    it("getPrompts, getPrompt, createPrompt, updatePrompt, deletePrompt", async () => {
      await PrismService.getPrompts({ limit: 10 });
      expect(lastUrl).toContain("/prompts?limit=10");

      await PrismService.getPrompt("prompt-123");
      expect(lastUrl).toContain("/prompts/prompt-123");

      await PrismService.createPrompt({ title: "p-a", content: "c-a" });
      expect(lastUrl).toContain("/prompts");

      await PrismService.updatePrompt("prompt-123", { title: "p-updated" });
      expect(lastUrl).toContain("/prompts/prompt-123");

      await PrismService.deletePrompt("prompt-123");
      expect(lastUrl).toContain("/prompts/prompt-123");
    });
  });

  describe("SSE Streaming Helper Functions", () => {
    it("streamText & streamAgentText & streamBenchmarkRun & followBenchmarkRun", () => {
      const callbacks = {
        onError: vi.fn(),
      };

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("data: {\"type\":\"chunk\",\"content\":\"hi\"}\n\n") })
          .mockResolvedValue({ done: true }),
      };
      fetchResult = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      };

      const stop1 = PrismService.streamText({} as any, callbacks);
      expect(lastUrl).toContain("/chat");
      stop1();

      const stop2 = PrismService.streamAgentText({} as any, callbacks);
      expect(lastUrl).toContain("/agent");
      stop2();

      const stop3 = PrismService.streamBenchmarkRun("bm-123", [] as any, callbacks);
      expect(lastUrl).toContain("/benchmark/bm-123/run");
      stop3();

      const stop4 = PrismService.followBenchmarkRun("bm-123", callbacks);
      expect(lastUrl).toContain("/benchmark/bm-123/follow");
      stop4();
    });

    it("should process and dispatch server-sent event types correctly", () => {
      const callbacks = {
        onChunk: vi.fn(),
        onThinking: vi.fn(),
        onImage: vi.fn(),
        onAudio: vi.fn(),
        onExecutableCode: vi.fn(),
        onCodeExecutionResult: vi.fn(),
        onWebSearchResult: vi.fn(),
        onToolCall: vi.fn(),
        onToolExecution: vi.fn(),
        onToolOutput: vi.fn(),
        onApprovalRequired: vi.fn(),
        onPlanProposal: vi.fn(),
        onSubAgentToolExecution: vi.fn(),
        onSubAgentToolOutput: vi.fn(),
        onSubAgentStatus: vi.fn(),
        onUserQuestion: vi.fn(),
        onTodoUpdate: vi.fn(),
        onBriefUpdate: vi.fn(),
        onRunInfo: vi.fn(),
        onModelStart: vi.fn(),
        onModelComplete: vi.fn(),
        onRunComplete: vi.fn(),
        onUsageUpdate: vi.fn(),
        onStatus: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      };

      const testEvents = [
        { type: "chunk", content: "chunk-content", _sourceModel: "model-a", outputCharacters: 13 },
        { type: "thinking", content: "thinking-content", _sourceModel: "model-a", outputCharacters: 16 },
        { type: "image", data: "base64data", mimeType: "image/png", minioRef: "minio://img" },
        { type: "audio", data: "audiobase64", mimeType: "audio/wav" },
        { type: "executableCode", code: "console.log('hi')", language: "javascript" },
        { type: "codeExecutionResult", output: "success", outcome: "exit_0" },
        { type: "webSearchResult", results: [{ title: "page" }] },
        { type: "toolCall", id: "call-1", name: "tool-name", args: { x: 1 }, result: "res", status: "pending", thoughtSignature: "sig", _sourceModel: "model-a" },
        { type: "tool_execution" },
        { type: "tool_output" },
        { type: "approval_required" },
        { type: "plan_proposal" },
        { type: "sub_agent_tool_execution" },
        { type: "sub_agent_tool_output" },
        { type: "sub_agent_status" },
        { type: "user_question" },
        { type: "todo_update" },
        { type: "brief_update" },
        { type: "run_info" },
        { type: "model_start" },
        { type: "model_complete" },
        { type: "run_complete" },
        { type: "usage_update" },
        { type: "status" },
        { type: "done" },
        { type: "error", message: "fail" },
      ];

      for (const event of testEvents) {
        PrismService._dispatchSSE(event as any, callbacks);
      }

      expect(callbacks.onChunk).toHaveBeenCalledWith("chunk-content", "model-a", 13);
      expect(callbacks.onThinking).toHaveBeenCalledWith("thinking-content", "model-a", 16);
      expect(callbacks.onImage).toHaveBeenCalledWith("base64data", "image/png", "minio://img");
      expect(callbacks.onAudio).toHaveBeenCalledWith("audiobase64", "audio/wav");
      expect(callbacks.onExecutableCode).toHaveBeenCalledWith("console.log('hi')", "javascript");
      expect(callbacks.onCodeExecutionResult).toHaveBeenCalledWith("success", "exit_0");
      expect(callbacks.onWebSearchResult).toHaveBeenCalledWith([{ title: "page" }]);
      expect(callbacks.onToolCall).toHaveBeenCalledWith({
        id: "call-1",
        name: "tool-name",
        args: { x: 1 },
        result: "res",
        status: "pending",
        thoughtSignature: "sig",
        _sourceModel: "model-a",
      });
      expect(callbacks.onToolExecution).toHaveBeenCalled();
      expect(callbacks.onToolOutput).toHaveBeenCalled();
      expect(callbacks.onApprovalRequired).toHaveBeenCalled();
      expect(callbacks.onPlanProposal).toHaveBeenCalled();
      expect(callbacks.onSubAgentToolExecution).toHaveBeenCalled();
      expect(callbacks.onSubAgentToolOutput).toHaveBeenCalled();
      expect(callbacks.onSubAgentStatus).toHaveBeenCalled();
      expect(callbacks.onUserQuestion).toHaveBeenCalled();
      expect(callbacks.onTodoUpdate).toHaveBeenCalled();
      expect(callbacks.onBriefUpdate).toHaveBeenCalled();
      expect(callbacks.onRunInfo).toHaveBeenCalled();
      expect(callbacks.onModelStart).toHaveBeenCalled();
      expect(callbacks.onModelComplete).toHaveBeenCalled();
      expect(callbacks.onRunComplete).toHaveBeenCalled();
      expect(callbacks.onUsageUpdate).toHaveBeenCalled();
      expect(callbacks.onStatus).toHaveBeenCalled();
      expect(callbacks.onDone).toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalled();
    });
  });

  describe("LM Studio Load Progress Streaming", () => {
    it("should simulate progressive percentages on load stream", async () => {
      vi.useFakeTimers();
      const onProgress = vi.fn();
      const onComplete = vi.fn();

      fetchResult = {
        ok: true,
        json: async () => ({ success: true }),
      };

      const cancel = PrismService.loadLmStudioModelStream(
        "model-a",
        {},
        { onProgress, onComplete }
      );

      expect(onProgress).toHaveBeenCalledWith(0);

      // Fast forward interval ticks
      await vi.advanceTimersByTimeAsync(3000);
      expect(onProgress.mock.calls.length).toBeGreaterThan(1);

      // Complete fetch
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      cancel();
    });
  });
});
