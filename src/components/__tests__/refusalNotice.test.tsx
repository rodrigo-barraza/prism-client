/**
 * A turn a provider's safety filter ended says so. Conversation 9cf6ebdd
 * (2026-10-04): Google blocked a Gemini reply, Prism did not say so, and
 * the chat showed five "[System: Reasoning preserved…]" USER messages and
 * "Sorry, I cannot fulfill your request." The service now ends the turn on
 * the block with an empty reply that carries `refusal`, and its nudges are
 * harness (system) messages — this is what the chat draws from that.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import MessageList from "../MessageListComponent";
import type { Message } from "../../types/types";

vi.mock("../../services/PrismService", () => ({
  default: { sendApprovalDecision: vi.fn() },
}));

describe("a refused turn in the message list", () => {
  it("says the provider's filter blocked the reply, and shows no harness nudge", () => {
    const messages: Message[] = [
      { role: "user", content: "Can we fix this from that?", timestamp: "2026-10-04T06:39:43Z" },
      {
        role: "system",
        content: "<empty-output-recovery>\n\nYour last response was reasoning only.\n\n</empty-output-recovery>",
      },
      {
        role: "assistant",
        content: "",
        model: "gemini-3.8-flash",
        provider: "google",
        refusal: { category: "OTHER", explanation: null, model: "gemini-3.8-flash" },
        timestamp: "2026-10-04T06:39:47Z",
      },
    ];
    render(<MessageList messages={messages} isGenerating={false} readOnly />);

    expect(screen.getByText("The provider's safety filter blocked this reply (OTHER).")).toBeTruthy();
    expect(screen.queryByText(/reasoning only/)).toBeNull();
    expect(screen.queryByText(/Reasoning preserved/)).toBeNull();
  });
});
