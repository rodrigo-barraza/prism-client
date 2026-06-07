import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWorkflow } from "../src/services/WorkflowExecutor";
import PrismService from "../src/services/PrismService";

vi.mock("../src/services/PrismService", () => ({
  default: {
    getFileUrl: vi.fn((ref: string) => {
      if (ref.startsWith("minio://")) {
        return "http://localhost:5555/files/" + ref.replace("minio://", "");
      }
      return ref;
    }),
    generateText: vi.fn(),
    generateAgentText: vi.fn(),
    generateImage: vi.fn(),
    transcribeAudio: vi.fn(),
    generateSpeech: vi.fn(),
    generateEmbedding: vi.fn(),
  },
}));

describe("WorkflowExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute workflow nodes in topological order", async () => {
    const nodes = [
      { id: "node-c", nodeType: "viewer" },
      {
        id: "node-b",
        nodeType: "model",
        provider: "openai",
        modelName: "gpt-4",
        outputTypes: ["text"],
      },
      { id: "node-a", nodeType: "input", modality: "text", content: "hello" },
    ];
    const edges = [
      {
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        sourceModality: "text",
        targetModality: "text",
      },
      {
        sourceNodeId: "node-b",
        targetNodeId: "node-c",
        sourceModality: "text",
        targetModality: "text",
      },
    ];

    const executionOrder: string[] = [];
    const onNodeStart = vi.fn((nodeId) => {
      executionOrder.push(nodeId);
    });
    const onNodeComplete = vi.fn();

    vi.mocked(PrismService.generateText).mockResolvedValue({
      text: "response-b",
    });

    const result = await executeWorkflow(nodes as any, edges as any, {
      onNodeStart,
      onNodeComplete,
    });

    expect(executionOrder).toEqual(["node-a", "node-b", "node-c"]);
    expect(onNodeComplete).toHaveBeenCalledTimes(3);
    expect(result.nodeOutputs["node-a"]).toEqual({ text: "hello" });
    expect(result.nodeOutputs["node-b"]).toEqual({ text: "response-b" });
    expect(result.nodeOutputs["node-c"]).toEqual({ text: "response-b" });
  });

  it("should route to textToImage when output type is image", async () => {
    const nodes = [
      {
        id: "input-prompt",
        nodeType: "input",
        modality: "text",
        content: "a cute cat",
      },
      {
        id: "image-gen",
        nodeType: "model",
        provider: "openai",
        modelName: "dall-e-3",
        outputTypes: ["image"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "input-prompt",
        targetNodeId: "image-gen",
        sourceModality: "text",
        targetModality: "text",
      },
    ];

    vi.mocked(PrismService.generateImage).mockResolvedValue({
      imageData: "base64-image-bytes",
      mimeType: "image/png",
    });

    const result = await executeWorkflow(nodes as any, edges as any, {});

    expect(PrismService.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "dall-e-3",
        prompt: "a cute cat",
      }),
    );
    expect(result.nodeOutputs["image-gen"]).toEqual({
      image: "data:image/png;base64,base64-image-bytes",
    });
  });

  it("should route to audioToText when input has audio and output is not audio", async () => {
    const nodes = [
      {
        id: "input-audio",
        nodeType: "input",
        modality: "audio",
        content: "minio://uploads/audio.wav",
      },
      {
        id: "transcriber",
        nodeType: "model",
        provider: "openai",
        modelName: "whisper-1",
        outputTypes: ["text"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "input-audio",
        targetNodeId: "transcriber",
        sourceModality: "audio",
        targetModality: "audio",
      },
    ];

    vi.mocked(PrismService.transcribeAudio).mockResolvedValue({
      text: "transcribed speech text",
    });

    const result = await executeWorkflow(nodes as any, edges as any, {});

    expect(PrismService.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "whisper-1",
        audio: "minio://uploads/audio.wav",
      }),
    );
    expect(result.nodeOutputs["transcriber"]).toEqual({
      text: "transcribed speech text",
    });
  });

  it("should route to textToSpeech when output is audio", async () => {
    const nodes = [
      {
        id: "input-text",
        nodeType: "input",
        modality: "text",
        content: "speak this",
      },
      {
        id: "tts",
        nodeType: "model",
        provider: "openai",
        modelName: "tts-1",
        outputTypes: ["audio"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "input-text",
        targetNodeId: "tts",
        sourceModality: "text",
        targetModality: "text",
      },
    ];

    vi.mocked(PrismService.generateSpeech).mockResolvedValue({
      audioDataUrl: "data:audio/mp3;base64,...",
      contentType: "audio/mp3",
    });

    const result = await executeWorkflow(nodes as any, edges as any, {});

    expect(PrismService.generateSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "tts-1",
        text: "speak this",
      }),
    );
    expect(result.nodeOutputs["tts"]).toEqual({
      audio: "data:audio/mp3;base64,...",
    });
  });

  it("should route to modalityToEmbedding when output is embedding", async () => {
    const nodes = [
      {
        id: "input-text",
        nodeType: "input",
        modality: "text",
        content: "embed this",
      },
      {
        id: "embedder",
        nodeType: "model",
        provider: "openai",
        modelName: "text-embedding-3",
        outputTypes: ["embedding"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "input-text",
        targetNodeId: "embedder",
        sourceModality: "text",
        targetModality: "text",
      },
    ];

    vi.mocked(PrismService.generateEmbedding).mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      dimensions: 3,
      provider: "openai",
      model: "text-embedding-3",
    });

    const result = await executeWorkflow(nodes as any, edges as any, {});

    expect(PrismService.generateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "text-embedding-3",
        text: "embed this",
      }),
    );
    expect(result.nodeOutputs["embedder"]).toEqual({
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it("should compile and pass tool definitions to agent endpoint", async () => {
    const nodes = [
      {
        id: "tool-node",
        nodeType: "tools",
        builtInTools: [{ name: "search_web", description: "Search web" }],
        customTools: [
          {
            name: "my_custom",
            description: "custom desc",
            parameters: [
              {
                name: "p1",
                type: "string",
                required: true,
                description: "param desc",
              },
            ],
          },
        ],
      },
      {
        id: "agent-model",
        nodeType: "model",
        provider: "openai",
        modelName: "gpt-4",
        outputTypes: ["text"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "tool-node",
        targetNodeId: "agent-model",
        sourceModality: "tools",
        targetModality: "tools",
      },
    ];

    vi.mocked(PrismService.generateAgentText).mockResolvedValue({
      text: "agent output",
    });

    await executeWorkflow(nodes as any, edges as any, {});

    expect(PrismService.generateAgentText).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4",
        enabledTools: ["search_web", "my_custom"],
      }),
    );
  });

  it("should handle error, trigger callbacks, and skip downstream nodes", async () => {
    const nodes = [
      {
        id: "node-a",
        nodeType: "model",
        provider: "openai",
        modelName: "gpt-4",
        outputTypes: ["text"],
      },
      {
        id: "node-b",
        nodeType: "model",
        provider: "openai",
        modelName: "gpt-4",
        outputTypes: ["text"],
      },
    ];
    const edges = [
      {
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        sourceModality: "text",
        targetModality: "text",
      },
    ];

    vi.mocked(PrismService.generateText).mockRejectedValue(
      new Error("API Limit Reached"),
    );

    const onNodeStart = vi.fn();
    const onNodeComplete = vi.fn();
    const onNodeError = vi.fn();

    const result = await executeWorkflow(nodes as any, edges as any, {
      onNodeStart,
      onNodeComplete,
      onNodeError,
    });

    expect(onNodeStart).toHaveBeenCalledWith("node-a");
    expect(onNodeError).toHaveBeenCalledWith("node-a", expect.any(Error));
    expect(onNodeComplete).not.toHaveBeenCalledWith(
      "node-a",
      expect.any(Object),
    );

    expect(onNodeStart).not.toHaveBeenCalledWith("node-b");
    expect(result.nodeOutputs["node-a"]).toEqual({});
    expect(result.nodeOutputs["node-b"]).toEqual({});
  });
});
