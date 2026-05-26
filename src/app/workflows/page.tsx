"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Play,
  Square,
  Loader2,
  Download,
  Upload,
  Undo2,
  RotateCcw,
  Plus,
  Save,
  Package,
  Bot,
  MessageSquare,
  Type,
  Paperclip,
  Eye,
  Workflow,
  Parentheses,
} from "lucide-react";
import PrismService from "../../services/PrismService";
import WorkflowService from "../../services/WorkflowService";
import { executeWorkflow } from "../../services/WorkflowExecutor";
import WorkflowCanvas from "../../components/WorkflowCanvasComponent";
import WorkflowInspector from "../../components/WorkflowInspectorComponent";
import WorkflowHeaderStatsComponent from "../../components/WorkflowHeaderStatsComponent";
import ModelPickerPopoverComponent from "../../components/ModelPickerPopoverComponent";
import HistoryList from "../../components/HistoryListComponent";
import ThreePanelLayout from "../../components/ThreePanelLayoutComponent";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import {
  ButtonComponent,
  ToastComponent,
  useToast,
} from "@rodrigo-barraza/components-library";
import { copyToClipboard } from "../../utils/utilities";
import styles from "./page.module.css";
import type { Workflow as IWorkflow, WorkflowNode, WorkflowEdge, PrismConfig, Message, ModelOption, WorkflowNodeStatus } from "../../types/types";
import { getErrorMessage } from "../../utils/errorMessage";

const MODEL_SECTIONS = [
  "textToText",
  "textToImage",
  "textToSpeech",
  "imageToText",
  "audioToText",
  "embedding",
];

/**
 * Flatten all model groups from the config into a single array with unique
 * provider:name entries, tagged with provider and modalities.
 */
function flattenConfigModels(config: PrismConfig): ModelOption[] {
  if (!config) return [];
  const modelsMap = new Map<string, ModelOption>();

  for (const section of MODEL_SECTIONS) {
    const providers = (config as any)[section]?.models || {};
    for (const [provider, models] of Object.entries(providers) as [string, ModelOption[]][]) {
      for (const m of models) {
        const key = `${provider}:${m.name}`;
        if (!modelsMap.has(key)) {
          modelsMap.set(key, { ...m, provider });
        } else {
          // Merge modalities and data from other sections
          const existing = modelsMap.get(key)!;
          const mergedInput = [
            ...new Set([
              ...(existing.inputTypes || []),
              ...((m.inputTypes as string[]) || []),
            ]),
          ];
          const mergedOutput = [
            ...new Set([
              ...(existing.outputTypes || []),
              ...((m.outputTypes as string[]) || []),
            ]),
          ];
          modelsMap.set(key, {
            ...existing,
            inputTypes: mergedInput,
            outputTypes: mergedOutput,
            modelType: existing.modelType || m.modelType,
            arena: { ...(existing.arena || {}), ...(m.arena || {}) },
          });
        }
      }
    }
  }

  // Normalize: conversation models get inputTypes=["conversation"] with
  // the raw modalities preserved in rawInputTypes for header icons/filtering.
  const models = [...modelsMap.values()];
  for (const m of models) {
    if (m.modelType === "conversation") {
      m.rawInputTypes = m.inputTypes || [];
      m.inputTypes = ["conversation"];
    }
  }
  return models;
}

/**
 * Build compound port IDs for a conversation input node.
 * Each message slot gets a text port, plus modality ports for non-assistant messages.
 * Format: "{messageIndex}.{modality}" e.g. "0.text", "0.image", "1.text"
 */
function buildConversationPorts(messages: Message[], supportedModalities = ["text"]) {
  const ports = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    ports.push(`${i}.text`);
    // User and assistant messages get extra modality ports (image, audio, etc.)
    // System messages are text-only (system prompt)
    if (message.role === "user" || message.role === "assistant") {
      for (const mod of supportedModalities) {
        if (mod !== "text") {
          ports.push(`${i}.${mod}`);
        }
      }
    }
  }
  return ports;
}

function generateNodeId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateEdgeId() {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

interface WorkflowsPageProps {
  initialWorkflowId?: string;
}

interface UndoSnapshot {
  workflowId: string | null;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export default function WorkflowsPage({ initialWorkflowId }: WorkflowsPageProps) {
  const [_config, setConfig] = useState<PrismConfig | null>(null);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<IWorkflow[]>([]);
  const { toasts, addToast, removeToast } = useToast();
  const [wfFavoriteKeys, setWfFavoriteKeys] = useState<string[]>([]);
  const [modelFavoriteKeys, setModelFavoriteKeys] = useState<string[]>([]);

  // Update URL without Next.js navigation (avoids re-mount)
  const updateUrl = (path: string) => {
    if (window.location.pathname !== path) {
      History.prototype.replaceState.call(window.history, {}, "", path);
    }
  };

  // Current workflow state
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [isLoadingWorkflow, setIsLoadingWorkflow] =
    useState(!!initialWorkflowId);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, string>>({}); // nodeId → "running" | "done" | "error"
  const [nodeResults, setNodeResults] = useState<Record<string, Record<string, unknown>>>({}); // nodeId → { text?, image?, audio? }
  const abortRef = useRef<boolean>(false);

  // Dirty-tracking: snapshot of the last saved/loaded state
  const savedSnapshotRef = useRef<string | null>(null);
  const [savedSnapshotVersion, setSavedSnapshotVersion] = useState(0);

  // Undo history (100 states max)
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0); // trigger re-render when stack changes
  const skipNextSnapshotRef = useRef<boolean>(false); // skip snapshot after undo restore

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Load config + saved workflows
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => {
        setConfig(config);
        setAllModels(flattenConfigModels(config));
      },
      onLocalMerge: (merged: PrismConfig) => {
        setConfig(merged);
        setAllModels(flattenConfigModels(merged));
      },
    }).catch(console.error);

    WorkflowService.getWorkflows()
      .then((wfs: IWorkflow[]) =>
        setSavedWorkflows(wfs.map((w) => ({ ...w, id: w._id || w.id })) as IWorkflow[]),
      )
      .catch(console.error);

    PrismService.getFavorites("workflow")
      .then((favs: Array<{key: string}>) => setWfFavoriteKeys(favs.map((f) => f.key)))
      .catch(() => {});

    PrismService.getFavorites("model")
      .then((favs: Array<{key: string}>) => setModelFavoriteKeys(favs.map((f) => f.key)))
      .catch(() => {});
  }, []);

  // Auto-load workflow from URL param
  useEffect(() => {
    if (!initialWorkflowId) return;
    setIsLoadingWorkflow(true);
    WorkflowService.getWorkflow(initialWorkflowId)
      .then((wf) => {
        if (!wf) return;
        const loadedName =
          wf.name ||
          wf.title ||
          (wf.userContent ? wf.userContent.substring(0, 80) : "") ||
          "Untitled Workflow";
        const loadedNodes = wf.nodes || [];
        const loadedEdges = wf.edges || wf.connections || [];
        setWorkflowId(wf._id || wf.id || null);
        setWorkflowName(loadedName);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setNodeResults((wf.nodeResults as Record<string, Record<string, unknown>>) || {});
        setNodeStatuses(wf.nodeStatuses || {});
        savedSnapshotRef.current = JSON.stringify({
          workflowName: loadedName,
          nodes: loadedNodes,
          edges: loadedEdges,
        });
        setSavedSnapshotVersion((v) => v + 1);
      })
      .catch(console.error)
      .finally(() => setIsLoadingWorkflow(false));
  }, [initialWorkflowId]);

  // Import conversation from homepage (sessionStorage handoff)
  useEffect(() => {
    const raw = sessionStorage.getItem("workflow_import_conversation");
    if (!raw) return;
    sessionStorage.removeItem("workflow_import_conversation");
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      if ((data.messages as Message[]) && (data.messages as Message[])?.length > 0) {
        const importedNode = {
          id: generateNodeId(),
          modelName: (data.model as string) || "",
          provider: (data.provider as string) || "",
          displayName: (data.model as string) || "Imported Conversation",
          inputTypes: ["text"],
          outputTypes: ["text"],
          supportsSystemPrompt: true,
          messages: (data.messages as Message[]),
          position: { x: 200, y: 120 },
        };
        setNodes((prev) => [...prev, importedNode as WorkflowNode]);
        setWorkflowName(
          (data.title as string) ? `${(data.title as string)} (workflow)` : "Imported Conversation",
        );
        addToast(`Imported conversation with ${(data.messages as Message[])?.length} messages`);
      }
    } catch (error: unknown) {
      console.error("Failed to import conversation:", error);
    }
  }, []);

  // Keep a ref with the latest state so pushUndo never goes stale
  const currentStateRef = useRef<UndoSnapshot>({
    workflowId: null,
    workflowName: "Untitled Workflow",
    nodes: [],
    edges: [],
  });
  useEffect(() => {
    currentStateRef.current = { workflowId, workflowName, nodes, edges };
  }, [workflowId, workflowName, nodes, edges]);

  // Push current state to undo stack (stable ref — no dependency issues)
  const pushUndo = useCallback(() => {
    const {
      workflowId: wId,
      workflowName: wName,
      nodes: n,
      edges: e,
    } = currentStateRef.current;
    const snapshot = {
      workflowId: wId,
      workflowName: wName,
      nodes: structuredClone(n),
      edges: structuredClone(e),
    };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
  }, []);

  // Undo last action
  const handleUndo = useCallback(() => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    setUndoCount(undoStackRef.current.length);
    skipNextSnapshotRef.current = true;
    setWorkflowId(snapshot.workflowId);
    setWorkflowName(snapshot.workflowName);
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, []);

  // Ctrl+Z keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);

  // Filter models to only those with clear modalities
  const modelsWithModalities = useMemo(() => {
    return allModels.filter(
      (m) =>
        ((m.inputTypes as string[]) && (m.inputTypes as string[]).length > 0) ||
        ((m.outputTypes as string[]) && (m.outputTypes as string[]).length > 0),
    );
  }, [allModels]);

  // Add a new asset node (input asset, output viewer, or model)
  const handleAddAsset = useCallback(
    (modality: string, type: string) => {
      pushUndo();

      // Model node
      if (modality === "model") {
        const defaultModel = modelsWithModalities[0];
        const isConversation = defaultModel?.modelType === "conversation";
        const supportsFC = defaultModel?.tools?.includes("Tool Calling");
        const baseInputs = isConversation
          ? ["conversation"]
          : defaultModel?.inputTypes || [];
        const newNode: WorkflowNode = {
          id: generateNodeId(),
          modelName: defaultModel?.name || "select-model",
          provider: defaultModel?.provider || "",
          displayName:
            defaultModel?.display_name ||
            defaultModel?.label ||
            defaultModel?.name ||
            "Select a Model",
          modelType: defaultModel?.modelType || "conversation",
          inputTypes: supportsFC ? [...baseInputs, "tools"] : baseInputs,
          rawInputTypes:
            defaultModel?.rawInputTypes ||
            defaultModel?.inputTypes ||
            [],
          outputTypes: defaultModel?.outputTypes || [],
          supportsSystemPrompt: defaultModel?.supportsSystemPrompt !== false,
          messages: [
            { role: "system", content: "" },
            { role: "user", content: "" },
          ],
          position: {
            x: 80 + nodes.length * 60 + Math.random() * 40,
            y: 80 + nodes.length * 40 + Math.random() * 40,
          },
        };
        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
        return;
      }

      // Tool node — tool calling tools
      if (modality === "tools") {
        const newNode = {
          id: generateNodeId(),
          nodeType: "tools",
          inputTypes: [],
          outputTypes: ["tools"],
          builtInTools: [],
          customTools: [],
          disabledTools: [],
          position: {
            x: 80 + nodes.length * 60 + Math.random() * 40,
            y: 80 + nodes.length * 40 + Math.random() * 40,
          },
        };
        // Load both custom tools and built-in schemas, then attach them
        Promise.all([
          PrismService.getCustomTools("CODING").catch(() => []),
          PrismService.getBuiltInToolSchemas("CODING").catch(() => []),
        ]).then(([custom, builtIn]: [unknown[], unknown[]]) => {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === newNode.id
                ? { ...n, customTools: custom as string[], builtInTools: builtIn as string[] }
                : n,
            ),
          );
        });
        setNodes((prev) => [...prev, newNode as unknown as WorkflowNode]);
        setSelectedNodeId(newNode.id);
        return;
      }

      const isViewer = type === "viewer";
      const isFile = modality === "file";
      const isConversation = modality === "conversation";
      const defaultMessages = isConversation
        ? [
            { role: "system", content: "" },
            { role: "user", content: "" },
          ]
        : undefined;
      const defaultModalities = ["text"];
      const newNode = {
        id: generateNodeId(),
        nodeType: type, // "input" or "viewer"
        modality: isFile ? null : modality,
        content: isConversation ? undefined : "",
        contentType: isViewer ? modality : undefined,
        // Conversation input nodes carry structured messages
        ...(isConversation
          ? {
              messages: defaultMessages,
              supportedModalities: defaultModalities,
            }
          : {}),
        // File input nodes start with no output ports until a file is loaded
        inputTypes: isViewer
          ? ["text", "image", "audio"]
          : isConversation
            ? []
            : [],
        outputTypes: isViewer
          ? ["text", "image", "audio"]
          : isFile
            ? []
            : isConversation
              ? ["conversation"]
              : [modality],
        position: {
          x: 80 + nodes.length * 60 + Math.random() * 40,
          y: 80 + nodes.length * 40 + Math.random() * 40,
        },
      };
      setNodes((prev) => [...prev, newNode as unknown as WorkflowNode]);
      setSelectedNodeId(newNode.id);
    },
    [nodes.length, modelsWithModalities],
  );

  // Update content of an asset node
  const handleUpdateNodeContent = useCallback((nodeId: string, content: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, content } : n)),
    );
  }, []);

  /**
   * Update a file input node's content and dynamically adjust its modality.
   * If the new modality differs, remove any incompatible outgoing connections.
   * When content is cleared (removed), reset modality and outputTypes and remove all outgoing connections.
   */
  const handleUpdateFileInput = useCallback(
    async (nodeId: string, content: string | ArrayBuffer | null, mimeType: string | null) => {
      pushUndo();
      let newModality = null;
      if (content && mimeType) {
        if (mimeType.startsWith("image/")) newModality = "image";
        else if (mimeType.startsWith("audio/")) newModality = "audio";
        else if (mimeType.startsWith("video/")) newModality = "video";
        else if (mimeType === "application/pdf") newModality = "pdf";
        else newModality = "text";
      }

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId || n.nodeType !== "input") return n;
          return {
            ...n,
            content: content || "",
            modality: newModality,
            outputTypes: newModality ? [newModality] : [],
          };
        }),
      );

      // Remove incompatible outgoing edges
      setEdges((prev) =>
        prev.filter((c) => {
          if (c.sourceNodeId !== nodeId) return true;
          // If file was removed, drop all outgoing edges
          if (!newModality) return false;
          // Keep only if the edge modality matches the new modality
          return c.sourceModality === newModality;
        }),
      );

      // Base64 data URLs are kept in-memory until save — Prism backend
      // handles the upload to MinIO when the workflow is persisted.
    },
    [],
  );

  // Update config of a model node (systemPrompt, staticInputs, etc.)
  const handleUpdateNodeConfig = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const updated = { ...n, [key]: value };
          // Regenerate compound ports when messages change on conversation input nodes
          if (
            key === "messages" &&
            n.nodeType === "input" &&
            n.modality === "conversation"
          ) {
            updated.inputTypes = buildConversationPorts(
              value as Message[],
              n.supportedModalities || ["text"],
            );
          }
          return updated;
        }),
      );
    },
    [],
  );

  // Run the workflow
  const handleRunWorkflow = useCallback(async () => {
    setIsRunning(true);
    setNodeStatuses({});
    setNodeResults({});
    setSelectedNodeId(null);
    abortRef.current = false;

    // Clear viewer node content from previous runs
    setNodes((prev) =>
      prev.map((n) =>
        n.nodeType === "viewer"
          ? { ...n, content: null, contentType: null, receivedOutputs: {} }
          : n,
      ),
    );

    try {
      const { conversationIds } = await executeWorkflow(nodes as Parameters<typeof executeWorkflow>[0], edges as Parameters<typeof executeWorkflow>[1], {
        onNodeStart: (nodeId: string) => {
          if (abortRef.current) return;
          setNodeStatuses((prev: Record<string, string>) => ({ ...prev, [nodeId]: "running" }));
        },
        onNodeComplete: (nodeId: string, outputs: Record<string, unknown>) => {
          if (abortRef.current) return;
          setNodeStatuses((prev: Record<string, string>) => ({ ...prev, [nodeId]: "done" }));
          setNodeResults((prev: Record<string, Record<string, unknown>>) => ({ ...prev, [nodeId]: outputs }));

          // Update viewer nodes with ALL received content
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== nodeId || n.nodeType !== "viewer") return n;
              // Store all outputs on the viewer node
              const receivedOutputs: Record<string, unknown> = {};
              let firstContent = null;
              let firstType = null;
              for (const [type, data] of Object.entries(outputs)) {
                if (data) {
                  receivedOutputs[type] = data;
                  if (!firstContent) {
                    firstContent = data;
                    firstType = type;
                  }
                }
              }
              return {
                ...n,
                content: firstContent,
                contentType: firstType,
                receivedOutputs,
              };
            }),
          );
        },
        onNodeError: (nodeId: string, error: unknown) => {
          if (abortRef.current) return;
          setNodeStatuses((prev: Record<string, string>) => ({ ...prev, [nodeId]: "error" }));
          setNodeResults((prev: Record<string, Record<string, unknown>>) => ({
            ...prev,
            [nodeId]: { error: getErrorMessage(error) },
          }));
        },
        onViewerPartial: (viewerNodeId: string, partialOutputs: Record<string, unknown>) => {
          if (abortRef.current) return;
          // Show viewer as running while it receives partial data
          setNodeStatuses((prev: Record<string, string>) => {
            if (prev[viewerNodeId] === "done") return prev;
            return { ...prev, [viewerNodeId]: "running" };
          });
          // Incrementally update the viewer's received outputs
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== viewerNodeId || n.nodeType !== "viewer") return n;
              const receivedOutputs = {
                ...(n.receivedOutputs || {}),
                ...partialOutputs,
              };
              const firstEntry = Object.entries(receivedOutputs).find(
                ([, v]) => v,
              );
              return {
                ...n,
                content: firstEntry ? firstEntry[1] : null,
                contentType: firstEntry ? firstEntry[0] : null,
                receivedOutputs,
              };
            }),
          );
        },
        onNodeContentUpdate: (nodeId: string, newContent: unknown) => {
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== nodeId) return n;
              return { ...n, content: newContent };
            }),
          );
        },
      });

      // Link generated conversations to this workflow
      if (workflowId && conversationIds?.length > 0) {
        PrismService.patchWorkflowConversations(
          workflowId,
          conversationIds,
        ).catch((error) =>
          console.error("Failed to link conversations to workflow:", error),
        );
      }
    } catch (error: unknown) {
      addToast(`Execution failed: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsRunning(false);
    }
  }, [nodes, edges, workflowId]);

  const handleStopWorkflow = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
  }, []);

  // Reset workflow execution state (statuses, results, viewer outputs)
  const handleResetWorkflow = useCallback(() => {
    setNodeStatuses({});
    setNodeResults({});
    setSelectedNodeId(null);
    setNodes((prev) =>
      prev.map((n) =>
        n.nodeType === "viewer"
          ? { ...n, content: null, contentType: null, receivedOutputs: {} }
          : n,
      ),
    );
  }, []);

  // Update node position (drag)
  const handleUpdateNodePosition = useCallback((nodeId: string, position: { x: number, y: number }) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    );
  }, []);

  // Delete a node and its edges
  const handleDeleteNode = useCallback((nodeId: string) => {
    pushUndo();
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) =>
      prev.filter(
        (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId,
      ),
    );
  }, []);

  // Add an edge
  const handleAddEdge = useCallback(
    (conn: WorkflowEdge) => {
      pushUndo();
      setEdges((prev) => [...prev, { ...conn, id: generateEdgeId() }]);

      // If source is a conversation input, sync its modalities with the downstream model
      setNodes((prev) => {
        const sourceNode = prev.find((n) => n.id === conn.sourceNodeId!);
        const targetNode = prev.find((n) => n.id === conn.targetNodeId);

        // Auto-populate viewer if source node already has results
        if (targetNode?.nodeType === "viewer") {
          const existingResults = nodeResults[conn.sourceNodeId!];
          if (existingResults && existingResults[conn.sourceModality as string]) {
            const data = existingResults[conn.sourceModality as string];
            return prev.map((n) => {
              if (n.id !== conn.targetNodeId) return n;
              const receivedOutputs = {
                ...(n.receivedOutputs || {}),
                [conn.targetModality as string]: data,
              };
              return {
                ...n,
                content: data,
                contentType: conn.targetModality,
                receivedOutputs,
              };
            });
          }
        }

        if (
          sourceNode?.nodeType === "input" &&
          sourceNode?.modality === "conversation" &&
          targetNode &&
          !targetNode.nodeType
        ) {
          const rawInputs = (
            (targetNode.rawInputTypes as string[]) ||
            targetNode.inputTypes ||
            []
          ).filter((t: string) => t !== "conversation");
          const messages = sourceNode.messages || [
            { role: "system", content: "" },
            { role: "user", content: "" },
          ];
          const newPorts = new Set(buildConversationPorts(messages, rawInputs));
          // Remove edges to conversation input ports that no longer exist
          setEdges((prevEdges) =>
            prevEdges.filter((c: WorkflowEdge) => {
              if (c.targetNodeId !== conn.sourceNodeId!) return true;
              return newPorts.has(c.targetModality as string);
            }),
          );
          return prev.map((n) =>
            n.id === conn.sourceNodeId!
              ? {
                  ...n,
                  supportedModalities: rawInputs,
                  inputTypes: [...newPorts],
                }
              : n,
          );
        }
        return prev;
      });
    },
    [nodeResults],
  );

  // Delete an edge
  const handleDeleteEdge = useCallback((edgeId: string) => {
    pushUndo();

    // Find the edge before removing it
    setEdges((prev) => {
      const deleted = prev.find((c) => c.id === edgeId);
      const remaining = prev.filter((c) => c.id !== edgeId);

      if (deleted) {
        // Handle viewer disconnection
        setNodes((prevNodes) => {
          const targetNode = prevNodes.find(
            (n) => n.id === deleted.targetNodeId,
          );
          if (targetNode?.nodeType === "viewer") {
            const receivedOutputs = { ...(targetNode.receivedOutputs || {}) };
            delete (receivedOutputs as Record<string, unknown>)[deleted.targetModality as string];
            const viewerStillConnected = remaining.filter(
              (c) => c.targetNodeId === deleted.targetNodeId,
            );
            const firstEntry = Object.entries(receivedOutputs).find(
              ([, v]) => v,
            );
            return prevNodes.map((n) =>
              n.id === deleted.targetNodeId
                ? {
                    ...n,
                    content: firstEntry ? firstEntry[1] : null,
                    contentType: firstEntry ? firstEntry[0] : null,
                    receivedOutputs:
                      viewerStillConnected.length > 0 ? receivedOutputs : {},
                  }
                : n,
            );
          }
          return prevNodes;
        });

        // Handle conversation input disconnection — reset ports
        const sourceStillConnected = remaining.some(
          (c) =>
            c.sourceNodeId === deleted.sourceNodeId &&
            c.sourceModality === "conversation",
        );
        if (!sourceStillConnected) {
          setNodes((prevNodes) => {
            const sourceNode = prevNodes.find(
              (n) => n.id === deleted.sourceNodeId,
            );
            if (
              sourceNode?.nodeType === "input" &&
              sourceNode?.modality === "conversation"
            ) {
              return prevNodes.map((n) =>
                n.id === deleted.sourceNodeId
                  ? { ...n, supportedModalities: ["text"], inputTypes: [] }
                  : n,
              );
            }
            return prevNodes;
          });
        }
      }

      return remaining;
    });
  }, []);

  // Save current workflow
  const handleSaveWorkflow = useCallback(async () => {
    try {
      const workflow = {
        id: workflowId ?? undefined,
        name: workflowName || "Untitled Workflow",
        nodes,
        edges,
        nodeResults,
        nodeStatuses,
      };
      const saved = await WorkflowService.saveWorkflow(workflow as unknown as IWorkflow);
      const newId = saved.id || saved._id;
      setWorkflowId(newId ? String(newId) : null);
      updateUrl(`/workflows/${newId}`);
      // Update saved snapshot after successful save
      savedSnapshotRef.current = JSON.stringify({
        workflowName: workflowName || "Untitled Workflow",
        nodes,
        edges,
      });
      setSavedSnapshotVersion((v) => v + 1);
      const wfs = await WorkflowService.getWorkflows();
      setSavedWorkflows(wfs.map((w) => ({ ...w, id: w._id || w.id })));
      addToast("Workflow saved");
    } catch (error: unknown) {
      addToast(`Failed to save: ${getErrorMessage(error)}`, "error");
    }
  }, [workflowId, workflowName, nodes, edges, nodeResults, nodeStatuses]);

  // Load a saved workflow
  const handleLoadWorkflow = useCallback(async (id: string) => {
    pushUndo();
    setSelectedNodeId(null); // close inspector immediately
    try {
      const wf = await WorkflowService.getWorkflow(id);
      if (!wf) return;
      const loadedId = wf._id || wf.id;
      // React 18 batches all these into a single render — no flash
      setWorkflowId(loadedId ? String(loadedId) : null);
      const loadedName =
        wf.name ||
        wf.title ||
        (wf.userContent ? wf.userContent.substring(0, 80) : "") ||
        "Untitled Workflow";
      const loadedNodes = wf.nodes || [];
      const loadedEdges = wf.edges || wf.connections || [];
      setWorkflowName(loadedName);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setNodeResults((wf.nodeResults as Record<string, Record<string, unknown>>) || {});
      setNodeStatuses((wf.nodeStatuses as Record<string, string>) || {});
      // Snapshot the loaded state for dirty-tracking
      savedSnapshotRef.current = JSON.stringify({
        workflowName: loadedName,
        nodes: loadedNodes,
        edges: loadedEdges,
      });
      setSavedSnapshotVersion((v) => v + 1);
      updateUrl(`/workflows/${loadedId}`);
      addToast("Workflow loaded");
    } catch (error: unknown) {
      addToast(`Failed to load: ${getErrorMessage(error)}`, "error");
    }
  }, []);

  // Delete a saved workflow
  const handleDeleteWorkflow = useCallback(
    async (id: string) => {
      try {
        await WorkflowService.deleteWorkflow(id);
        const wfs = await WorkflowService.getWorkflows();
        setSavedWorkflows(wfs.map((w) => ({ ...w, id: w._id || w.id })));
        if (workflowId === id) {
          setWorkflowId(null);
          setWorkflowName("Untitled Workflow");
          setNodes([]);
          setEdges([]);
          setNodeResults({});
          setNodeStatuses({});
          updateUrl("/workflows");
        }
        addToast("Workflow deleted");
      } catch (error: unknown) {
        addToast(`Failed to delete: ${getErrorMessage(error)}`, "error");
      }
    },
    [workflowId],
  );

  // Change the model on an existing node
  const handleChangeModel = useCallback((nodeId: string, newModel: ModelOption) => {
    const isConversation = newModel.modelType === "conversation";
    const supportsFC = newModel.tools?.includes("Tool Calling");
    const baseInputs = isConversation
      ? ["conversation"]
      : newModel.inputTypes || [];
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId || n.nodeType) return n;
        return {
          ...n,
          modelName: newModel.name,
          provider: newModel.provider || "",
          displayName: newModel.display_name || newModel.label || newModel.name,
          modelType: newModel.modelType,
          inputTypes: supportsFC ? [...baseInputs, "tools"] : baseInputs,
          rawInputTypes: newModel.rawInputTypes || newModel.inputTypes || [],
          outputTypes: newModel.outputTypes || [],
          supportsSystemPrompt: newModel.supportsSystemPrompt !== false,
        };
      }),
    );

    // Remove edges whose modalities are no longer valid
    const newInputTypes = isConversation
      ? new Set(["conversation"])
      : new Set((newModel.inputTypes as string[]) || []);
    const newOutputTypes = new Set((newModel.outputTypes as string[]) || []);
    setEdges((prev) =>
      prev.filter((c) => {
        if (c.targetNodeId === nodeId && !newInputTypes.has(c.targetModality as string))
          return false;
        if (c.sourceNodeId === nodeId && !newOutputTypes.has(c.sourceModality as string))
          return false;
        return true;
      }),
    );
  }, []);

  // New workflow
  const handleNewWorkflow = useCallback(() => {
    pushUndo();
    setWorkflowId(null);
    setWorkflowName("Untitled Workflow");
    setNodes([]);
    setEdges([]);
    setNodeResults({});
    setNodeStatuses({});
    setSelectedNodeId(null);
    // Reset snapshot — blank workflow has nothing to save
    savedSnapshotRef.current = null;
    setSavedSnapshotVersion((v) => v + 1);
  }, [pushUndo]);

  // Duplicate a node (copy-paste)
  const handleDuplicateNode = useCallback((nodeData: WorkflowNode) => {
    pushUndo();
    const newNode = {
      ...structuredClone(nodeData),
      id: generateNodeId(),
      position: {
        x: (nodeData.position?.x || 0) + 40,
        y: (nodeData.position?.y || 0) + 40,
      },
    };
    // Strip runtime state
    const { receivedOutputs: _discard, ...cleanNode } = newNode as WorkflowNode & { receivedOutputs?: unknown };
    setNodes((prev) => [...prev, cleanNode as WorkflowNode]);
    setSelectedNodeId(newNode.id);
  }, []);

  // -- Dirty-tracking: is the current state different from last saved? --
  const hasUnsavedChanges = useMemo(() => {
    // Blank workflow (no nodes) is never saveable
    if (nodes.length === 0) return false;
    // Never been saved and has content → saveable
    if (!savedSnapshotRef.current) return true;
    const current = JSON.stringify({ workflowName, nodes, edges });
    return current !== savedSnapshotRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowName, nodes, edges, savedSnapshotVersion]);

  // -- Memos for ThreePanelLayout panels --

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const historyItems = useMemo(() => {
    return savedWorkflows.map((wf) => {
      const id = String(wf._id || wf.id || "");
      const name =
        wf.name ||
        (wf.userContent
          ? wf.userContent.substring(0, 80) +
            (wf.userContent.length > 80 ? "…" : "")
          : "Untitled Workflow");
      return {
        id,
        title: name,
        updatedAt: wf.updatedAt,
        createdAt: wf.createdAt,
        totalCost: wf.totalCost || 0,
        modalities: wf.modalities || {},
        providers: wf.providers || [],
        username: wf.userName,
        searchText: wf.userName || "",
      };
    });
  }, [savedWorkflows]);

  const handleDownloadWorkflow = useCallback(async (id: string) => {
    try {
      const wf = await WorkflowService.getWorkflow(id);
      if (!wf) return;
      const data = JSON.stringify(wf, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      downloadAnchor.download = `workflow-${id}.json`;
      downloadAnchor.click();
      URL.revokeObjectURL(url);
      addToast("Workflow downloaded");
    } catch (error: unknown) {
      addToast(`Download failed: ${getErrorMessage(error)}`, "error");
    }
  }, []);

  const handleCopyWorkflow = useCallback(async (id: string) => {
    try {
      const wf = await WorkflowService.getWorkflow(id);
      if (!wf) return;
      await copyToClipboard(JSON.stringify(wf, null, 2));
      addToast("Workflow copied to clipboard");
    } catch (error: unknown) {
      addToast(`Copy failed: ${getErrorMessage(error)}`, "error");
    }
  }, []);

  const handleToggleFavorite = useCallback(
    async (wfId: string) => {
      if (wfFavoriteKeys.includes(wfId)) {
        setWfFavoriteKeys((prev) => prev.filter((k) => k !== wfId));
        PrismService.removeFavorite("workflow", wfId).catch(() => {});
      } else {
        setWfFavoriteKeys((prev) => [...prev, wfId]);
        const wf = savedWorkflows.find((w) => (w._id || w.id) === wfId);
        PrismService.addFavorite("workflow", wfId, {
          title: wf?.name || "Untitled Workflow",
        }).catch(() => {});
      }
    },
    [wfFavoriteKeys, savedWorkflows],
  );

  return (
    <ThreePanelLayout
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftTitle="Assets"
      leftPanel={
        <div className={styles.leftPanel}>
          {/* Asset buttons */}
          <div className={styles.assetSection}>
            <div className={styles.assetSectionLabel}>
              <Package size={11} />
              Assets
            </div>
            <div className={styles.assetButtons}>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("model", "model")}
                title="Add AI Model"
              >
                <Bot size={12} style={{ color: "#3b82f6" }} />
                <span>AI Model</span>
              </button>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("conversation", "input")}
                title="Add Chat History"
              >
                <MessageSquare size={12} style={{ color: "#8b5cf6" }} />
                <span>Chat History</span>
              </button>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("text", "input")}
                title="Add Text"
              >
                <Type size={12} style={{ color: "#6366f1" }} />
                <span>Text</span>
              </button>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("file", "input")}
                title="Add Media"
              >
                <Paperclip size={12} style={{ color: "#8b5cf6" }} />
                <span>Media</span>
              </button>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("text", "viewer")}
                title="Add Output"
              >
                <Eye size={12} style={{ color: "#a78bfa" }} />
                <span>Output</span>
              </button>
              <button
                className={styles.assetButton}
                onClick={() => handleAddAsset("tools", "tools")}
                title="Add Tool Calling Tools"
              >
                <Parentheses size={12} style={{ color: "#f97316" }} />
                <span>Tools</span>
              </button>
            </div>
          </div>

          {/* Inspector — shows when a node is selected */}
          {selectedNode && (
            <div className={styles.inspectorContainer}>
              <WorkflowInspector
                node={selectedNode}
                connections={edges as any}
                nodes={nodes}
                allModels={modelsWithModalities}
                nodeResults={nodeResults}
                nodeStatuses={nodeStatuses}
                onUpdateNodeConfig={handleUpdateNodeConfig}
                onUpdateNodeContent={handleUpdateNodeContent}
                onUpdateFileInput={handleUpdateFileInput}
                onChangeModel={handleChangeModel}
                onSelectNode={setSelectedNodeId}
                onClose={() => setSelectedNodeId(null)}
              />
            </div>
          )}
        </div>
      }
      rightTitle={`${savedWorkflows.length} Workflows`}
      rightPanel={
        <div className={styles.rightPanel}>
          {/* New Workflow button */}
          <ButtonComponent
            variant="primary"
            icon={Plus}
            onClick={handleNewWorkflow}
            disabled={!workflowId && nodes.length === 0}
            className={styles.newWorkflowButton}
          >
            New Workflow
          </ButtonComponent>

          {/* Workflow history list */}
          <HistoryList
            items={historyItems}
            activeId={workflowId}
            onSelect={(item: { id: string }) => handleLoadWorkflow(item.id)}
            onDelete={handleDeleteWorkflow}
            onDownload={handleDownloadWorkflow}
            onCopy={handleCopyWorkflow}
            icon={Workflow}
            readOnly={false}
            emptyLabel="No workflows yet"
            searchPlaceholder="Search workflows…"
            favorites={wfFavoriteKeys}
            onToggleFavorite={handleToggleFavorite}
            countLabel="workflows"
          />
        </div>
      }
      headerCenter={
        selectedNode && !(selectedNode as WorkflowNode).nodeType ? (
          <ModelPickerPopoverComponent
            config={_config}
            settings={{
              provider: (selectedNode as WorkflowNode).provider,
              model: (selectedNode as WorkflowNode).modelName,
            }}
            onSelectModel={(provider: string, modelName: string) => {
              const model = modelsWithModalities.find(
                (m) => m.provider === provider && m.name === modelName,
              );
              if (model) handleChangeModel((selectedNode as WorkflowNode).id, model);
            }}
            favorites={modelFavoriteKeys}
            onToggleFavorite={async (key: string) => {
              if (modelFavoriteKeys.includes(key)) {
                setModelFavoriteKeys((prev) =>
                  prev.filter((k) => k !== key),
                );
                PrismService.removeFavorite("model", key).catch(() => {});
              } else {
                setModelFavoriteKeys((prev) => [...prev, key]);
                const [provider, ...rest] = key.split(":");
                PrismService.addFavorite("model", key, {
                  provider,
                  name: rest.join(":"),
                }).catch(() => {});
              }
            }}
          />
        ) : null
      }
      headerMeta={
        <WorkflowHeaderStatsComponent nodes={nodes} edgeCount={edges.length} />
      }
      headerControls={
        <div className={styles.headerControls}>
          <ButtonComponent
            variant="disabled"
            icon={Download}
            onClick={() => {
              const data = JSON.stringify({ nodes, edges }, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const downloadAnchor = document.createElement("a");
              downloadAnchor.href = url;
              downloadAnchor.download = `workflow-${Date.now()}.json`;
              downloadAnchor.click();
              URL.revokeObjectURL(url);
            }}
            title="Export workflow"
            className={styles.headerActionButton}
          />
          <ButtonComponent
            variant="disabled"
            icon={Upload}
            onClick={() => (importRef.current as HTMLInputElement)?.click()}
            title="Import workflow"
            className={styles.headerActionButton}
          />
          <ButtonComponent
            variant="disabled"
            icon={Undo2}
            onClick={handleUndo}
            disabled={undoCount === 0}
            title={`Undo (Ctrl+Z) · ${undoCount} states`}
            className={styles.headerActionButton}
          />
          <ButtonComponent
            variant="disabled"
            icon={RotateCcw}
            onClick={handleResetWorkflow}
            disabled={isRunning || Object.keys(nodeStatuses).length === 0}
            title="Reset execution state"
            className={styles.headerActionButton}
          />
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const data = JSON.parse(reader.result as string);
                  if (data.nodes && (data.edges || data.connections)) {
                    setNodes(data.nodes);
                    setEdges(data.edges || data.connections);
                  }
                } catch {
                  // invalid JSON
                }
              };
              reader.readAsText(file);
              e.target.value = "";
            }}
          />
          {isRunning ? (
            <button
              className={`${styles.runButton} ${styles.runBtnStop}`}
              onClick={handleStopWorkflow}
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              className={styles.runButton}
              onClick={handleRunWorkflow}
              disabled={nodes.length === 0}
            >
              <Play size={14} />
              Run
            </button>
          )}
          {isRunning && <Loader2 size={16} className={styles.spinner} />}
        </div>
      }
    >
      {/* Center: Workflow Canvas */}
      <div className={styles.canvasWrapper}>
        {isLoadingWorkflow && (
          <div className={styles.loadingOverlay}>
            <Loader2 size={24} className={styles.loadingSpinner} />
          </div>
        )}
        <WorkflowCanvas
          nodes={nodes}
          connections={edges as any}
          onUpdateNodePosition={handleUpdateNodePosition}
          onDeleteNode={handleDeleteNode}
          onAddConnection={handleAddEdge as any}
          onDeleteConnection={handleDeleteEdge}
          onUpdateNodeContent={handleUpdateNodeContent}
          onUpdateNodeConfig={handleUpdateNodeConfig}
          onUpdateFileInput={handleUpdateFileInput}
          onDuplicateNode={handleDuplicateNode}
          nodeStatuses={nodeStatuses}
          nodeResults={nodeResults}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          activeWorkflowId={workflowId}
          isLoadingWorkflow={isLoadingWorkflow}
        />
      </div>

      {/* Footer: save workflow (matches ChatArea inputWrapper) */}
      <div className={styles.inputWrapper}>
        <div className={styles.inputBox}>
          <input
            type="text"
            className={styles.nameInput}
            placeholder="Untitled Workflow"
            value={workflowName || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWorkflowName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") handleSaveWorkflow();
            }}
          />
          <ButtonComponent
            variant="primary"
            icon={Save}
            onClick={handleSaveWorkflow}
            disabled={!hasUnsavedChanges}
            title="Save Workflow"
            className={styles.saveButton}
          />
        </div>
      </div>

      <ToastComponent toasts={toasts} onRemove={removeToast} />
    </ThreePanelLayout>
  );
}
