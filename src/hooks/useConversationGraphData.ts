"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import IrisService, {
  type IrisRequestEntry,
  type IrisCollectionChangeEvent,
} from "../services/IrisService";
import PrismService from "../services/PrismService";
import { EXECUTION_STATUS, LAYOUT, TIMING } from "../constants";
import type { AgentConversation, ConversationStats, ToolSchema } from "../types/types";
import type { GraphData, GraphNode, GraphEdge } from "@rodrigo-barraza/utilities-library/graph";
import { COLLECTIONS } from "@rodrigo-barraza/utilities-library/taxonomy";
import {
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  PROACTIVE_PENDING_TURN_NODE_ID,
} from "../utils/conversationGraphModel";

/* ═══════════════════════════════════════════════════════════════════
   Pending-chain helpers
   ═══════════════════════════════════════════════════════════════════ */

/** True when any real request node exists that was NOT part of the baseline
    snapshot taken at generation start — i.e. it arrived during the current
    generation cycle. */
export function hasNewRequestNodesSince(nodes: GraphNode[], baselineRequestNodeIds: Set<string>): boolean {
  return nodes.some(
    (node) =>
      node.category === "request" &&
      node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID &&
      !baselineRequestNodeIds.has(node.id),
  );
}

/** Builds the proactive pending nodes/edges (optionally with a turn boundary
    node ahead of the pending request) without mutating the given graph.

    The chain always hangs off the MAIN agent chain (agentDepth 0) — sub-agent
    requests can hold the highest global sequence number while an orchestrator
    is running, but the next turn/request belongs to the root agent. */
export function buildPendingChainAdditions(
  graph: GraphData,
  includeTurnNode: boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const realRequestNodes = graph.nodes.filter(
    (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
  );
  const nextSequenceNumber = realRequestNodes.length > 0
    ? Math.max(...realRequestNodes.map((node) => node.sequenceNumber ?? 0)) + 1
    : 1;

  const lastMainChainRequest = realRequestNodes
    .filter((node) => ((node.metadata?.agentDepth as number) ?? 0) === 0)
    .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
    .at(-1);

  const realTurnNodes = graph.nodes.filter(
    (node) => node.category === "turn" && node.id !== PROACTIVE_PENDING_TURN_NODE_ID,
  );

  // Prefer a trailing turn node that has no request children yet as the tail
  let chainTail: GraphNode | undefined = lastMainChainRequest;
  const lastTurnNode = realTurnNodes.at(-1);
  if (lastTurnNode) {
    const turnHasRequestChild = graph.edges.some(
      (edge) => edge.source === lastTurnNode.id && graph.nodes.some(
        (node) => node.id === edge.target && node.category === "request",
      ),
    );
    if (!turnHasRequestChild) chainTail = lastTurnNode;
  }

  const agentNode = graph.nodes.find((node) => node.category === "agent");
  const anchorX = chainTail?.x ?? (agentNode?.x ?? LAYOUT.DEFAULT_NODE_X) + LAYOUT.NODE_SPACING_X;
  const anchorY = chainTail ? chainTail.y + LAYOUT.NODE_SPACING_Y : (agentNode?.y ?? LAYOUT.DEFAULT_NODE_Y);

  const additionNodes: GraphNode[] = [];
  const additionEdges: GraphEdge[] = [];

  let pendingParentId: string | null = chainTail?.id ?? agentNode?.id ?? null;
  let pendingY = anchorY;

  if (includeTurnNode) {
    const nextTurnIndex = realTurnNodes.length;
    additionNodes.push({
      id: PROACTIVE_PENDING_TURN_NODE_ID,
      label: `Turn ${nextTurnIndex + 1}`,
      category: "turn",
      radius: LAYOUT.NODE_RADIUS,
      x: anchorX,
      y: anchorY,
      velocityX: 0,
      velocityY: 0,
      metadata: { turnIndex: nextTurnIndex },
    });
    if (pendingParentId) {
      additionEdges.push({ source: pendingParentId, target: PROACTIVE_PENDING_TURN_NODE_ID, strength: 0.5 });
    }
    pendingParentId = PROACTIVE_PENDING_TURN_NODE_ID;
    pendingY = anchorY + LAYOUT.NODE_SPACING_Y;
  }

  additionNodes.push({
    id: PROACTIVE_PENDING_REQUEST_NODE_ID,
    label: `#${nextSequenceNumber} pending`,
    category: "request",
    radius: LAYOUT.NODE_RADIUS,
    x: anchorX,
    y: pendingY,
    velocityX: 0,
    velocityY: 0,
    sequenceNumber: nextSequenceNumber,
    metadata: { operation: EXECUTION_STATUS.PENDING, status: EXECUTION_STATUS.PENDING },
  });
  if (pendingParentId) {
    additionEdges.push({ source: pendingParentId, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
  }

  return { nodes: additionNodes, edges: additionEdges };
}

/** Fingerprint capturing the request set AND per-request state that affects
    graph rendering (status transitions, tool call counts) — so the polling
    fallback rebuilds on content changes, not just count changes. */
function computeRequestsFingerprint(requests: IrisRequestEntry[]): string {
  return requests
    .map((request) => `${request._id}:${String(request.status ?? "")}:${request.toolApiNames?.length ?? 0}:${String(request.success ?? "")}`)
    .join("|");
}

/** FNV-1a of the requests fingerprint — the `v` the graph endpoint keys its
    cache on. The request COUNT alone does not change when a pending
    request completes or fails, so a rebuild inside the server's TTL was
    served the pending graph. */
export function graphContentVersion(requests: IrisRequestEntry[]): string {
  const fingerprint = computeRequestsFingerprint(requests);
  let hash = 0x811c9dc5;
  for (let index = 0; index < fingerprint.length; index++) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${requests.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/** Cache-busting version for a first load: the rows are fetched in
    parallel with the graph, so there is no fingerprint yet. */
function freshLoadVersion(): string {
  return `load-${Date.now().toString(36)}`;
}

// Tool emojis are cosmetic and identical for every graph — one fetch per
// page, shared by every mounted instance (the sidebar and main view each
// fetched their own, plus one per no-op hook).
let toolEmojiMapPromise: Promise<Map<string, string>> | null = null;

function loadToolEmojiMap(): Promise<Map<string, string>> {
  toolEmojiMapPromise ??= PrismService.getBuiltInToolSchemas()
    .then((toolSchemas: ToolSchema[]) => {
      const emojiMap = new Map<string, string>();
      for (const toolSchema of toolSchemas) {
        if (!toolSchema.emoji) continue;
        const resolvedEmoji = Array.isArray(toolSchema.emoji) ? toolSchema.emoji[0] : toolSchema.emoji;
        if (resolvedEmoji) emojiMap.set(toolSchema.name, resolvedEmoji);
      }
      return emojiMap;
    })
    .catch(() => {
      toolEmojiMapPromise = null;
      return new Map<string, string>();
    });
  return toolEmojiMapPromise;
}

/* ═══════════════════════════════════════════════════════════════════
   Canonical layout dimensions
   ═══════════════════════════════════════════════════════════════════
   Node positions are computed once using these canonical dimensions.
   Each rendering instance applies its own viewport transform (zoom +
   pan — see useGraphViewport / fitViewport) to map these positions onto
   its actual canvas size. This decouples data/layout from viewport. */
const CANONICAL_LAYOUT_WIDTH = LAYOUT.CANONICAL_WIDTH;
const CANONICAL_LAYOUT_HEIGHT = LAYOUT.CANONICAL_HEIGHT;

/* ═══════════════════════════════════════════════════════════════════
   Public interface
   ═══════════════════════════════════════════════════════════════════ */

export interface ConversationGraphDataState {
  conversation: AgentConversation | null;
  conversationStats: ConversationStats | null;
  conversationRequests: IrisRequestEntry[];
  graphData: GraphData | null;
  setGraphData: Dispatch<SetStateAction<GraphData | null>>;
  isLoading: boolean;
  isLiveConnected: boolean;
  enteringNodeIds: Set<string>;
  setEnteringNodeIds: Dispatch<SetStateAction<Set<string>>>;
  toolEmojiMap: Map<string, string>;
  nodesRef: MutableRefObject<GraphNode[]>;
  graphDataRef: MutableRefObject<GraphData | null>;
  /** Node being dragged in ANY rendering instance sharing this state, so
      concurrent collision loops never fight over a pinned node. */
  draggedNodeIdRef: MutableRefObject<string | null>;
  /** Rendering instance that currently owns the collision-settlement loop —
      prevents two mounted instances from applying pushes twice per frame. */
  collisionOwnerRef: MutableRefObject<symbol | null>;
  /** Nodes the user dragged. A rebuild keeps their positions; every other
      node takes the server layout (and glides there). */
  pinnedNodeIds: Set<string>;
  setPinnedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  /** Releases every pinned node back to its server position. */
  restoreServerLayout: () => void;
}

/* ═══════════════════════════════════════════════════════════════════
   Hook
   ═══════════════════════════════════════════════════════════════════ */

export default function useConversationGraphData(
  conversationId: string | null,
  isGenerating: boolean,
): ConversationGraphDataState {
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
  const [conversationRequests, setConversationRequests] = useState<IrisRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(new Set());
  const [toolEmojiMap, setToolEmojiMap] = useState<Map<string, string>>(new Map());
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(new Set());

  // A switch drops the previous conversation's state DURING render, so no
  // frame ever pairs the new conversation id with the old graph (an effect
  // runs after paint: the old graph flashed, and the canvas took it as the
  // new conversation's first frame).
  const [servedConversationId, setServedConversationId] = useState(conversationId);
  if (servedConversationId !== conversationId) {
    setServedConversationId(conversationId);
    setConversation(null);
    setConversationStats(null);
    setConversationRequests([]);
    setGraphData(null);
    setPinnedNodeIds(new Set());
    setEnteringNodeIds(new Set());
    setIsLoading(conversationId !== null);
  }

  const conversationRef = useRef<AgentConversation | null>(null);
  const conversationRequestsRef = useRef<IrisRequestEntry[]>([]);
  const conversationStatsRef = useRef<ConversationStats | null>(null);
  const graphDataRef = useRef<GraphData | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const draggedNodeIdRef = useRef<string | null>(null);
  const collisionOwnerRef = useRef<symbol | null>(null);
  const pinnedNodeIdsRef = useRef<Set<string>>(pinnedNodeIds);
  // Where the server last put each node, before pins were applied.
  const serverPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // The conversation the hook currently serves. Every async result checks
  // it: a rebuild or refresh that resolves after a switch belongs to the
  // conversation the user left and must not land on this one.
  const activeConversationIdRef = useRef<string | null>(conversationId);
  const enteringTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // All agentConversationIds known from the current request set.
  // Sub-agent requests use their own unique conversationId, so the SSE
  // filter must accept events matching any of these — not only the root.
  const knownAgentConversationIdsRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(isGenerating);

  // Coordination flag: when the SSE bootstrap or an SSE insert handler
  // has already populated graph data for the current conversation, the
  // initial loadGraph fetch must NOT blindly overwrite that data.
  const ssePopulatedForConversationRef = useRef<string | null>(null);

  // Request node IDs that already existed the moment generation started.
  // Any request node NOT in this set arrived during the current generation
  // cycle. An ID snapshot (rather than a count) stays correct even when the
  // baseline is recorded before the bootstrap graph has loaded.
  const requestNodeIdsAtGenerationStartRef = useRef<Set<string>>(new Set());
  const previousIsGeneratingRef = useRef(false);

  // Throttle state for incrementalGraphRebuild — prevents hammering the
  // graph API at 5-10 calls/sec during active orchestrator runs.
  const lastGraphRebuildTimestampRef = useRef<number>(0);
  const graphRebuildThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRebuildInFlightRef = useRef(false);

  // -- Ref sync ---------------------------------------------------
  useEffect(() => { conversationRef.current = conversation; }, [conversation]);
  useEffect(() => {
    conversationRequestsRef.current = conversationRequests;
    const updatedIds = new Set<string>();
    for (const request of conversationRequests) {
      if (request.agentConversationId) updatedIds.add(request.agentConversationId);
    }
    knownAgentConversationIdsRef.current = updatedIds;
  }, [conversationRequests]);
  useEffect(() => { conversationStatsRef.current = conversationStats; }, [conversationStats]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
  useEffect(() => { nodesRef.current = graphData?.nodes || []; }, [graphData?.nodes]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);
  useEffect(() => { pinnedNodeIdsRef.current = pinnedNodeIds; }, [pinnedNodeIds]);

  // -- Tool emoji map (cosmetic) — skipped by a no-op instance ------
  const hasConversation = conversationId !== null;
  useEffect(() => {
    if (!hasConversation) return;
    let isCancelled = false;
    loadToolEmojiMap().then((emojiMap) => { if (!isCancelled) setToolEmojiMap(emojiMap); });
    return () => { isCancelled = true; };
  }, [hasConversation]);

  // -- Entering animation bookkeeping -------------------------------
  // Batches accumulate: a node that arrives while the previous batch is
  // still animating no longer cuts that batch's animation short.
  const markEntering = useCallback((nodeIds: Iterable<string>) => {
    const batch = new Set(nodeIds);
    if (batch.size === 0) return;
    setEnteringNodeIds((previous) => new Set([...previous, ...batch]));
    const timer = setTimeout(() => {
      enteringTimersRef.current.delete(timer);
      setEnteringNodeIds((previous) => {
        const next = new Set(previous);
        for (const nodeId of batch) next.delete(nodeId);
        return next;
      });
    }, TIMING.ANIMATION_DURATION);
    enteringTimersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const timers = enteringTimersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const rememberServerPositions = useCallback((graph: GraphData) => {
    serverPositionsRef.current = new Map(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  }, []);

  const restoreServerLayout = useCallback(() => {
    const serverPositions = serverPositionsRef.current;
    setPinnedNodeIds(new Set());
    pinnedNodeIdsRef.current = new Set();
    setGraphData((previousGraphData) => {
      if (!previousGraphData) return previousGraphData;
      return {
        ...previousGraphData,
        nodes: previousGraphData.nodes.map((node) => {
          const serverPosition = serverPositions.get(node.id);
          return serverPosition ? { ...node, x: serverPosition.x, y: serverPosition.y } : node;
        }),
      };
    });
  }, []);

  // -- Incremental rebuild (backend-driven, throttled) -------------
  // The inner function performs the actual API call and graph state update.
  // It is wrapped by the throttled callback below to prevent excessive
  // network requests during active orchestrator runs with parallel sub-agents.
  const executeGraphRebuild = useCallback(async (
    activeConversation: AgentConversation,
  ) => {
    const activeConversationId = activeConversation.id || activeConversation._id;
    if (!activeConversationId || activeConversationId !== activeConversationIdRef.current) return;

    graphRebuildInFlightRef.current = true;
    try {
      const graph = await IrisService.getConversationGraph(
        activeConversationId,
        CANONICAL_LAYOUT_WIDTH,
        CANONICAL_LAYOUT_HEIGHT,
        graphContentVersion(conversationRequestsRef.current),
      );
      // The user switched conversations while this was in flight.
      if (activeConversationId !== activeConversationIdRef.current) return;
      rememberServerPositions(graph);

      // Build the final graph BEFORE dispatching state — setGraphData updater
      // functions must stay pure (no mutation of closure objects, no timers),
      // otherwise a re-invoked updater would push duplicate pending nodes.
      const previousGraphData = graphDataRef.current;

      const existingPositions = new Map<string, { x: number; y: number }>();
      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
        }
      }

      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingPositions.has(node.id)) newNodeIds.add(node.id);
      }

      // The server layout only grows (fixed grid), so every node takes its
      // server position — the canvas glides anything that moved. Nodes the
      // user dragged keep where they were put; one mid-drag counts too, or
      // a rebuild would yank it back to its server position under the pointer.
      const pinnedIds = new Set(pinnedNodeIdsRef.current);
      if (draggedNodeIdRef.current) pinnedIds.add(draggedNodeIdRef.current);
      for (const node of graph.nodes) {
        const previousPosition = pinnedIds.has(node.id) ? existingPositions.get(node.id) : undefined;
        if (previousPosition) {
          node.x = previousPosition.x;
          node.y = previousPosition.y;
        }
      }

      // Re-inject the pending chain while generation is still active. The
      // proactive turn node is preserved too, but only until the first real
      // request of this generation cycle lands — from then on the server
      // graph contains the real turn boundary node.
      const hadProactiveRequest = previousGraphData?.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      ) ?? false;
      const hadProactiveTurn = previousGraphData?.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_TURN_NODE_ID,
      ) ?? false;

      if ((hadProactiveRequest || hadProactiveTurn) && isGeneratingRef.current) {
        const includeTurnNode = hadProactiveTurn
          && !hasNewRequestNodesSince(graph.nodes, requestNodeIdsAtGenerationStartRef.current);
        const pendingChain = buildPendingChainAdditions(graph, includeTurnNode);
        graph.nodes.push(...pendingChain.nodes);
        graph.edges.push(...pendingChain.edges);
      }

      nodesRef.current = graph.nodes;
      graphDataRef.current = graph;
      setGraphData(graph);
      markEntering(newNodeIds);
    } catch {
      // Graph API failed — silently degrade
    } finally {
      graphRebuildInFlightRef.current = false;
      lastGraphRebuildTimestampRef.current = Date.now();
    }
  }, [markEntering, rememberServerPositions]);

  // Throttled wrapper: ensures at most one graph API call per throttle window.
  // If called while in-flight or within the cooldown, schedules a single
  // trailing call so the latest data is always rendered.
  const incrementalGraphRebuild = useCallback((
    activeConversation: AgentConversation,
  ) => {
    // Cancel any previously scheduled trailing call
    if (graphRebuildThrottleTimerRef.current) {
      clearTimeout(graphRebuildThrottleTimerRef.current);
      graphRebuildThrottleTimerRef.current = null;
    }

    // If a rebuild is already in-flight, defer until it finishes + cooldown
    if (graphRebuildInFlightRef.current) {
      graphRebuildThrottleTimerRef.current = setTimeout(
        () => { graphRebuildThrottleTimerRef.current = null; executeGraphRebuild(activeConversation); },
        TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      );
      return;
    }

    const elapsedSinceLastRebuild = Date.now() - lastGraphRebuildTimestampRef.current;
    const remainingCooldown = TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS - elapsedSinceLastRebuild;

    if (remainingCooldown > 0) {
      // Within throttle window — schedule trailing call
      graphRebuildThrottleTimerRef.current = setTimeout(
        () => { graphRebuildThrottleTimerRef.current = null; executeGraphRebuild(activeConversation); },
        remainingCooldown,
      );
    } else {
      // Throttle window has passed — fire immediately
      executeGraphRebuild(activeConversation);
    }
  }, [executeGraphRebuild]);

  // -- Load session graph -----------------------------------------
  useEffect(() => {
    // The refs the previous conversation left behind (its conversation,
    // requests and known agent ids) let a late SSE batch for the OLD
    // conversation rebuild over the new one. State was already cleared
    // during render; the refs reset here, before any async work, and this
    // effect is declared before the SSE effect so it seeds from them.
    activeConversationIdRef.current = conversationId;
    conversationRef.current = null;
    conversationRequestsRef.current = [];
    conversationStatsRef.current = null;
    knownAgentConversationIdsRef.current = new Set();
    graphDataRef.current = null;
    nodesRef.current = [];
    serverPositionsRef.current = new Map();
    pinnedNodeIdsRef.current = new Set();
    ssePopulatedForConversationRef.current = null;

    if (!conversationId) return;

    let isCancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setIsLoading(true);

    const loadGraph = async () => {
      try {
        const fetchedConversation = await IrisService.getAgentConversation(conversationId);
        if (isCancelled) return;

        if (ssePopulatedForConversationRef.current === conversationId) {
          setIsLoading(false);
          return;
        }

        const [statsResponse, requestsResponse, graphResponse] = await Promise.all([
          IrisService.getConversationRunStats(conversationId).catch(() => null),
          IrisService.getConversationRequests(conversationId).catch(() => ({ requests: [] })),
          IrisService.getConversationGraph(
            conversationId,
            CANONICAL_LAYOUT_WIDTH,
            CANONICAL_LAYOUT_HEIGHT,
            freshLoadVersion(),
          ).catch(() => null),
        ]);

        if (isCancelled) return;

        if (ssePopulatedForConversationRef.current === conversationId) {
          setIsLoading(false);
          return;
        }

        conversationRef.current = fetchedConversation;
        setConversation(fetchedConversation);
        setConversationStats(statsResponse);
        const requestsList = requestsResponse.requests || [];
        conversationRequestsRef.current = requestsList;
        setConversationRequests(requestsList);

        if (graphResponse) {
          rememberServerPositions(graphResponse);
          nodesRef.current = graphResponse.nodes;
          graphDataRef.current = graphResponse;
          setGraphData(graphResponse);
        }
        setIsLoading(false);
      } catch {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadGraph();
    return () => { isCancelled = true; };
  }, [conversationId, rememberServerPositions]);

  // -- SSE live updates -------------------------------------------
  useEffect(() => {
    if (!conversationId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isBootstrapping = false;
    let isCancelled = false;
    let pendingEventsBuffer: IrisCollectionChangeEvent[] = [];
    let conversationDocRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const CONVERSATION_DOC_REFRESH_DEBOUNCE_MILLISECONDS = TIMING.DEBOUNCE_STANDARD;

    const knownRequestIds = new Set<string>();
    for (const existingRequest of conversationRequestsRef.current) {
      if (existingRequest._id) knownRequestIds.add(existingRequest._id);
    }

    const performColdStartBootstrap = async () => {
      if (isBootstrapping || isCancelled) return;
      isBootstrapping = true;
      try {
        const fetchedConversation = await IrisService.getAgentConversation(conversationId);
        if (isCancelled) return;

        const [bootstrapStats, bootstrapRequestsResponse] = await Promise.all([
          IrisService.getConversationRunStats(conversationId).catch(() => null),
          IrisService.getConversationRequests(conversationId).catch(() => ({ requests: [] as IrisRequestEntry[] })),
        ]);
        if (isCancelled) return;

        const bootstrapRequests = bootstrapRequestsResponse.requests || [];

        knownRequestIds.clear();
        for (const bootstrapRequest of bootstrapRequests) {
          if (bootstrapRequest._id) knownRequestIds.add(bootstrapRequest._id);
        }

        conversationRequestsRef.current = bootstrapRequests;
        conversationRef.current = fetchedConversation;
        setConversation(fetchedConversation);
        setConversationStats(bootstrapStats);
        setConversationRequests(bootstrapRequests);

        const graphResponse = await IrisService.getConversationGraph(
          conversationId,
          CANONICAL_LAYOUT_WIDTH,
          CANONICAL_LAYOUT_HEIGHT,
          graphContentVersion(bootstrapRequests),
        ).catch(() => null);
        if (isCancelled) return;

        if (graphResponse) {
          rememberServerPositions(graphResponse);
          nodesRef.current = graphResponse.nodes;
          graphDataRef.current = graphResponse;
          setGraphData(graphResponse);
        }
        setIsLoading(false);
        ssePopulatedForConversationRef.current = conversationId;
      } catch {
        // Conversation not available yet
      } finally {
        isBootstrapping = false;

        if (pendingEventsBuffer.length > 0 && !isCancelled) {
          const bufferedEvents = pendingEventsBuffer;
          pendingEventsBuffer = [];
          for (const bufferedEvent of bufferedEvents) {
            enqueueChangeEvent(bufferedEvent);
          }
        }
      }
    };

    const performFullRefresh = async () => {
      const activeConversation = conversationRef.current;
      if (!activeConversation || isCancelled) {
        if (!activeConversation) await performColdStartBootstrap();
        return;
      }

      const activeConversationId = activeConversation.id || activeConversation._id;
      try {
        const [updatedStats, updatedRequestsResponse, refreshedConversation] = await Promise.all([
          IrisService.getConversationRunStats(activeConversationId).catch(() => conversationStatsRef.current),
          IrisService.getConversationRequests(activeConversationId).catch(() => ({ requests: conversationRequestsRef.current })),
          IrisService.getAgentConversation(activeConversationId).catch(() => null),
        ]);
        if (isCancelled) return;

        // Update conversation ref if a fresh version was fetched
        const resolvedConversation = refreshedConversation || activeConversation;
        if (refreshedConversation) {
          conversationRef.current = refreshedConversation;
          setConversation(refreshedConversation);
        }

        const updatedRequests = updatedRequestsResponse.requests || [];

        // Fingerprint comparison (not just count) so status transitions and
        // tool updates on existing requests also refresh the graph — the
        // polling fallback has no per-document change events to rely on.
        const previousFingerprint = computeRequestsFingerprint(conversationRequestsRef.current);
        const updatedFingerprint = computeRequestsFingerprint(updatedRequests);

        knownRequestIds.clear();
        for (const request of updatedRequests) {
          if (request._id) knownRequestIds.add(request._id);
        }

        if (updatedFingerprint !== previousFingerprint) {
          conversationRequestsRef.current = updatedRequests;
          setConversationStats(updatedStats);
          setConversationRequests(updatedRequests);
          ssePopulatedForConversationRef.current = activeConversationId;
          incrementalGraphRebuild(resolvedConversation);
        } else if (updatedStats) {
          setConversationStats(updatedStats);
        }
      } catch {
        // Silently ignore
      }
    };

    // ── Batched SSE processing ──────────────────────────────────
    let batchedChangeEvents: IrisCollectionChangeEvent[] = [];
    let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const BATCH_WINDOW_MILLISECONDS = TIMING.DEBOUNCE_FAST;

    const flushBatchedEvents = async () => {
      batchFlushTimer = null;
      if (isCancelled || batchedChangeEvents.length === 0) return;

      const eventsToProcess = batchedChangeEvents;
      batchedChangeEvents = [];

      if (isBootstrapping) {
        pendingEventsBuffer.push(...eventsToProcess);
        return;
      }

      const activeConversation = conversationRef.current;
      if (!activeConversation) {
        pendingEventsBuffer.push(...eventsToProcess);
        await performColdStartBootstrap();
        return;
      }

      const insertDocumentIds: string[] = [];
      const updateDocumentIds: string[] = [];
      let hasUnknownOperations = false;

      for (const changeEvent of eventsToProcess) {
        const requestDocumentId = changeEvent.documentId;
        if (!requestDocumentId) {
          hasUnknownOperations = true;
          continue;
        }

        const isInsertOperation = changeEvent.operationType === "insert";
        const isUpdateOperation = changeEvent.operationType === "update" || changeEvent.operationType === "replace";

        if (isInsertOperation) {
          if (!knownRequestIds.has(requestDocumentId)) {
            insertDocumentIds.push(requestDocumentId);
            knownRequestIds.add(requestDocumentId);
          }
        } else if (isUpdateOperation) {
          updateDocumentIds.push(requestDocumentId);
        } else {
          hasUnknownOperations = true;
        }
      }

      if (insertDocumentIds.length === 0 && updateDocumentIds.length === 0) {
        if (hasUnknownOperations) await performFullRefresh();
        return;
      }

      try {
        const allDocumentIds = [...new Set([...insertDocumentIds, ...updateDocumentIds])];
        const activeConversationId = activeConversation.id || activeConversation._id;

        // Re-fetch the conversation when new requests are inserted to keep
        // conversation.messages fresh for turn boundary node labels.
        const fetchPromises: Promise<unknown>[] = [
          IrisService.getConversationRunStats(activeConversationId).catch(() => conversationStatsRef.current),
          ...allDocumentIds.map((documentId) => IrisService.getRequest(documentId)),
        ];
        if (insertDocumentIds.length > 0) {
          fetchPromises.push(
            IrisService.getAgentConversation(activeConversationId).catch(() => null),
          );
        }

        const fetchResults = await Promise.all(fetchPromises);
        if (isCancelled) return;

        const updatedStats = fetchResults[0] as ConversationStats | null;
        const fetchedRequests = fetchResults.slice(1, 1 + allDocumentIds.length) as IrisRequestEntry[];
        const refreshedConversation = insertDocumentIds.length > 0
          ? (fetchResults[fetchResults.length - 1] as AgentConversation | null)
          : null;

        // Update conversation ref if a fresh version was fetched
        const resolvedConversation = refreshedConversation || activeConversation;
        if (refreshedConversation) {
          conversationRef.current = refreshedConversation;
          setConversation(refreshedConversation);
        }

        const fetchedRequestMap = new Map<string, IrisRequestEntry>();
        for (const fetchedRequest of fetchedRequests) {
          if (fetchedRequest?._id) {
            fetchedRequestMap.set(fetchedRequest._id, fetchedRequest);
          }
        }

        let updatedRequests = [...conversationRequestsRef.current];
        const existingIds = new Set(updatedRequests.map((request) => request._id));

        for (const [documentId, fetchedRequest] of fetchedRequestMap) {
          if (existingIds.has(documentId)) {
            updatedRequests = updatedRequests.map((existingRequest) =>
              existingRequest._id === documentId ? fetchedRequest : existingRequest,
            );
          } else {
            updatedRequests.push(fetchedRequest);
          }
        }

        // Synchronously update the ref so any subsequent batch that fires
        // before React's useEffect ref-sync sees the correct baseline.
        conversationRequestsRef.current = updatedRequests;

        // Eagerly update known agent conversation IDs so the next SSE batch
        // can match events from newly discovered sub-agents immediately,
        // without waiting for the React state update → useEffect cycle.
        const eagerAgentConversationIds = new Set<string>();
        for (const request of updatedRequests) {
          if (request.agentConversationId) eagerAgentConversationIds.add(request.agentConversationId);
        }
        knownAgentConversationIdsRef.current = eagerAgentConversationIds;

        setConversationStats(updatedStats);
        setConversationRequests(updatedRequests);
        ssePopulatedForConversationRef.current = conversationId;
        incrementalGraphRebuild(resolvedConversation);
      } catch {
        await performFullRefresh();
      }
    };

    const enqueueChangeEvent = (changeEvent: IrisCollectionChangeEvent) => {
      batchedChangeEvents.push(changeEvent);
      if (!batchFlushTimer) {
        batchFlushTimer = setTimeout(flushBatchedEvents, BATCH_WINDOW_MILLISECONDS);
      }
    };

    const subscription = IrisService.subscribeCollectionChanges({
      onStatus: (statusEvent: IrisCollectionChangeEvent) => {
        setIsLiveConnected(!!statusEvent.changeStreams);
        if (!statusEvent.changeStreams) {
          if (!pollInterval) pollInterval = setInterval(performFullRefresh, TIMING.POLL_SLOW);
        }
      },
      onChange: (changeEvent: IrisCollectionChangeEvent) => {
        if (changeEvent.collection === COLLECTIONS.requests) {
          const eventConversationId = changeEvent.conversationId;
          const isRootMatch = eventConversationId === conversationId;
          const isSubAgentMatch = eventConversationId
            ? knownAgentConversationIdsRef.current.has(eventConversationId)
            : false;
          // Self-bootstrapping chain: if a sub-agent's parentAgentConversationId
          // matches any already-known agent conversation ID, accept the event.
          // This handles the first request from a newly spawned sub-agent whose
          // own conversationId isn't in knownAgentConversationIdsRef yet.
          const isDescendantMatch = changeEvent.parentAgentConversationId
            ? knownAgentConversationIdsRef.current.has(changeEvent.parentAgentConversationId)
            : false;
          if (isRootMatch || isSubAgentMatch || isDescendantMatch) {
            enqueueChangeEvent(changeEvent);
          }
        }

        // When an agent_conversations document for this conversation changes
        // (e.g. hasSubAgents set to true), trigger a full refresh so newly
        // spawned sub-agents and their request chains appear on the graph.
        if (
          changeEvent.collection === "agent_conversations" &&
          (changeEvent.documentId === conversationId || changeEvent.id === conversationId)
        ) {
          if (conversationDocRefreshTimer) clearTimeout(conversationDocRefreshTimer);
          conversationDocRefreshTimer = setTimeout(
            performFullRefresh,
            CONVERSATION_DOC_REFRESH_DEBOUNCE_MILLISECONDS,
          );
        }
      },
    });

    return () => {
      isCancelled = true;
      subscription.close();
      if (pollInterval) clearInterval(pollInterval);
      if (batchFlushTimer) clearTimeout(batchFlushTimer);
      if (conversationDocRefreshTimer) clearTimeout(conversationDocRefreshTimer);
      if (graphRebuildThrottleTimerRef.current) {
        clearTimeout(graphRebuildThrottleTimerRef.current);
        graphRebuildThrottleTimerRef.current = null;
      }
    };
  }, [conversationId, incrementalGraphRebuild, rememberServerPositions]);

  // -- Proactive pending request node injection/removal -----------
  useEffect(() => {
    const wasGenerating = previousIsGeneratingRef.current;
    previousIsGeneratingRef.current = isGenerating;

    const currentGraphData = graphDataRef.current;

    // Snapshot the baseline of known request node IDs the moment generation
    // starts — even when graph data hasn't loaded yet. With an empty baseline
    // every request node that appears afterwards counts as new for this
    // generation cycle, so a first request that lands before the bootstrap
    // graph can never be miscounted as pre-existing (which previously left a
    // phantom pending node behind after generation stopped).
    if (isGenerating && !wasGenerating) {
      const baselineRequestNodeIds = new Set<string>();
      if (currentGraphData) {
        for (const node of currentGraphData.nodes) {
          if (node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID) {
            baselineRequestNodeIds.add(node.id);
          }
        }
      }
      requestNodeIdsAtGenerationStartRef.current = baselineRequestNodeIds;
    }

    if (!currentGraphData) return;

    // ── Injection: generation is active, pending node needed ──
    if (isGenerating) {
      const hasProactiveNode = currentGraphData.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      if (hasProactiveNode) return;

      // Don't inject if real requests have already arrived for this generation cycle
      if (hasNewRequestNodesSince(currentGraphData.nodes, requestNodeIdsAtGenerationStartRef.current)) return;

      // Subsequent turns (main-chain requests already exist) get a turn
      // boundary node ahead of the pending request node.
      const isSubsequentTurn = currentGraphData.nodes.some(
        (node) =>
          node.category === "request" &&
          node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID &&
          ((node.metadata?.agentDepth as number) ?? 0) === 0,
      );

      const pendingChain = buildPendingChainAdditions(currentGraphData, isSubsequentTurn);
      const enteringIds = new Set(pendingChain.nodes.map((node) => node.id));

      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        if (previousGraphData.nodes.some((node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID)) {
          return previousGraphData;
        }
        const updatedNodes = [...previousGraphData.nodes, ...pendingChain.nodes];
        const updatedEdges = [...previousGraphData.edges, ...pendingChain.edges];
        nodesRef.current = updatedNodes;
        return {
          ...previousGraphData,
          nodes: updatedNodes,
          edges: updatedEdges,
        };
      });

      markEntering(enteringIds);

    // ── Removal: generation stopped ──
    } else if (wasGenerating) {
      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        const hasProactiveRequest = previousGraphData.nodes.some(
          (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        const hasProactiveTurn = previousGraphData.nodes.some(
          (node) => node.id === PROACTIVE_PENDING_TURN_NODE_ID,
        );
        if (!hasProactiveRequest && !hasProactiveTurn) return previousGraphData;

        // Keep the pending visual alive until at least one real request for
        // this generation cycle has arrived; the next rebuild clears it.
        if (!hasNewRequestNodesSince(previousGraphData.nodes, requestNodeIdsAtGenerationStartRef.current)) {
          return previousGraphData;
        }

        const proactiveNodeIds = new Set([PROACTIVE_PENDING_REQUEST_NODE_ID, PROACTIVE_PENDING_TURN_NODE_ID]);
        const filteredNodes = previousGraphData.nodes.filter(
          (node) => !proactiveNodeIds.has(node.id),
        );
        const filteredEdges = previousGraphData.edges.filter(
          (edge) => !proactiveNodeIds.has(edge.source) && !proactiveNodeIds.has(edge.target),
        );
        nodesRef.current = filteredNodes;
        return {
          ...previousGraphData,
          nodes: filteredNodes,
          edges: filteredEdges,
        };
      });
    }
  }, [isGenerating, graphData, markEntering]);

  return {
    conversation,
    conversationStats,
    conversationRequests,
    graphData,
    setGraphData,
    isLoading,
    isLiveConnected,
    enteringNodeIds,
    setEnteringNodeIds,
    toolEmojiMap,
    nodesRef,
    graphDataRef,
    draggedNodeIdRef,
    collisionOwnerRef,
    pinnedNodeIds,
    setPinnedNodeIds,
    restoreServerLayout,
  };
}
