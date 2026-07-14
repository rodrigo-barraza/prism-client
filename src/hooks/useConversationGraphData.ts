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
import {
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  PROACTIVE_PENDING_TURN_NODE_ID,
} from "../components/ChatConversationGraphComponent";

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

/* ═══════════════════════════════════════════════════════════════════
   Canonical layout dimensions
   ═══════════════════════════════════════════════════════════════════
   Node positions are computed once using these canonical dimensions.
   Each rendering instance applies its own viewport transform (zoom +
   pan) via animateToFitTransform to map these positions onto its
   actual canvas size. This decouples data/layout from viewport. */
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

  const conversationRef = useRef<AgentConversation | null>(null);
  const conversationRequestsRef = useRef<IrisRequestEntry[]>([]);
  const conversationStatsRef = useRef<ConversationStats | null>(null);
  const graphDataRef = useRef<GraphData | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const draggedNodeIdRef = useRef<string | null>(null);
  const collisionOwnerRef = useRef<symbol | null>(null);

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

  // -- Fetch tool schemas for emoji map (cosmetic) ----------------
  useEffect(() => {
    let isCancelled = false;
    PrismService.getBuiltInToolSchemas()
      .then((toolSchemas: ToolSchema[]) => {
        if (isCancelled) return;
        const emojiMap = new Map<string, string>();
        for (const toolSchema of toolSchemas) {
          if (toolSchema.emoji) {
            const resolvedEmoji = Array.isArray(toolSchema.emoji) ? toolSchema.emoji[0] : toolSchema.emoji;
            if (resolvedEmoji) emojiMap.set(toolSchema.name, resolvedEmoji);
          }
        }
        setToolEmojiMap(emojiMap);
      })
      .catch(() => { /* Tool emojis are cosmetic — fail silently */ });
    return () => { isCancelled = true; };
  }, []);

  // -- Incremental rebuild (backend-driven, throttled) -------------
  // The inner function performs the actual API call and graph state update.
  // It is wrapped by the throttled callback below to prevent excessive
  // network requests during active orchestrator runs with parallel sub-agents.
  const executeGraphRebuild = useCallback(async (
    activeConversation: AgentConversation,
  ) => {
    const activeConversationId = activeConversation.id || activeConversation._id;
    if (!activeConversationId) return;

    graphRebuildInFlightRef.current = true;
    try {
      const graph = await IrisService.getConversationGraph(
        activeConversationId,
        CANONICAL_LAYOUT_WIDTH,
        CANONICAL_LAYOUT_HEIGHT,
      );

      // Build the final graph BEFORE dispatching state — setGraphData updater
      // functions must stay pure (no mutation of closure objects, no timers),
      // otherwise a re-invoked updater would push duplicate pending nodes.
      const previousGraphData = graphDataRef.current;

      const existingPositions = new Map<string, { x: number; y: number }>();
      const existingNodeIds = new Set<string>();
      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
          existingNodeIds.add(node.id);
        }
      }

      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingNodeIds.has(node.id)) newNodeIds.add(node.id);
      }

      // When new sub-agent nodes appear, the graph topology has changed
      // significantly — the layout algorithm computes sub-agent branch
      // positions relative to the main chain, so preserving old positions
      // would place new nodes at coordinates relative to a stale grid.
      const hasNewSubAgentNodes = [...newNodeIds].some((nodeId) => {
        const node = graph.nodes.find((graphNode) => graphNode.id === nodeId);
        if (!node) return false;
        if (node.category === "subagent") return true;
        if (node.category === "request" && ((node.metadata?.agentDepth as number) ?? 0) > 0) return true;
        return false;
      });

      if (!hasNewSubAgentNodes) {
        for (const node of graph.nodes) {
          if (newNodeIds.has(node.id)) continue;
          const previousPosition = existingPositions.get(node.id);
          if (previousPosition) {
            node.x = previousPosition.x;
            node.y = previousPosition.y;
          }
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

      if (newNodeIds.size > 0) {
        setEnteringNodeIds(newNodeIds);
        setTimeout(() => setEnteringNodeIds(new Set()), TIMING.ANIMATION_DURATION);
      }
    } catch {
      // Graph API failed — silently degrade
    } finally {
      graphRebuildInFlightRef.current = false;
      lastGraphRebuildTimestampRef.current = Date.now();
    }
  }, []);

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
    if (!conversationId) {
      setConversation(null);
      setConversationStats(null);
      setConversationRequests([]);
      setGraphData(null);
      ssePopulatedForConversationRef.current = null;
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    ssePopulatedForConversationRef.current = null;

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
          IrisService.getConversationGraph(conversationId, CANONICAL_LAYOUT_WIDTH, CANONICAL_LAYOUT_HEIGHT).catch(() => null),
        ]);

        if (isCancelled) return;

        if (ssePopulatedForConversationRef.current === conversationId) {
          setIsLoading(false);
          return;
        }

        setConversation(fetchedConversation);
        setConversationStats(statsResponse);
        const requestsList = requestsResponse.requests || [];
        setConversationRequests(requestsList);

        if (graphResponse) {
          nodesRef.current = graphResponse.nodes;
          setGraphData(graphResponse);
        }
        setIsLoading(false);
      } catch {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadGraph();
    return () => { isCancelled = true; };
  }, [conversationId]);

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
        setConversation(fetchedConversation);
        setConversationStats(bootstrapStats);
        setConversationRequests(bootstrapRequests);

        const graphResponse = await IrisService.getConversationGraph(
          conversationId,
          CANONICAL_LAYOUT_WIDTH,
          CANONICAL_LAYOUT_HEIGHT,
        ).catch(() => null);
        if (isCancelled) return;

        if (graphResponse) {
          nodesRef.current = graphResponse.nodes;
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
        if (changeEvent.collection === "requests") {
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
  }, [conversationId, incrementalGraphRebuild]);

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

      setEnteringNodeIds(enteringIds);
      setTimeout(() => setEnteringNodeIds(new Set()), TIMING.ANIMATION_DURATION);

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
  }, [isGenerating, graphData]);

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
  };
}
