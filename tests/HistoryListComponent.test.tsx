import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock CSS Modules
vi.mock(
  "../src/components/HistoryListComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

import type { FilterGroup } from "../src/components/FilterDropdownComponent";

// Mock components-library SearchInputComponent
vi.mock("@rodrigo-barraza/components-library", () => ({
  SearchInputComponent: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (nextValue: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// Mock HistoryItemComponent for simplified assertion
vi.mock(
  "../src/components/HistoryItemComponent",
  () => ({
    default: ({
      item,
      subAgentNumber,
      hasSpawnedSubAgents,
    }: {
      item: {
        id: string;
        title?: string;
        parentConversationId?: string | null;
      };
      subAgentNumber?: number | null;
      hasSpawnedSubAgents?: boolean;
    }) => (
      <div
        data-testid="history-item"
        data-id={item.id}
        data-parent-id={item.parentConversationId || ""}
        data-subagent-number={subAgentNumber || ""}
        data-has-spawned={hasSpawnedSubAgents ? "true" : "false"}
      >
        {item.title}
      </div>
    ),
  }),
);

// Mock FilterDropdownComponent to expose toggles
vi.mock(
  "../src/components/FilterDropdownComponent",
  () => ({
    default: ({ groups }: { groups: FilterGroup[] }) => (
      <div data-testid="filter-dropdown">
        {groups.map((group) => (
          <div key={group.label} data-testid={`group-${group.label.toLowerCase()}`}>
            {group.items.map((item) => (
              <button
                key={item.key}
                data-testid={`filter-button-${item.key}`}
                onClick={() => {
                  if (group.onToggle) {
                    group.onToggle(item.key);
                  }
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    ),
  }),
);

import HistoryListComponent from "../src/components/HistoryListComponent";

// Minimal mockup of items
const mockItems = [
  {
    id: "parent-1",
    title: "Parent Conversation 1",
    createdAt: "2026-06-19T10:00:00Z",
    updatedAt: "2026-06-19T10:05:00Z",
  },
  {
    id: "sub-1-1",
    title: "Sub-agent 1 for Parent 1",
    parentConversationId: "parent-1",
    createdAt: "2026-06-19T10:01:00Z",
    updatedAt: "2026-06-19T10:02:00Z",
  },
  {
    id: "sub-1-2",
    title: "Sub-agent 2 for Parent 1",
    parentConversationId: "parent-1",
    createdAt: "2026-06-19T10:03:00Z",
    updatedAt: "2026-06-19T10:04:00Z",
  },
  {
    id: "orphan-sub",
    title: "Orphaned Sub-agent",
    parentConversationId: "non-existent-parent",
    createdAt: "2026-06-19T09:00:00Z",
    updatedAt: "2026-06-19T09:05:00Z",
  },
  {
    id: "standalone-1",
    title: "Standalone Conversation 1",
    createdAt: "2026-06-19T08:00:00Z",
    updatedAt: "2026-06-19T08:05:00Z",
  },
];

describe("HistoryListComponent - Sub-Agent Grouping", () => {
  it("should group sub-agents hierarchically inside an agent-cluster-group element under their parent", () => {
    const { container } = render(
      <HistoryListComponent items={mockItems} />
    );

    // Verify parent has DNA icon and children have correct sub-agent index numbers
    const parentItem = container.querySelector("[data-id='parent-1']");
    expect(parentItem).toBeTruthy();
    expect(parentItem?.getAttribute("data-has-spawned")).toBe("true");

    const subItem1 = container.querySelector("[data-id='sub-1-1']");
    const subItem2 = container.querySelector("[data-id='sub-1-2']");
    expect(subItem1?.getAttribute("data-subagent-number")).toBe("1");
    expect(subItem2?.getAttribute("data-subagent-number")).toBe("2");

    // Check that parent + sub-agents are packaged within a single agent-cluster-group container
    const clusters = container.querySelectorAll(".agent-cluster-group");
    expect(clusters.length).toBe(1);

    const cluster = clusters[0];
    const clusteredItems = cluster.querySelectorAll("[data-testid='history-item']");
    expect(clusteredItems.length).toBe(3);
    expect(clusteredItems[0].getAttribute("data-id")).toBe("parent-1");
    expect(clusteredItems[1].getAttribute("data-id")).toBe("sub-1-1");
    expect(clusteredItems[2].getAttribute("data-id")).toBe("sub-1-2");
  });

  it("should render orphaned sub-agents as standalone items preserving chronological sorted list position", () => {
    const { container } = render(
      <HistoryListComponent items={mockItems} />
    );

    // In mockItems, the items have the following dates (descending):
    // parent-1 (10:05), sub-1-2 (10:04), sub-1-1 (10:02), orphan-sub (09:05), standalone-1 (08:05)
    // Standalone sorted order should be:
    // 1. Group parent-1 (containing parent-1, sub-1-1, sub-1-2)
    // 2. orphan-sub (09:05)
    // 3. standalone-1 (08:05)

    const listElement = container.querySelector(".list");
    expect(listElement).toBeTruthy();

    const directChildren = listElement?.children;
    // Expected children elements of the list wrapper:
    // Index 0: .agent-cluster-group
    // Index 1: history item orphan-sub
    // Index 2: history item standalone-1
    expect(directChildren?.length).toBe(3);

    expect(directChildren?.[0].className).toBe("agent-cluster-group");
    expect(directChildren?.[1].getAttribute("data-id")).toBe("orphan-sub");
    expect(directChildren?.[2].getAttribute("data-id")).toBe("standalone-1");
  });

  it("should hide sub-agents when the 'Hide Sub-Agents' filter is toggled", () => {
    render(<HistoryListComponent items={mockItems} />);

    // Toggle "Hide Sub-Agents" filter
    const toggleButton = screen.getByTestId("filter-button-hide-subagents");
    expect(toggleButton).toBeTruthy();

    fireEvent.click(toggleButton);

    // Once sub-agents are hidden:
    // - sub-1-1, sub-1-2, and orphan-sub should not be rendered
    // - parent-1 and standalone-1 should be rendered as standalone items
    const renderedItems = screen.getAllByTestId("history-item");
    const renderedIds = renderedItems.map((el) => el.getAttribute("data-id"));

    expect(renderedIds).toContain("parent-1");
    expect(renderedIds).toContain("standalone-1");
    expect(renderedIds).not.toContain("sub-1-1");
    expect(renderedIds).not.toContain("sub-1-2");
    expect(renderedIds).not.toContain("orphan-sub");
  });
});
