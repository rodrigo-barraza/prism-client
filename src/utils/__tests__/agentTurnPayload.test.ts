import { describe, it, expect } from "vitest";
import { buildTurnPayload, type TurnPayloadInputs } from "../agentTurnPayload";

function inputs(overrides: Partial<TurnPayloadInputs> = {}): TurnPayloadInputs {
  return {
    isNoAgent: false,
    settings: {
      provider: "anthropic",
      model: "claude-test",
      maxTokens: 64000,
      functionCallingEnabled: true,
      thinkingEnabled: false,
      agents: { workspaceEnabled: true },
    },
    messages: [{ role: "user", content: "Hi" }],
    disabledTools: ["save_memory"],
    conversationId: "conv-1",
    traceId: "trace-1",
    agentId: "CODING",
    agentProject: "coding",
    activeRuleNames: [],
    permissionMode: "default",
    planFirst: false,
    maxIterations: 25,
    maxSubAgentIterations: Infinity,
    maxRecursionDepth: 1,
    ...overrides,
  };
}

describe("buildTurnPayload", () => {
  it("sends an agent's turn to /agent with its controls", () => {
    const { path, payload } = buildTurnPayload(inputs({ activeRuleNames: ["concise"] }));
    expect(path).toBe("/agent");
    expect(payload).toMatchObject({
      provider: "anthropic",
      model: "claude-test",
      agent: "CODING",
      project: "coding",
      conversationId: "conv-1",
      disabledTools: ["save_memory"],
      functionCallingEnabled: true,
      permissionMode: "default",
      activeRuleNames: ["concise"],
      maxIterations: 25,
      // Infinity is not JSON: "no cap" goes as 0.
      maxSubAgentIterations: 0,
      maxRecursionDepth: 1,
    });
    expect(payload).not.toHaveProperty("workspaceEnabled");
  });

  it("omits the rule names when there are none, and says when the workspace is off", () => {
    const { payload } = buildTurnPayload(
      inputs({
        settings: { ...inputs().settings, agents: { workspaceEnabled: false, locale: "fr" } },
      }),
    );
    expect(payload).not.toHaveProperty("activeRuleNames");
    expect(payload).toMatchObject({ workspaceEnabled: false, locale: "fr" });
  });

  it("sends Direct Chat to /chat, with its system prompt and the turn-start marker", () => {
    const { path, payload } = buildTurnPayload(
      inputs({
        isNoAgent: true,
        settings: { ...inputs().settings, systemPrompt: "Be brief.", functionCallingEnabled: false },
      }),
    );
    expect(path).toBe("/chat");
    expect(payload.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
    ]);
    expect(payload).toHaveProperty("conversationMeta");
    expect(payload).not.toHaveProperty("agent");
    expect(payload).not.toHaveProperty("disabledTools");
  });
});
