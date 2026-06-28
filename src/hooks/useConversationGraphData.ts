"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import IrisService, {
  type IrisRequestEntry,
  type IrisCollectionChangeEvent,
} from "../services/IrisService";
import PrismService from "../services/PrismService";
import type { AgentConversation, ConversationStats, ToolSchema } from "../types/types";
import {
  buildGraphFromConversation,
  type GraphData,
  type GraphNode,
  applyTopologyLayout,
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  PROACTIVE_PENDING_TURN_NODE_ID,
} from "../components/ChatConversationGraphComponent";

/* ═══════════════════════════════════════════════════════════════════
   Canonical layout dimensions
   ═══════════════════════════════════════════════════════════════════
   Node positions are computed once using these canonical dimensions.
   Each rendering instance applies its own viewport transform (zoom +
   pan) via animateToFitTransform to map these positions onto its
   actual canvas size. This decouples data/layout from viewport. */
const CANONICAL_LAYOUT_WIDTH = 1600;
const CANONICAL_LAYOUT_HEIGHT = 1000;

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

  // All agentConversationIds known from the current request set.
  // Sub-agent requests use their own unique conversationId, so the SSE
  // filter must accept events matching any of these — not only the root.
  const knownAgentConversationIdsRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(isGenerating);

  // Coordination flag: when the SSE bootstrap or an SSE insert handler
  // has already populated graph data for the current conversation, the
  // initial loadGraph fetch must NOT blindly overwrite that data.
  const ssePopulatedForConversationRef = useRef<string | null>(null);

  // Tracks the real request count at the moment generation started.
  const requestCountAtGenerationStartRef = useRef<number>(0);
  const previousIsGeneratingRef = useRef(false);

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

  // -- Incremental rebuild ----------------------------------------
  const incrementalGraphRebuild = useCallback((
    activeConversation: AgentConversation,
    updatedStats: ConversationStats | null,
    updatedRequests: IrisRequestEntry[],
  ) => {
    setGraphData((previousGraphData) => {
      const existingPositions = new Map<string, { x: number; y: number }>();
      const existingNodeIds = new Set<string>();

      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
          existingNodeIds.add(node.id);
        }
      }

      const graph = buildGraphFromConversation(activeConversation, updatedStats, updatedRequests);
      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingNodeIds.has(node.id)) newNodeIds.add(node.id);
      }

      const topology = activeConversation.settings?.agents?.topology || "hierarchical";
      applyTopologyLayout(graph, CANONICAL_LAYOUT_WIDTH, CANONICAL_LAYOUT_HEIGHT, topology);

      // Preserve positions for ALL pre-existing nodes. Only truly new
      // nodes receive their fresh layout coordinates. This prevents
      // existing turn/request nodes from shifting when new nodes arrive.
      for (const node of graph.nodes) {
        if (newNodeIds.has(node.id)) continue;
        const previousPosition = existingPositions.get(node.id);
        if (previousPosition) {
          node.x = previousPosition.x;
          node.y = previousPosition.y;
        }
      }

      // Re-inject the proactive pending node when generation is still active
      const hadProactiveRequest = previousGraphData?.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      const hadProactiveTurn = previousGraphData?.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_TURN_NODE_ID,
      );
      const previousRealRequestCount = previousGraphData
        ? previousGraphData.nodes.filter(
            (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
          ).length
        : 0;
      const currentRealRequestCount = graph.nodes.filter(
        (node) => node.category === "request",
      ).length;

      const hasNewRealRequestsArrived = currentRealRequestCount > requestCountAtGenerationStartRef.current;

      // Find the tail of the main-agent chain (last request or turn node)
      const findChainTail = () => {
        const realRequestNodes = graph.nodes.filter((node) => node.category === "request");
        const lastRealRequest = realRequestNodes
          .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
          .at(-1);
        // Check if the last node in the chain is actually a turn node
        // (i.e., a turn node exists that has no outgoing edge to a request)
        const turnNodes = graph.nodes.filter((node) => node.category === "turn");
        const lastTurnNode = turnNodes.at(-1);
        if (lastTurnNode) {
          const turnHasRequestChild = graph.edges.some(
            (edge) => edge.source === lastTurnNode.id && graph.nodes.some(
              (node) => node.id === edge.target && node.category === "request",
            ),
          );
          if (!turnHasRequestChild) return lastTurnNode;
        }
        return lastRealRequest;
      };

      if ((hadProactiveRequest || hadProactiveTurn) && currentRealRequestCount > previousRealRequestCount) {
        if (isGeneratingRef.current) {
          const chainTail = findChainTail();
          const agentNode = graph.nodes.find((node) => node.category === "agent");
          const lastRealRequest = graph.nodes
            .filter((node) => node.category === "request")
            .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
            .at(-1);

          const cascadingProactiveNode: GraphNode = {
            id: PROACTIVE_PENDING_REQUEST_NODE_ID,
            label: `#${(lastRealRequest?.sequenceNumber ?? 0) + 1} pending`,
            category: "request",
            radius: 24,
            x: chainTail?.x ?? (agentNode?.x ?? 400) + 200,
            y: chainTail ? chainTail.y + 80 : (agentNode?.y ?? 250),
            velocityX: 0,
            velocityY: 0,
            sequenceNumber: (lastRealRequest?.sequenceNumber ?? 0) + 1,
            metadata: { operation: "pending", status: "pending" },
          };

          graph.nodes.push(cascadingProactiveNode);
          if (chainTail) {
            graph.edges.push({ source: chainTail.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
          }
        }
      } else if ((hadProactiveRequest || hadProactiveTurn) && !isGeneratingRef.current && hasNewRealRequestsArrived) {
        // Generation stopped and real requests have arrived — don't re-inject
      } else if (hadProactiveRequest || hadProactiveTurn) {
        if (isGeneratingRef.current) {
          const chainTail = findChainTail();
          const agentNode = graph.nodes.find((node) => node.category === "agent");
          const lastRealRequest = graph.nodes
            .filter((node) => node.category === "request")
            .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
            .at(-1);

          const reinjectedNode: GraphNode = {
            id: PROACTIVE_PENDING_REQUEST_NODE_ID,
            label: `#${(lastRealRequest?.sequenceNumber ?? 0) + 1} pending`,
            category: "request",
            radius: 24,
            x: chainTail?.x ?? (agentNode?.x ?? 400) + 200,
            y: chainTail ? chainTail.y + 80 : (agentNode?.y ?? 250),
            velocityX: 0,
            velocityY: 0,
            sequenceNumber: (lastRealRequest?.sequenceNumber ?? 0) + 1,
            metadata: { operation: "pending", status: "pending" },
          };

          graph.nodes.push(reinjectedNode);
          if (chainTail) {
            graph.edges.push({ source: chainTail.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
          }
        }
      }

      // Eagerly synchronize nodesRef so consumers read correct positions
      nodesRef.current = graph.nodes;

      if (newNodeIds.size > 0) {
        setEnteringNodeIds(newNodeIds);
        setTimeout(() => setEnteringNodeIds(new Set()), 600);
      }

      return graph;
    });
  }, []);

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

        const [statsResponse, requestsResponse] = await Promise.all([
          IrisService.getConversationRunStats(conversationId).catch(() => null),
          IrisService.getConversationRequests(conversationId).catch(() => ({ requests: [] })),
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

        const graph = buildGraphFromConversation(fetchedConversation, statsResponse, requestsList);
        const topology = fetchedConversation.settings?.agents?.topology || "hierarchical";
        applyTopologyLayout(graph, CANONICAL_LAYOUT_WIDTH, CANONICAL_LAYOUT_HEIGHT, topology);
        nodesRef.current = graph.nodes;
        setGraphData(graph);
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
    const CONVERSATION_DOC_REFRESH_DEBOUNCE_MILLISECONDS = 500;

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

        const graph = buildGraphFromConversation(fetchedConversation, bootstrapStats, bootstrapRequests);
        const topology = fetchedConversation.settings?.agents?.topology || "hierarchical";
        applyTopologyLayout(graph, CANONICAL_LAYOUT_WIDTH, CANONICAL_LAYOUT_HEIGHT, topology);
        nodesRef.current = graph.nodes;
        setGraphData(graph);
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
        const previousCount = knownRequestIds.size;

        knownRequestIds.clear();
        for (const request of updatedRequests) {
          if (request._id) knownRequestIds.add(request._id);
        }

        if (updatedRequests.length !== previousCount) {
          conversationRequestsRef.current = updatedRequests;
          setConversationStats(updatedStats);
          setConversationRequests(updatedRequests);
          ssePopulatedForConversationRef.current = activeConversationId;
          incrementalGraphRebuild(resolvedConversation, updatedStats, updatedRequests);
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
    const BATCH_WINDOW_MILLISECONDS = 150;

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
        incrementalGraphRebuild(resolvedConversation, updatedStats, updatedRequests);
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
          if (!pollInterval) pollInterval = setInterval(performFullRefresh, 10_000);
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
    };
  }, [conversationId, incrementalGraphRebuild]);

  // -- Proactive pending request node injection/removal -----------
  useEffect(() => {
    const currentGraphData = graphDataRef.current;
    if (!currentGraphData) return;

    const wasGenerating = previousIsGeneratingRef.current;
    previousIsGeneratingRef.current = isGenerating;

    // ── Injection: generation is active, pending node needed ──
    if (isGenerating) {
      // Record baseline on the first firing where graphData is available
      if (!wasGenerating) {
        const existingRequestNodes = currentGraphData.nodes.filter(
          (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        requestCountAtGenerationStartRef.current = existingRequestNodes.length;
      }

      const hasProactiveNode = currentGraphData.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      if (hasProactiveNode) return;

      // Don't re-inject if real requests have already arrived for this generation cycle
      const currentRealRequestCount = currentGraphData.nodes.filter(
        (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
      ).length;
      if (currentRealRequestCount > requestCountAtGenerationStartRef.current) return;

      const existingRequestNodes = currentGraphData.nodes.filter(
        (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      const nextSequenceNumber = existingRequestNodes.length > 0
        ? Math.max(...existingRequestNodes.map((node) => node.sequenceNumber ?? 0)) + 1
        : 1;

      const agentNode = currentGraphData.nodes.find(
        (node) => node.category === "agent",
      );

      const lastRequestNode = existingRequestNodes
        .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
        .at(-1);

      // Determine if this is a subsequent turn (there are already request nodes from a previous turn)
      const isSubsequentTurn = existingRequestNodes.length > 0;
      const existingTurnNodes = currentGraphData.nodes.filter(
        (node) => node.category === "turn" && node.id !== PROACTIVE_PENDING_TURN_NODE_ID,
      );
      const nextTurnIndex = existingTurnNodes.length;

      const proactiveNodes: GraphNode[] = [];
      const proactiveEdges: Array<{ source: string; target: string; strength: number }> = [];
      const enteringIds = new Set<string>();

      // For subsequent turns, inject a turn boundary node first
      if (isSubsequentTurn) {
        const turnNodeX = lastRequestNode?.x ?? (agentNode?.x ?? 400) + 200;
        const turnNodeY = lastRequestNode ? lastRequestNode.y + 80 : (agentNode?.y ?? 250);

        const proactiveTurnNode: GraphNode = {
          id: PROACTIVE_PENDING_TURN_NODE_ID,
          label: `Turn ${nextTurnIndex + 1}`,
          category: "turn",
          radius: 24,
          x: turnNodeX,
          y: turnNodeY,
          velocityX: 0,
          velocityY: 0,
          metadata: { turnIndex: nextTurnIndex },
        };
        proactiveNodes.push(proactiveTurnNode);
        enteringIds.add(PROACTIVE_PENDING_TURN_NODE_ID);

        // Chain: last_request → turn_node
        if (lastRequestNode) {
          proactiveEdges.push({ source: lastRequestNode.id, target: PROACTIVE_PENDING_TURN_NODE_ID, strength: 0.5 });
        }

        // Chain: turn_node → pending_request
        const pendingNodeX = turnNodeX;
        const pendingNodeY = turnNodeY + 80;

        const proactivePendingNode: GraphNode = {
          id: PROACTIVE_PENDING_REQUEST_NODE_ID,
          label: `#${nextSequenceNumber} pending`,
          category: "request",
          radius: 24,
          x: pendingNodeX,
          y: pendingNodeY,
          velocityX: 0,
          velocityY: 0,
          sequenceNumber: nextSequenceNumber,
          metadata: { operation: "pending", status: "pending" },
        };
        proactiveNodes.push(proactivePendingNode);
        enteringIds.add(PROACTIVE_PENDING_REQUEST_NODE_ID);
        proactiveEdges.push({ source: PROACTIVE_PENDING_TURN_NODE_ID, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
      } else {
        // First turn: just inject the pending request node
        const proactiveNodeX = lastRequestNode?.x ?? (agentNode?.x ?? 400) + 200;
        const proactiveNodeY = lastRequestNode ? lastRequestNode.y + 80 : (agentNode?.y ?? 250);

        const proactivePendingNode: GraphNode = {
          id: PROACTIVE_PENDING_REQUEST_NODE_ID,
          label: `#${nextSequenceNumber} pending`,
          category: "request",
          radius: 24,
          x: proactiveNodeX,
          y: proactiveNodeY,
          velocityX: 0,
          velocityY: 0,
          sequenceNumber: nextSequenceNumber,
          metadata: { operation: "pending", status: "pending" },
        };
        proactiveNodes.push(proactivePendingNode);
        enteringIds.add(PROACTIVE_PENDING_REQUEST_NODE_ID);

        if (agentNode) {
          proactiveEdges.push({ source: agentNode.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.5 });
        }
        if (lastRequestNode) {
          proactiveEdges.push({ source: lastRequestNode.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
        }
      }

      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        if (previousGraphData.nodes.some((node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID)) {
          return previousGraphData;
        }
        const updatedNodes = [...previousGraphData.nodes, ...proactiveNodes];
        const updatedEdges = [...previousGraphData.edges, ...proactiveEdges];
        nodesRef.current = updatedNodes;
        return {
          ...previousGraphData,
          nodes: updatedNodes,
          edges: updatedEdges,
        };
      });

      setEnteringNodeIds(enteringIds);
      setTimeout(() => setEnteringNodeIds(new Set()), 600);

    // ── Removal: generation stopped ──
    } else if (!isGenerating && wasGenerating) {
      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        const hasProactiveRequest = previousGraphData.nodes.some(
          (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        const hasProactiveTurn = previousGraphData.nodes.some(
          (node) => node.id === PROACTIVE_PENDING_TURN_NODE_ID,
        );
        if (!hasProactiveRequest && !hasProactiveTurn) return previousGraphData;

        const currentRealRequestCount = previousGraphData.nodes.filter(
          (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
        ).length;
        const hasNewRealRequests = currentRealRequestCount > requestCountAtGenerationStartRef.current;

        if (!hasNewRealRequests) {
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
  };
}
