/**
 * ChatConversationGraphComponent.test.tsx
 *
 * The Nodes view mounted over a fixed graph state (the parent-owned
 * `graphState` path both chat mount points use):
 *  - two instances (sidebar + main view) never share an SVG id — the
 *    old markers/filters were global ids, resolved to whichever came first,
 *  - the wheel listener is non-passive, so zooming cannot scroll the page,
 *  - selecting a request fetches its payloads ONCE: graph mutations (drag
 *    and settle frames) used to refetch and collapse the open sections,
 *  - Escape closes the panel; failed/pending requests carry their badges;
 *    light canvases skip the (invisible there) starfield.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GraphData, GraphNode } from "@rodrigo-barraza/utilities-library/graph";

const iris = vi.hoisted(() => ({ getRequest: vi.fn() }));
vi.mock("../../services/IrisService", () => ({ default: iris }));
vi.mock("../../services/PrismService", () => ({ default: { getBuiltInToolSchemas: vi.fn().mockResolvedValue([]) } }));

import ChatConversationGraphComponent from "../ChatConversationGraphComponent";
import type { ConversationGraphDataState } from "../../hooks/useConversationGraphData";

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeNode(id: string, category: GraphNode["category"], x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, category, radius: 24, x, y, velocityX: 0, velocityY: 0, ...extra };
}

function fixtureGraph(): GraphData {
  return {
    nodes: [
      makeNode("session:s", "session", 320, 80, { label: "Refactor auth" }),
      makeNode("agent:root", "agent", 560, 80, { depth: 0 }),
      makeNode("request:r1", "request", 800, 80, { sequenceNumber: 1, metadata: { agentDepth: 0, requestId: "req-1", status: "completed", success: true, operation: "agent:iteration" } }),
      makeNode("request:r2", "request", 800, 160, { sequenceNumber: 2, metadata: { agentDepth: 0, requestId: "req-2", status: "completed", success: false, errorMessage: "400 invalid_request", operation: "agent:iteration" } }),
      makeNode("request:r3", "request", 800, 240, { sequenceNumber: 3, metadata: { agentDepth: 0, requestId: "req-3", status: "pending", success: null, operation: "agent:iteration" } }),
    ],
    edges: [
      { source: "session:s", target: "agent:root" },
      { source: "agent:root", target: "request:r1" },
      { source: "request:r1", target: "request:r2" },
      { source: "request:r2", target: "request:r3" },
    ],
    subAgentTree: [],
  };
}

let setGraphFromTest: Dispatch<SetStateAction<GraphData | null>> = () => {};

function useFixtureGraphState(): ConversationGraphDataState {
  const [graphData, setGraphData] = useState<GraphData | null>(fixtureGraph);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(new Set());
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(new Set());
  useEffect(() => { setGraphFromTest = setGraphData; }, []);
  return {
    conversation: null,
    conversationStats: null,
    conversationRequests: [],
    graphData,
    setGraphData,
    isLoading: false,
    isLiveConnected: true,
    enteringNodeIds,
    setEnteringNodeIds,
    toolEmojiMap: new Map(),
    nodesRef: useRef(graphData?.nodes ?? []),
    graphDataRef: useRef(graphData),
    draggedNodeIdRef: useRef<string | null>(null),
    collisionOwnerRef: useRef<symbol | null>(null),
    pinnedNodeIds,
    setPinnedNodeIds,
    restoreServerLayout: () => {},
  };
}

function Host({ instances = 1 }: { instances?: number }) {
  const graphState = useFixtureGraphState();
  return (
    <>
      {Array.from({ length: instances }, (_, instanceIndex) => (
        <ChatConversationGraphComponent key={instanceIndex} conversationId="conv-1" graphState={graphState} compact={instanceIndex > 0} />
      ))}
    </>
  );
}

function nodeGroup(container: HTMLElement, nodeId: string): Element {
  return container.querySelector(`[data-node-identifier="${nodeId}"]`)!;
}

function clickNode(container: HTMLElement, nodeId: string) {
  const group = nodeGroup(container, nodeId);
  fireEvent.pointerDown(group, { pointerId: 1, button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
  fireEvent.pointerUp(group, { pointerId: 1, button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  iris.getRequest.mockReset();
  iris.getRequest.mockResolvedValue({ _id: "req-1", requestPayload: { messages: [] }, responsePayload: { text: "done" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--calculated-background-base-contrast");
});

describe("ChatConversationGraphComponent", () => {
  it("renders every node and edge, with no SVG id shared between two mounted instances", () => {
    const { container } = render(<Host instances={2} />);
    const graphs = container.querySelectorAll("svg");
    expect(graphs.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-node-identifier="request:r1"]')).toHaveLength(2);

    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    // Every url(#…) reference resolves inside the same document.
    for (const element of container.querySelectorAll("[marker-end]")) {
      const referenced = element.getAttribute("marker-end")!.match(/url\(#(.+)\)/)![1];
      expect(document.getElementById(referenced), referenced).not.toBeNull();
    }
  });

  it("zooms on the wheel without letting the page scroll", () => {
    render(<Host />);
    const canvas = screen.getByRole("application");
    const zoomReadout = () => screen.getByRole("button", { name: /^Zoom \d+ percent/ }).textContent;
    const before = zoomReadout();

    const wheel = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    act(() => { canvas.dispatchEvent(wheel); });

    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomReadout()).not.toBe(before);
  });

  it("fetches a selected request's payloads once, however often the graph changes", async () => {
    const { container } = render(<Host />);
    clickNode(container, "request:r1");

    expect(await screen.findByRole("complementary", { name: "Request details" })).toBeInTheDocument();
    expect(iris.getRequest).toHaveBeenCalledTimes(1);
    expect(iris.getRequest).toHaveBeenCalledWith("req-1");

    // Drag and settle frames rewrite node positions many times a second.
    for (let frame = 0; frame < 5; frame++) {
      act(() => {
        setGraphFromTest((previous) => previous && {
          ...previous,
          nodes: previous.nodes.map((node) => (node.id === "request:r3" ? { ...node, x: node.x + 10 } : node)),
        });
      });
    }
    expect(iris.getRequest).toHaveBeenCalledTimes(1);
  });

  it("closes the detail panel on Escape", async () => {
    const { container } = render(<Host />);
    clickNode(container, "request:r1");
    await screen.findByRole("complementary", { name: "Request details" });

    fireEvent.keyDown(screen.getByRole("application"), { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Request details" })).toBeNull();
  });

  it("shows why a failed request failed and marks the running one", async () => {
    const { container } = render(<Host />);
    expect(nodeGroup(container, "request:r2").querySelector(".node-failed-badge")).not.toBeNull();
    expect(nodeGroup(container, "request:r3").querySelector(".node-spinner")).not.toBeNull();
    expect(nodeGroup(container, "request:r1").querySelector(".node-failed-badge")).toBeNull();

    clickNode(container, "request:r2");
    const panel = await screen.findByRole("complementary", { name: "Request details" });
    expect(within(panel).getByText("400 invalid_request")).toBeInTheDocument();
    expect(within(panel).getByText("failed")).toBeInTheDocument();
    expect(iris.getRequest).toHaveBeenCalledWith("req-2");

    // A running request has no payloads yet — nothing to fetch.
    clickNode(container, "request:r3");
    await screen.findByText("running");
    expect(iris.getRequest).not.toHaveBeenCalledWith("req-3");
  });

  it("selects the conversation first on an arrow key, then walks the graph", () => {
    render(<Host />);
    const canvas = screen.getByRole("application");
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(screen.getByRole("complementary", { name: "Conversation details" })).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(screen.getByRole("complementary", { name: "Agent details" })).toBeInTheDocument();
  });

  it("skips the starfield on a light canvas", () => {
    const dark = render(<Host />);
    expect(dark.container.querySelector("canvas")).not.toBeNull();
    dark.unmount();

    document.documentElement.style.setProperty("--calculated-background-base-contrast", "oklch(0 0 0 / 0.87)");
    const light = render(<Host />);
    expect(light.container.querySelector("canvas")).toBeNull();
  });
});
