import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import SubAgentsPanelComponent from "../SubAgentsPanelComponent";
import PrismService from "../../services/PrismService";
import type { CoordinatorSubAgent } from "../../types/types";

vi.mock("../SubAgentsPanelComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

// Buttons render as plain <button>s labelled by their title.
vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ onClick, disabled, title }: { onClick?: () => void; disabled?: boolean; title?: string }) => (
    <button onClick={onClick} disabled={disabled} aria-label={title}>
      {title}
    </button>
  ),
}));

vi.mock("../ModalityIconComponent", () => ({ default: () => null }));
vi.mock("../BadgeComponent", () => ({ default: () => null }));
vi.mock("../PanelLoadingSpinnerComponent", () => ({ default: () => <div>Loading…</div> }));

vi.mock("../../services/PrismService", () => ({
  default: {
    getCoordinatorSubAgents: vi.fn(),
    stopCoordinatorSubAgent: vi.fn(),
  },
}));

function subAgent(agentId: string, status: string): CoordinatorSubAgent {
  return {
    id: agentId,
    agentId,
    agentConversationId: "parent-conv",
    subAgentConversationId: `conversation-of-${agentId}`,
    status,
    description: `Researcher ${agentId}`,
  };
}

describe("SubAgentsPanelComponent — stop one sub-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PrismService.getCoordinatorSubAgents).mockResolvedValue({
      subAgents: [subAgent("agent-1", "running"), subAgent("agent-2", "running"), subAgent("agent-3", "complete")],
    });
    vi.mocked(PrismService.stopCoordinatorSubAgent).mockResolvedValue({ agent_id: "agent-1", status: "stopped" });
  });

  it("offers Stop on running rows only", async () => {
    render(<SubAgentsPanelComponent conversationId="parent-conv" />);
    await screen.findByText("Researcher agent-1");

    expect(screen.getAllByRole("button", { name: "Stop this sub-agent" })).toHaveLength(2);
  });

  it("stops exactly the clicked agent, then refreshes the list", async () => {
    render(<SubAgentsPanelComponent conversationId="parent-conv" />);
    await screen.findByText("Researcher agent-1");
    expect(PrismService.getCoordinatorSubAgents).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Stop this sub-agent" })[0]);

    await waitFor(() => expect(PrismService.stopCoordinatorSubAgent).toHaveBeenCalledTimes(1));
    expect(PrismService.stopCoordinatorSubAgent).toHaveBeenCalledWith("agent-1");
    await waitFor(() => expect(PrismService.getCoordinatorSubAgents).toHaveBeenCalledTimes(2));
  });

  it("still refreshes when the agent had already finished (409)", async () => {
    vi.mocked(PrismService.stopCoordinatorSubAgent).mockRejectedValue(
      Object.assign(new Error("Sub-agent is complete, not running"), { status: 409 }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SubAgentsPanelComponent conversationId="parent-conv" />);
    await screen.findByText("Researcher agent-1");

    fireEvent.click(screen.getAllByRole("button", { name: "Stop this sub-agent" })[1]);

    await waitFor(() => expect(PrismService.getCoordinatorSubAgents).toHaveBeenCalledTimes(2));
    expect(PrismService.stopCoordinatorSubAgent).toHaveBeenCalledWith("agent-2");
    consoleError.mockRestore();
  });
});
