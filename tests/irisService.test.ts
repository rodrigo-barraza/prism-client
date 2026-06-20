import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import IrisService from "../src/services/IrisService";
import { PRISM_SERVICE_URL } from "../src/config";
import { subscribe as mockSseSubscribe } from "../src/services/SSEManager";

vi.mock("../src/services/SSEManager", () => ({
  subscribe: vi.fn().mockReturnValue({
    unsubscribe: vi.fn(),
  }),
}));

describe("IrisService", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("should query requests with specified filters", async () => {
    const mockRequestResponse = { data: [], total: 0, count: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRequestResponse,
    });

    const result = await IrisService.getRequests({
      limit: 20,
      model: "gemini",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/requests?limit=20&model=gemini`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-username": "admin",
        }),
      }),
    );
    expect(result).toEqual(mockRequestResponse);
  });

  it("should fetch request entry by ID", async () => {
    const mockEntry = { _id: "request-1" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockEntry,
    });

    const result = await IrisService.getRequest("request-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/requests/request-1`,
      expect.any(Object),
    );
    expect(result).toEqual(mockEntry);
  });

  it("should fetch associations for request by ID", async () => {
    const mockAssociations = { conversation: { id: "conversation-1" } };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAssociations,
    });

    const result = await IrisService.getRequestAssociations("request-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/requests/request-1/associations`,
      expect.any(Object),
    );
    expect(result).toEqual(mockAssociations);
  });

  it("should fetch aggregated analytics stats", async () => {
    const mockStats = { totalRequests: 15 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStats,
    });

    const result = await IrisService.getStats({ project: "prism" });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats?project=prism`,
      expect.any(Object),
    );
    expect(result).toEqual(mockStats);
  });

  it("should fetch project, model, agent, and user specific statistics", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await IrisService.getProjectStats({ days: 7 });
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/projects?days=7`,
      expect.any(Object),
    );

    await IrisService.getModelStats({ days: 7 });
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/models?days=7`,
      expect.any(Object),
    );

    await IrisService.getAgentStats({ days: 7 });
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/agents?days=7`,
      expect.any(Object),
    );

    await IrisService.getUserStats({ days: 7 });
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/users?days=7`,
      expect.any(Object),
    );
  });

  it("should query endpoint usage details", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await IrisService.getEndpointStats();
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/endpoints`,
      expect.any(Object),
    );
  });

  it("should fetch request timeline data with customized hours and granularity", async () => {
    const mockTimeline = { data: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTimeline,
    });

    const result = await IrisService.getTimeline(
      12,
      { project: "prism" },
      "hourly",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/timeline?hours=12&project=prism&granularity=hourly`,
      expect.any(Object),
    );
    expect(result).toEqual(mockTimeline);
  });

  it("should query cost stats summary", async () => {
    const mockCostResponse = { totalCost: 1.25 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCostResponse,
    });

    const result = await IrisService.getCostStats({ project: "my-project" });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/stats/costs?project=my-project`,
      expect.any(Object),
    );
    expect(result).toEqual(mockCostResponse);
  });

  it("should fetch all conversations", async () => {
    const mockConversationsResponse = { data: [], total: 0, count: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockConversationsResponse,
    });

    const result = await IrisService.getConversations({ limit: 10 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/conversations?limit=10`,
      expect.any(Object),
    );
    expect(result).toEqual(mockConversationsResponse);
  });

  it("should fetch single conversation by ID", async () => {
    const mockConversation = { id: "conv-1", messages: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockConversation,
    });

    const result = await IrisService.getConversation("conv-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/conversations/conv-1`,
      expect.any(Object),
    );
    expect(result).toEqual(mockConversation);
  });

  it("should fetch unique filter criteria options for conversations list", async () => {
    const mockFilters = {
      projects: [],
      usernames: [],
      models: [],
      providers: [],
      workspaces: [],
      agents: [],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockFilters,
    });

    const result = await IrisService.getConversationFilters();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/conversations/filters`,
      expect.any(Object),
    );
    expect(result).toEqual(mockFilters);
  });

  it("should fetch workflow records linked to a conversation", async () => {
    const mockWorkflows = [{ id: "workflow-1" }];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockWorkflows,
    });

    const result = await IrisService.getConversationWorkflows("conv-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/conversations/conv-1/workflows`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-username": "admin",
        }),
      }),
    );
    expect(result).toEqual(mockWorkflows);
  });

  it("should fetch live telemetry activity", async () => {
    const mockLiveActivity = { requests: [], activeCount: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockLiveActivity,
    });

    const result = await IrisService.getLiveActivity(10);

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/live?minutes=10`,
      expect.any(Object),
    );
    expect(result).toEqual(mockLiveActivity);
  });

  it("should fetch real-time session statistics", async () => {
    const mockSessionStats = { generatingCount: 2 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSessionStats,
    });

    const result = await IrisService.getConversationStats("my-project");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/conversations/stats?project=my-project`,
      expect.any(Object),
    );
    expect(result).toEqual(mockSessionStats);
  });

  it("should register subscription stream for conversation stats", () => {
    const mockStatsCallback = vi.fn();
    const subscription = IrisService.subscribeConversationStats(
      mockStatsCallback,
      "my-project",
    );

    expect(mockSseSubscribe).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/conversations/stream?project=my-project`,
      expect.any(Function),
    );

    // Trigger internal SSE callback and assert fan-out
    const capturedCallback = vi.mocked(mockSseSubscribe).mock.calls[0][1];
    const testPayload = { generatingCount: 3 };
    capturedCallback(testPayload);

    expect(mockStatsCallback).toHaveBeenCalledWith(testPayload);

    subscription.close();
  });

  it("should register subscription stream for collection change events", () => {
    const mockChangeCallback = vi.fn();
    const mockStatusCallback = vi.fn();

    const subscription = IrisService.subscribeCollectionChanges({
      onChange: mockChangeCallback,
      onStatus: mockStatusCallback,
    });

    expect(mockSseSubscribe).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/changes/stream`,
      expect.any(Function),
    );

    const capturedCallback = vi.mocked(mockSseSubscribe).mock.calls[0][1];

    // Simulate type: status
    const statusPayload = { type: "status", collection: "conversations" };
    capturedCallback(statusPayload);
    expect(mockStatusCallback).toHaveBeenCalledWith(statusPayload);
    expect(mockChangeCallback).not.toHaveBeenCalled();

    // Simulate type: change
    const changePayload = { type: "change", collection: "conversations" };
    capturedCallback(changePayload);
    expect(mockChangeCallback).toHaveBeenCalledWith(changePayload);

    subscription.close();
  });

  it("should retrieve API server health status", async () => {
    const mockHealth = { status: "ok" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealth,
    });

    const result = await IrisService.getHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/health`,
      expect.any(Object),
    );
    expect(result).toEqual(mockHealth);
  });

  it("should retrieve list of models configured on LM Studio", async () => {
    const mockModels = { models: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockModels,
    });

    const result = await IrisService.getLmStudioModels();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/lm-studio/models`,
      expect.any(Object),
    );
    expect(result).toEqual(mockModels);
  });

  it("should trigger model loading on LM Studio", async () => {
    const mockLoadResponse = { success: true, instance_id: "inst-1" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockLoadResponse,
    });

    const result = await IrisService.loadLmStudioModel("my-model", {
      contextLength: 2048,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/lm-studio/load`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "my-model",
          context_length: 2048,
        }),
      }),
    );
    expect(result).toEqual(mockLoadResponse);
  });

  it("should trigger model unloading on LM Studio", async () => {
    const mockUnloadResponse = { success: true };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUnloadResponse,
    });

    const result = await IrisService.unloadLmStudioModel("inst-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/lm-studio/unload`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ instance_id: "inst-1" }),
      }),
    );
    expect(result).toEqual(mockUnloadResponse);
  });

  it("should fetch VRAM memory estimates from LM Studio", async () => {
    const mockEstimate = { vram_required_mb: 4096 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockEstimate,
    });

    const result = await IrisService.estimateLmStudioMemory("my-model", {
      flashAttention: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/lm-studio/estimate`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "my-model", flashAttention: true }),
      }),
    );
    expect(result).toEqual(mockEstimate);
  });

  it("should list available workflows", async () => {
    const mockWorkflows = { data: [], total: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockWorkflows,
    });

    const result = await IrisService.getWorkflows({ limit: 5 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/workflows?limit=5`,
      expect.any(Object),
    );
    expect(result).toEqual(mockWorkflows);
  });

  it("should fetch detailed workflow metadata by ID", async () => {
    const mockWorkflow = { id: "wf-1", nodes: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockWorkflow,
    });

    const result = await IrisService.getWorkflow("wf-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/workflows/wf-1`,
      expect.any(Object),
    );
    expect(result).toEqual(mockWorkflow);
  });

  it("should query trace lists", async () => {
    const mockTraces = { data: [], total: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTraces,
    });

    const result = await IrisService.getTraces({ limit: 10 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/traces?limit=10`,
      expect.any(Object),
    );
    expect(result).toEqual(mockTraces);
  });

  it("should retrieve single trace by ID", async () => {
    const mockTrace = { _id: "trace-1" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTrace,
    });

    const result = await IrisService.getTrace("trace-1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/traces/trace-1`,
      expect.any(Object),
    );
    expect(result).toEqual(mockTrace);
  });

  it("should query conversation statistics and requests", async () => {
    const mockStats = { totalTokens: 100 };
    const mockRequests = { requests: [] };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockRequests,
      });

    const statsResult = await IrisService.getConversationRunStats("sess-1");
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/agent-conversations/sess-1/stats`,
      expect.any(Object),
    );
    expect(statsResult).toEqual(mockStats);

    const requestsResult = await IrisService.getConversationRequests("sess-1");
    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/admin/agent-conversations/sess-1/requests`,
      expect.any(Object),
    );
    expect(requestsResult).toEqual(mockRequests);
  });

  it("should retrieve client configuration parameters", async () => {
    const mockPrismConfig = { localProviders: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPrismConfig,
    });

    const result = await IrisService.getConfig();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/config`,
      expect.any(Object),
    );
    expect(result).toEqual(mockPrismConfig);
  });

  it("should retrieve rate limits configurations", async () => {
    const mockLimits = {};
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockLimits,
    });

    const result = await IrisService.getRateLimits();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/config/rate-limits`,
      expect.any(Object),
    );
    expect(result).toEqual(mockLimits);
  });

  it("should throw error with custom message when backend returns an error message", async () => {
    const errorResponse = { message: "Internal server crash" };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => errorResponse,
    });

    await expect(IrisService.getHealth()).rejects.toThrow(
      "Internal server crash",
    );
  });

  it("should fall back to standard HTTP status message if backend message parsing fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("Cannot parse");
      },
    });

    await expect(IrisService.getHealth()).rejects.toThrow(
      "Request failed: 503",
    );
  });
});
