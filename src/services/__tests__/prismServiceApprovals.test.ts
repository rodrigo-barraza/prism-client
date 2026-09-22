/**
 * The approval wire: one decision per call (POST /agent/approve) and the
 * `approval_decided` event that keeps every open tab's cards in step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PrismService from "../PrismService";
import type { SSEData } from "../../types/types";

describe("PrismService — per-call approvals", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let requests: Array<{ url: string; body: unknown }> = [];
  let response: { ok: boolean; status: number; json: () => Promise<unknown> };

  beforeEach(() => {
    requests = [];
    response = { ok: true, status: 200, json: async () => ({ ok: true, decidedToolCallIds: ["call-2"] }) };
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(String((options as RequestInit).body)) });
      return response as unknown as Response;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sendApprovalDecision posts the call's own id and nothing that approves by default", async () => {
    await PrismService.sendApprovalDecision("conv-1", {
      toolCallId: "call-2",
      batchId: "batch-1",
      decision: "deny",
      reason: "not that file",
    });
    expect(requests[0].url).toContain("/agent/approve");
    expect(requests[0].body).toEqual({
      conversationId: "conv-1",
      toolCallId: "call-2",
      batchId: "batch-1",
      decision: "deny",
      reason: "not that file",
    });
  });

  it("rejects with the HTTP status so a card can tell stale (409) from invalid (400)", async () => {
    response = { ok: false, status: 409, json: async () => ({ error: "already decided" }) };
    await expect(
      PrismService.sendApprovalDecision("conv-1", { toolCallId: "call-2", decision: "allow" }),
    ).rejects.toMatchObject({ status: 409, message: "already decided" });
  });

  it("routes approval_decided to onApprovalDecided", () => {
    const onApprovalDecided = vi.fn();
    const event: SSEData = {
      type: "approval_decided",
      toolCallId: "call-1",
      batchId: "batch-1",
      decision: "deny",
      scope: "call",
      source: "timeout",
    };
    PrismService._dispatchSSE(event, { onApprovalDecided });
    expect(onApprovalDecided).toHaveBeenCalledWith(event);
  });
});
