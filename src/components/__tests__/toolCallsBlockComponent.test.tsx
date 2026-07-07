import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// Mock CSS Modules
vi.mock(
  "../ToolCallsBlockComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

vi.mock(
  "../ToolResultRenderers/ToolResultRenderersComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => ({
  ChevronDown: ({ size }: { size: number }) => <span data-testid="chevron-down" data-size={size} />,
  ChevronRight: ({ size }: { size: number }) => <span data-testid="chevron-right" data-size={size} />,
  Check: ({ size }: { size: number }) => <span data-testid="check" data-size={size} />,
  Zap: ({ size }: { size: number }) => <span data-testid="zap" data-size={size} />,
  AlertTriangle: ({ size }: { size: number }) => <span data-testid="alert-triangle" data-size={size} />,
  Loader: ({ size, className }: { size: number; className?: string }) => (
    <span data-testid="loader" data-size={size} className={className} />
  ),
}));

// Mock WorkflowNodeConstantsComponent
vi.mock("../WorkflowNodeConstantsComponent", () => ({
  TOOL_EMOJI_MAP: {},
  resolveToolVisuals: () => ({
    Icon: ({ size }: { size: number }) => <span data-testid="tool-icon" data-size={size} />,
    color: "#ff9900",
    emoji: "🛠️",
  }),
  resolveToolEmoji: (name: string) => "🛠️",
  isEmojiImageUrl: (emoji: string) => typeof emoji === "string" && emoji.startsWith("http"),
  hydrateToolEmojiCache: vi.fn(),
}));

// Mock ToolResultRenderers
vi.mock("../ToolResultRenderers", () => ({
  ToolResultView: () => <div data-testid="tool-result-view" />,
}));

// Mock ToolBadgeComponent
vi.mock("../ToolBadgeComponent", () => ({
  ToolBadgeRow: () => <div data-testid="tool-badge-row" />,
}));

// Mock utilities-library
vi.mock("@rodrigo-barraza/utilities-library", () => ({
  renderToolName: (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
  formatLatencyMilliseconds: (milliseconds: number) => `${milliseconds}ms`,
}));

vi.mock("@rodrigo-barraza/utilities-library/taxonomy", () => ({
  TOOL_NAMES: {
    CREATE_SUBAGENTS: "create_subagents",
    GOOGLE_SEARCH: "google_search",
  },
}));

import ToolCallsBlockComponent from "../ToolCallsBlockComponent";
import type { ToolCallEvent } from "../../types/types";
import type { SubAgentToolActivityItem } from "../MessageListComponent";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function makeToolCall(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: "tc-1",
    name: "read_file",
    args: {},
    status: "done",
    ...overrides,
  };
}

function makeCreateTeamToolCall(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: "tc-team-1",
    name: "create_subagents",
    args: {
      members: [
        { description: "Manager 1: Benchmarking 300,000 and 400,000 rows" },
        { description: "Manager 2: Benchmarking 500,000 and 600,000 rows" },
      ],
    },
    status: "done",
    result: JSON.stringify([
      { agent_id: "agent-1", description: "Manager 1", toolUses: 5 },
      { agent_id: "agent-2", description: "Manager 2", toolUses: 3 },
    ]),
    ...overrides,
  };
}

function isBlockExpanded(): boolean {
  const disclosure = document.querySelector(".tool-calls-disclosure");
  if (!disclosure) throw new Error("Disclosure element not found");
  return !disclosure.classList.contains("tool-calls-disclosure-collapsed");
}

function isBlockCollapsed(): boolean {
  return !isBlockExpanded();
}

function hasStreamingClass(): boolean {
  const block = document.querySelector(".tool-calls-block-component");
  if (!block) throw new Error("Block element not found");
  return block.classList.contains("tool-calls-streaming");
}

function getHeaderText(): string {
  const button = document.querySelector("button");
  if (!button) throw new Error("Toggle button not found");
  return button.textContent || "";
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("ToolCallsBlockComponent", () => {

  describe("baseline collapse/expand behavior", () => {
    it("renders collapsed when tool call is done", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({ status: "done" })}
        />,
      );
      expect(isBlockCollapsed()).toBe(true);
      expect(getHeaderText()).toContain("Read File");
    });

    it("renders expanded when a tool call is actively calling", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({ status: "calling" })}
        />,
      );
      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
      expect(getHeaderText()).toContain("Calling");
    });

    it("renders expanded when a tool call is streaming", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({ status: "streaming" })}
        />,
      );
      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });

    it("can be manually toggled open and closed", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({ status: "done" })}
        />,
      );
      expect(isBlockCollapsed()).toBe(true);

      // Click to open
      fireEvent.click(screen.getByRole("button"));
      expect(isBlockExpanded()).toBe(true);

      // Click to close
      fireEvent.click(screen.getByRole("button"));
      expect(isBlockCollapsed()).toBe(true);
    });
  });

  describe("create_subagents with sub-agents still running (raw array result)", () => {
    it("stays expanded when sub-agents have phase=generating", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "generating", currentTool: null, description: "Manager 1" },
        "agent-2": { phase: "generating", currentTool: null, description: "Manager 2" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
      expect(getHeaderText()).toContain("Calling");
    });

    it("stays expanded when sub-agents have phase=thinking", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "thinking", currentTool: null, description: "Manager 1" },
        "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });

    it("stays expanded when sub-agents have currentTool set", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "generating", currentTool: "read_file", description: "Manager 1" },
        "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });

    it("collapses when all sub-agents are done", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
        "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockCollapsed()).toBe(true);
      expect(hasStreamingClass()).toBe(false);
      expect(getHeaderText()).toContain("Create Subagents");
    });
  });

  describe("create_subagents with { members: [...] } result format", () => {
    it("stays expanded when sub-agents have phase=generating (object result)", () => {
      const objectResult = JSON.stringify({
        members: [
          { agent_id: "agent-1", description: "Manager 1", toolUses: 5 },
          { agent_id: "agent-2", description: "Manager 2", toolUses: 3 },
        ],
      });

      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "generating", currentTool: null, description: "Manager 1" },
        "agent-2": { phase: "generating", currentTool: null, description: "Manager 2" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done", result: objectResult })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });
  });

  describe("create_subagents with no result yet (calling state, description fallback)", () => {
    it("stays expanded when sub-agents matched by description are generating", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "unknown-id-1": {
          phase: "generating",
          currentTool: "run_command",
          description: "Manager 1: Benchmarking 300,000 and 400,000 rows",
        },
        "unknown-id-2": {
          phase: "thinking",
          currentTool: null,
          description: "Manager 2: Benchmarking 500,000 and 600,000 rows",
        },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "calling", result: undefined })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      // The tool call itself is "calling", so isCalling is true — block must be expanded
      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });

    it("stays expanded via description fallback even when tool status is done but no result", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "unknown-id-1": {
          phase: "generating",
          currentTool: null,
          description: "Manager 1: Benchmarking 300,000 and 400,000 rows",
        },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done", result: undefined })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });
  });

  describe("reactive state transitions", () => {
    it("expands when sub-agents become active after initial render", () => {
      const { rerender } = render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={{}}
        />,
      );

      // Initially collapsed — no activity
      expect(isBlockCollapsed()).toBe(true);

      // Sub-agents start reporting activity
      act(() => {
        rerender(
          <ToolCallsBlockComponent
            toolCall={makeCreateTeamToolCall({ status: "done" })}
            subAgentToolActivity={{
              "agent-1": { phase: "generating", currentTool: null, description: "Manager 1" },
            }}
          />,
        );
      });

      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(true);
    });

    it("stays expanded when sub-agents finish (does NOT auto-collapse)", () => {
      const { rerender } = render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={{
            "agent-1": { phase: "generating", currentTool: "read_file", description: "Manager 1" },
          }}
        />,
      );

      // Active — block is open
      expect(isBlockExpanded()).toBe(true);

      // Sub-agents finish
      act(() => {
        rerender(
          <ToolCallsBlockComponent
            toolCall={makeCreateTeamToolCall({ status: "done" })}
            subAgentToolActivity={{
              "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
            }}
          />,
        );
      });

      // The block stays expanded — only isAutoCollapsed or manual toggle collapses it
      expect(isBlockExpanded()).toBe(true);
      expect(hasStreamingClass()).toBe(false);
    });
  });

  describe("isAutoCollapsed interactions", () => {
    it("does NOT auto-collapse when sub-agents are still active", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "generating", currentTool: null, description: "Manager 1" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
          isAutoCollapsed={true}
        />,
      );

      // Should remain expanded despite isAutoCollapsed=true
      expect(isBlockExpanded()).toBe(true);
    });

    it("auto-collapses when sub-agents are finished and isAutoCollapsed is true", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({ status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
          isAutoCollapsed={true}
        />,
      );

      expect(isBlockCollapsed()).toBe(true);
    });
  });

  describe("non-create_subagents tool calls are unaffected", () => {
    it("collapses normally even with subAgentToolActivity present", () => {
      const subAgentToolActivity: Record<string, SubAgentToolActivityItem> = {
        "agent-1": { phase: "generating", currentTool: "read_file", description: "Manager 1" },
      };

      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({ name: "read_file", status: "done" })}
          subAgentToolActivity={subAgentToolActivity}
        />,
      );

      // Non-create_subagents tool calls should not care about subAgentToolActivity
      expect(isBlockCollapsed()).toBe(true);
    });
  });

  describe("subagent wall-clock duration capture", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows wall-clock duration instead of dispatch durationMs when subagents finish", () => {
      const toolCallTimestamp = Date.now();
      const dispatchDurationMs = 150; // Server reports < 1 second dispatch time

      const { rerender } = render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({
            status: "done",
            timestamp: toolCallTimestamp,
            durationMs: dispatchDurationMs,
          })}
          subAgentToolActivity={{
            "agent-1": { phase: "generating", currentTool: "read_file", description: "Manager 1" },
            "agent-2": { phase: "generating", currentTool: null, description: "Manager 2" },
          }}
        />,
      );

      // Block is active because subagents are running
      expect(isBlockExpanded()).toBe(true);
      expect(getHeaderText()).toContain("Calling");

      // Advance time by 15 seconds (simulating subagent execution time)
      act(() => {
        vi.advanceTimersByTime(15000);
      });

      // Subagents complete
      act(() => {
        rerender(
          <ToolCallsBlockComponent
            toolCall={makeCreateTeamToolCall({
              status: "done",
              timestamp: toolCallTimestamp,
              durationMs: dispatchDurationMs,
            })}
            subAgentToolActivity={{
              "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
              "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
            }}
          />,
        );
      });

      // Should show ~15 seconds, NOT "<1 second" from the dispatch durationMs
      const headerText = getHeaderText();
      expect(headerText).toContain("15 seconds");
      expect(headerText).not.toContain("<1 second");
    });

    it("uses toolCall.durationMs for non-subagent tools", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeToolCall({
            name: "read_file",
            status: "done",
            durationMs: 2500,
          })}
        />,
      );

      // Non-subagent tools should use durationMs directly
      expect(getHeaderText()).toContain("3 seconds");
    });

    it("falls back to toolCall.durationMs for subagent tools loaded from history (no active transition)", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({
            status: "done",
            durationMs: 400,
          })}
          subAgentToolActivity={{
            "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
            "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
          }}
        />,
      );

      // When loaded from history (no active→inactive transition observed),
      // and members have no durationMilliseconds, falls back to toolCall.durationMs
      // (400ms rounds to 0s → "<1 second")
      expect(getHeaderText()).toContain("<1 second");
    });

    it("derives wall-clock duration from member durationMilliseconds for persisted subagent tools", () => {
      render(
        <ToolCallsBlockComponent
          toolCall={makeCreateTeamToolCall({
            status: "done",
            durationMs: 400,
            result: JSON.stringify([
              { agent_id: "agent-1", description: "Manager 1", toolUses: 5, durationMilliseconds: 45000 },
              { agent_id: "agent-2", description: "Manager 2", toolUses: 3, durationMilliseconds: 52000 },
            ]),
          })}
          subAgentToolActivity={{
            "agent-1": { phase: "complete", currentTool: null, description: "Manager 1" },
            "agent-2": { phase: "complete", currentTool: null, description: "Manager 2" },
          }}
        />,
      );

      // Members run in parallel, so the wall-clock duration is the max (52s),
      // overriding the instant dispatch durationMs (400ms)
      expect(getHeaderText()).toContain("52 seconds");
    });
  });
});
