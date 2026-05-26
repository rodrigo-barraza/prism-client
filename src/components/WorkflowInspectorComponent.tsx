"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Eye,
  Type,
  Volume2,
  X,
  Maximize2,
  Search,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Code,
  BookOpen,
  Parentheses,
} from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import { MODALITY_ICONS } from "./WorkflowNodeConstantsComponent";
import { renderToolName } from "../utils/utilities";
import MarkdownContent from "./MarkdownContentComponent";
import TextContentComponent from "./TextContentComponent";
import MessageList from "./MessageListComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import AssetInputOptions from "./AssetInputOptionsComponent";
import { ToggleComponent } from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import { copyToClipboard } from "../utils/utilities";

import styles from "./WorkflowInspectorComponent.module.css";
import { LS_WORKFLOW_INSPECTOR_WIDTH } from "../constants";
import { ModelOption, WorkflowEdge, WorkflowNode, WorkflowNodeStatus, Message } from "../types/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 320;

function getStoredWidth(): number {
  try {
    const storedWidth = localStorage.getItem(LS_WORKFLOW_INSPECTOR_WIDTH);
    if (storedWidth) {
      const parsedWidth = parseInt(storedWidth, 10);
      if (!isNaN(parsedWidth) && parsedWidth >= MIN_WIDTH && parsedWidth <= MAX_WIDTH) return parsedWidth;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

export interface NodeResult {
  image?: string;
  text?: string;
  audio?: string;
  embedding?: number[];
  error?: string;
}

interface WorkflowInspectorProps {
  node: WorkflowNode | null;
  connections: WorkflowEdge[];
  nodes: WorkflowNode[];
  allModels?: ModelOption[];
  nodeResults?: Record<string, NodeResult | null | undefined>;
  nodeStatuses?: Record<string, string>;
  onUpdateNodeConfig?: (nodeId: string, key: string, value: any) => void;
  onUpdateNodeContent?: (nodeId: string, content: string) => void;
  onUpdateFileInput?: (nodeId: string, fileData: string | ArrayBuffer | null, mimeType: string | null) => void;
  onChangeModel?: (nodeId: string, model: ModelOption) => void;
  onSelectNode?: (nodeId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

const getModalityIcon = (modality: string | null | undefined) => {
  if (!modality) return null;
  const icons = MODALITY_ICONS as Record<
    string,
    { icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string; color: string } | undefined
  >;
  return icons[modality];
};

/**
 * Right-side inspector panel that shows details about the selected workflow node.
 */
export default function WorkflowInspector({
  node,
  connections,
  nodes,
  allModels = [],
  nodeResults,
  nodeStatuses,
  onUpdateNodeConfig,
  onUpdateNodeContent,
  onUpdateFileInput,
  onChangeModel,
  onSelectNode,
  onClose,
  readOnly = false,
}: WorkflowInspectorProps) {
  // Model change state (hooks must be called before any early return)
  const [modelSearch, setModelSearch] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [conversationView, setConversationView] = useState("json");
  const [toolBuiltInOpen, setToolBuiltInOpen] = useState(true);
  const [toolCustomOpen, setToolCustomOpen] = useState(true);

  // -- Resize logic --
  const [inspectorWidth, setInspectorWidth] = useState(getStoredWidth);
  const isDragging = useRef<boolean>(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (mouseEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, window.innerWidth - mouseEvent.clientX),
      );
      setInspectorWidth(newWidth);
    };

    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Persist width to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_WORKFLOW_INSPECTOR_WIDTH, String(inspectorWidth));
    } catch {
      /* ignore */
    }
  }, [inspectorWidth]);

  const isModel = node ? !node.nodeType : false;
  const isTools = node ? node.nodeType === "tools" : false;

  // Find incoming / outgoing connections
  const incoming = useMemo(
    () =>
      (connections || []).filter(
        (c: WorkflowEdge) => node && c.targetNodeId === node.id,
      ),
    [connections, node],
  );
  const outgoing = useMemo(
    () =>
      (connections || []).filter(
        (c: WorkflowEdge) => node && c.sourceNodeId === node.id,
      ),
    [connections, node],
  );

  // Compute compatible models based on connections
  const compatibleModels = useMemo(() => {
    if (!isModel) return [];
    const requiredInputs = incoming.map((c: WorkflowEdge) => c.targetModality);
    const requiredOutputs = outgoing.map((c: WorkflowEdge) => c.sourceModality);

    return allModels.filter((m: ModelOption) => {
      const mInputs = m.inputTypes || [];
      const mOutputs = m.outputTypes || [];
      // Check input compatibility: conversation-type models accept "conversation" edges
      // Tools connections are always compatible with FC-capable models
      if (requiredInputs.length > 0) {
        const inputsOk = requiredInputs.every(
          (mod: string | undefined) =>
            mod === "tools" ||
            mInputs.includes(mod || "") ||
            (mod === "conversation" && m.modelType === "conversation"),
        );
        if (!inputsOk) return false;
      }
      if (
        requiredOutputs.length > 0 &&
        !requiredOutputs.every((mod: string | undefined) => mOutputs.includes(mod || ""))
      )
        return false;
      return true;
    });
  }, [isModel, incoming, outgoing, allModels]);

  // Filtered by search
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return compatibleModels;
    const normalizedSearch = modelSearch.trim().toLowerCase();
    return compatibleModels.filter((m: ModelOption) => {
      const name = m.display_name || m.label || m.name || "";
      const provider = m.provider || "";
      return (
        name.toLowerCase().includes(normalizedSearch) || provider.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [compatibleModels, modelSearch]);

  if (!node) return null;

  const status = nodeStatuses?.[node.id];
  const results = nodeResults?.[node.id];
  const isInput = node.nodeType === "input";
  const isViewer = node.nodeType === "viewer";

  const getNodeLabel = (id: string) => {
    const matchedNode = (nodes || []).find((nd: WorkflowNode) => nd.id === id);
    if (!matchedNode) return id;
    if (matchedNode.nodeType === "input") {
      const labels: Record<string, string> = {
        text: "Text",
        image: "Image",
        audio: "Audio",
        video: "Video",
        pdf: "PDF",
        conversation: "Chat History",
      };
      const key = typeof matchedNode.modality === "string" ? matchedNode.modality : "";
      return matchedNode.customName || labels[key] || "Media";
    }
    if (matchedNode.nodeType === "viewer") return matchedNode.customName || "Output";
    if (matchedNode.nodeType === "tools") return matchedNode.customName || "Tools";
    return (matchedNode.displayName as string) || matchedNode.modelName || id;
  };

  const NODE_TYPE_LABELS: Record<string, string> = {
    text: "Text Node",
    image: "Image Node",
    audio: "Audio Node",
    video: "Video Node",
    pdf: "PDF Node",
    conversation: "Chat History Node",
  };

  const nodeSubtitle = isModel
    ? node.provider
    : isTools
      ? "Tool Calling"
      : isInput
        ? (typeof node.modality === "string" ? NODE_TYPE_LABELS[node.modality] : "") || "Media Node"
        : "Output Node";

  const receivedOutputs = node.receivedOutputs as {
    image?: string;
    text?: string;
    audio?: string;
    embedding?: number[];
  } | undefined;

  return (
    <div
      className={styles.inspector}
      style={{ width: inspectorWidth, minWidth: MIN_WIDTH }}
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {isModel && (
            <div className={styles.providerIcon}>
              <ProviderLogo provider={node.provider || ""} size={18} />
            </div>
          )}
          {isInput && (
            <div
              className={styles.typeIcon}
              style={{ color: getModalityIcon(node.modality)?.color }}
            >
              {node.modality === "text" ? (
                <Type size={16} />
              ) : node.modality === "audio" ? (
                <Volume2 size={16} />
              ) : getModalityIcon(node.modality)?.icon ? (
                (() => {
                  const Icon = getModalityIcon(node.modality)!.icon;
                  return <Icon size={16} />;
                })()
              ) : (
                <Type size={16} />
              )}
            </div>
          )}
          {isViewer && (
            <div className={styles.typeIcon} style={{ color: "#a78bfa" }}>
              <Eye size={16} />
            </div>
          )}
          {isTools && (
            <div className={styles.typeIcon} style={{ color: "#f97316" }}>
              <Parentheses size={16} />
            </div>
          )}
          <div className={styles.headerInfo}>
            <span className={styles.headerTitle}>
              {isModel
                ? (node.displayName as string) || node.modelName
                : isTools
                  ? node.customName || "Tools"
                  : isInput
                    ? node.customName ||
                      ({
                        text: "Text",
                        image: "Image",
                        audio: "Audio",
                        video: "Video",
                        pdf: "PDF",
                        conversation: "Chat History",
                      } as Record<string, string>)[typeof node.modality === "string" ? node.modality : ""] ||
                      "Media"
                    : node.customName || "Output"}
            </span>
            <span className={styles.headerSubtitle}>
              {nodeSubtitle}
              {status && (
                <span
                  className={`${styles.statusBadge} ${styles[`status_${status}`]}`}
                >
                  {status}
                </span>
              )}
            </span>
          </div>
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* Model selector — model nodes only, hidden in readOnly */}
        {isModel && !readOnly && (
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Model</label>
            <div className={styles.modelSelector}>
              <button
                className={`${styles.modelSelectorTrigger} ${modelDropdownOpen ? styles.modelSelectorTriggerOpen : ""}`}
                onClick={() => setModelDropdownOpen((prev) => !prev)}
              >
                <span className={styles.modelSelectorContent}>
                  <ProviderLogo provider={node.provider || ""} size={14} />
                  <span className={styles.modelSelectorLabel}>
                    {(node.displayName as string) || node.modelName}
                  </span>
                </span>
                <ChevronDown
                  size={12}
                  className={`${styles.modelSelectorChevron} ${modelDropdownOpen ? styles.modelSelectorChevronOpen : ""}`}
                />
              </button>

              {modelDropdownOpen && (
                <div className={styles.modelDropdown}>
                  <div className={styles.modelDropdownSearch}>
                    <Search
                      size={11}
                      className={styles.modelDropdownSearchIcon}
                    />
                    <input
                      type="text"
                      className={styles.modelDropdownSearchInput}
                      placeholder="Search models…"
                      value={modelSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModelSearch(e.target.value)}
                      autoFocus
                    />
                    {modelSearch && (
                      <button
                        className={styles.modelDropdownSearchClear}
                        onClick={() => setModelSearch("")}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <div className={styles.modelDropdownList}>
                    {filteredModels.length === 0 ? (
                      <div className={styles.modelDropdownEmpty}>
                        No compatible models found
                      </div>
                    ) : (
                      filteredModels.map((m: ModelOption) => {
                        const key = `${m.provider}:${m.name}`;
                        const isCurrent =
                          m.name === node.modelName &&
                          m.provider === node.provider;
                        return (
                          <button
                            key={key}
                            className={`${styles.modelDropdownItem} ${isCurrent ? styles.modelDropdownItemActive : ""}`}
                            onClick={() => {
                              onChangeModel?.(node.id, m);
                              setModelDropdownOpen(false);
                              setModelSearch("");
                            }}
                          >
                            <ProviderLogo provider={m.provider || ""} size={13} />
                            <span className={styles.modelDropdownItemName}>
                              {m.display_name || m.label || m.name}
                            </span>
                            <span
                              className={styles.modelDropdownItemModalities}
                            >
                              {(m.rawInputTypes || m.inputTypes || []).map(
                                (t: string) => {
                                  const modalityIcon = getModalityIcon(t);
                                  if (!modalityIcon) return null;
                                  const Icon = modalityIcon.icon;
                                  return (
                                    <Icon
                                      key={`in-${t}`}
                                      size={9}
                                      style={{ color: modalityIcon.color }}
                                    />
                                  );
                                },
                              )}
                              <span className={styles.modelDropdownItemArrow}>
                                →
                              </span>
                              {(m.outputTypes || []).map((t: string) => {
                                const modalityIcon = getModalityIcon(t);
                                if (!modalityIcon) return null;
                                const Icon = modalityIcon.icon;
                                return (
                                  <Icon
                                    key={`out-${t}`}
                                    size={9}
                                    style={{ color: modalityIcon.color }}
                                  />
                                );
                              })}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Model info — readOnly mode */}
        {isModel && readOnly && (
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Model</label>
            <div
              className={styles.modelSelectorTrigger}
              style={{ cursor: "default" }}
            >
              <span className={styles.modelSelectorContent}>
                <ProviderLogo provider={node.provider || ""} size={14} />
                <span className={styles.modelSelectorLabel}>
                  {(node.displayName as string) || node.modelName}
                </span>
              </span>
            </div>
          </section>
        )}

        {/* Input Ports */}
        {incoming.length > 0 && (
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Input Ports</label>
            <div className={styles.connectionList}>
              {incoming.map((c: WorkflowEdge) => (
                <div
                  key={c.id}
                  className={`${styles.connectionItem} ${styles.connectionItemClickable}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectNode?.(c.sourceNodeId || "")}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ")
                      onSelectNode?.(c.sourceNodeId || "");
                  }}
                >
                  <span
                    className={styles.connectionDot}
                    style={{
                      background:
                        getModalityIcon(c.targetModality)?.color ||
                        "#888",
                    }}
                  />
                  <span className={styles.connectionFrom}>
                    {getNodeLabel(c.sourceNodeId || "")}
                  </span>
                  <span className={styles.connectionArrow}>→</span>
                  <span className={styles.connectionModality}>
                    {c.targetModality}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Output Ports */}
        {outgoing.length > 0 && (
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Output Ports</label>
            <div className={styles.connectionList}>
              {outgoing.map((c: WorkflowEdge) => (
                <div
                  key={c.id}
                  className={`${styles.connectionItem} ${styles.connectionItemClickable}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectNode?.(c.targetNodeId || "")}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ")
                      onSelectNode?.(c.targetNodeId || "");
                  }}
                >
                  <span className={styles.connectionModality}>
                    {c.sourceModality}
                  </span>
                  <span className={styles.connectionArrow}>→</span>
                  <span className={styles.connectionTo}>
                    {getNodeLabel(c.targetNodeId || "")}
                  </span>
                  <span
                    className={styles.connectionDot}
                    style={{
                      background:
                        getModalityIcon(c.sourceModality)?.color ||
                        "#888",
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Content — text input assets */}
        {isInput && node.modality === "text" && (
          <section className={`${styles.section} ${styles.scrollableSection}`}>
            <TextContentComponent
              label="Text Content"
              value={(node.content as string) || ""}
              onChange={
                readOnly
                  ? undefined
                  : (value: string) => onUpdateNodeContent?.(node.id, value)
              }
              readOnly={readOnly}
              placeholder="Enter text..."
            />
          </section>
        )}

        {/* Content — file input assets (image, audio, or empty) */}
        {isInput &&
          node.modality !== "text" &&
          node.modality !== "conversation" && (
            <section
              className={`${styles.section} ${styles.scrollableSection}`}
            >
              <label className={styles.sectionLabel}>Media Content</label>
              {node.content ? (
                <div className={styles.previewContainer}>
                  {node.modality === "image" ? (
                    <img /* eslint-disable-line @next/next/no-img-element */
                      src={PrismService.getFileUrl(node.content as string)}
                      alt="Input asset"
                      className={styles.previewImage}
                    />
                  ) : node.modality === "audio" ? (
                    <AudioPlayerRecorderComponent
                      src={PrismService.getFileUrl(node.content as string)}
                      compact
                    />
                  ) : node.modality === "video" ? (
                    <video
                      controls
                      src={PrismService.getFileUrl(node.content as string)}
                      className={styles.previewVideo}
                    />
                  ) : node.modality === "pdf" ? (
                    <div className={styles.previewPdfWrap}>
                      <iframe
                        src={PrismService.getFileUrl(node.content as string)}
                        className={styles.previewPdf}
                        title="PDF preview"
                      />
                    </div>
                  ) : (
                    <div className={styles.audioIndicator}>
                      <Paperclip size={16} />
                      <span>File attached</span>
                    </div>
                  )}
                  <button
                    className={styles.clearButton}
                    onClick={() => onUpdateFileInput?.(node.id, null, null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <AssetInputOptions
                  onFile={(dataUrl: string | ArrayBuffer | null, mimeType: string | null) =>
                    onUpdateFileInput?.(node.id, dataUrl, mimeType)
                  }
                />
              )}
            </section>
          )}

        {/* Conversation messages — conversation input nodes */}
        {isInput &&
          node.modality === "conversation" &&
          (node.messages || []).length > 0 &&
          (() => {
            // Build resolved messages by merging static template with connected input content
            const resolved = structuredClone(node.messages || []);
            for (const conn of incoming) {
              const dotIdx = conn.targetModality?.indexOf(".") ?? -1;
              if (dotIdx === -1) continue;
              const msgIdx = parseInt(conn.targetModality!.substring(0, dotIdx));
              const modality = conn.targetModality!.substring(dotIdx + 1);
              if (msgIdx < 0 || msgIdx >= resolved.length) continue;
              const sourceNode = (nodes || []).find(
                (n: WorkflowNode) => n.id === conn.sourceNodeId,
              );
              if (!sourceNode?.content) continue;
              const message = resolved[msgIdx];
              if (modality === "text") {
                message.content = message.content
                  ? `${message.content}\n\n${sourceNode.content as string}`
                  : (sourceNode.content as string);
              } else if (modality === "image") {
                message.images = [
                  ...(message.images || []),
                  "[image attached]",
                ];
              } else if (modality === "audio") {
                const existing = message.audio;
                const audioArr = Array.isArray(existing) ? existing : existing ? [existing] : [];
                message.audio = [...audioArr, "[audio attached]"];
              } else if (modality === "video") {
                const existing = message.video;
                const videoArr = Array.isArray(existing) ? existing : existing ? [existing] : [];
                message.video = [...videoArr, "[video attached]"];
              } else if (modality === "pdf") {
                const existing = message.pdf;
                const pdfArr = Array.isArray(existing) ? existing : existing ? [existing] : [];
                message.pdf = [...pdfArr, "[pdf attached]"];
              }
            }
            const resolveRef = (ref: string | ArrayBuffer | null | undefined): string | null => {
              if (typeof ref === "string" && ref.startsWith("minio://"))
                return PrismService.getFileUrl(ref);
              if (typeof ref === "string" && ref.startsWith("data:")) {
                const mime = ref.match(/^data:([^;]+)/)?.[1] || "unknown";
                return `[${mime} attached]`;
              }
              return ref as string | null;
            };
            const messagesJson = JSON.stringify(
              resolved.map(
                ({ role, content, images, audio, video, pdf }: Message) => ({
                  role,
                  content: content || "",
                  ...(images && images.length > 0
                    ? { images: images.map(resolveRef) }
                    : {}),
                  ...(audio && (Array.isArray(audio) ? audio.length > 0 : true)
                    ? { audio: (Array.isArray(audio) ? audio : [audio]).map(resolveRef) }
                    : {}),
                  ...(video && (Array.isArray(video) ? video.length > 0 : true)
                    ? { video: (Array.isArray(video) ? video : [video]).map(resolveRef) }
                    : {}),
                  ...(pdf && (Array.isArray(pdf) ? pdf.length > 0 : true)
                    ? { pdf: (Array.isArray(pdf) ? pdf : [pdf]).map(resolveRef) }
                    : {}),
                }),
              ),
              null,
              2,
            );
            return (
              <section
                className={`${styles.section} ${styles.scrollableSection}`}
              >
                <div className={styles.sectionHeaderRow}>
                  <label className={styles.sectionLabel}>
                    {conversationView === "json"
                      ? "Conversation JSON"
                      : "Conversation Preview"}
                  </label>
                  <div className={styles.contentTabs}>
                    <button
                      className={`${styles.contentTab} ${conversationView === "json" ? styles.contentTabActive : ""}`}
                      onClick={() => setConversationView("json")}
                    >
                      <Code size={10} />
                      JSON
                    </button>
                    <button
                      className={`${styles.contentTab} ${conversationView === "preview" ? styles.contentTabActive : ""}`}
                      onClick={() => setConversationView("preview")}
                    >
                      <BookOpen size={10} />
                      Preview
                    </button>
                  </div>
                </div>
                {conversationView === "preview" ? (
                  <div className={styles.conversationPreview}>
                    <MessageList messages={resolved} readOnly />
                  </div>
                ) : (
                  <MarkdownContent
                    content={`\`\`\`json\n${messagesJson}\n\`\`\``}
                  />
                )}
              </section>
            );
          })()}

        {/* Tool node — built-in + custom tool toggles */}
        {isTools &&
          (() => {
            const builtIn = (node.builtInTools || []) as Array<{ name: string; parameters?: { properties?: Record<string, any>; length?: number } }>;
            const custom = (node.customTools || []) as Array<{ name?: string; _id?: string; parameters?: { properties?: Record<string, any>; length?: number } }>;
            const disabled = new Set(node.disabledTools || []);
            const enabledCount =
              builtIn.filter((t) => !disabled.has(t.name)).length +
              custom.filter((t) => !disabled.has(t.name || t._id || "")).length;
            const totalCount = builtIn.length + custom.length;

            const toggleTool = (toolName: string) => {
              const next = new Set(disabled);
              if (next.has(toolName)) next.delete(toolName);
              else next.add(toolName);
              onUpdateNodeConfig?.(node.id, "disabledTools", [...next]);
            };

            const renderTool = (t: { name?: string; _id?: string; parameters?: { properties?: Record<string, any>; length?: number } }, key: string) => {
              const name = t.name || key;
              const isDisabled = disabled.has(name);
              const paramCount = t.parameters?.properties
                ? Object.keys(t.parameters.properties).length
                : t.parameters?.length || 0;
              const displayName = renderToolName(name);
              return (
                <div key={name} className={styles.toolRow}>
                  <div className={styles.toolRowLeft}>
                    <span
                      className={`${styles.toolRowName} ${isDisabled ? styles.toolRowNameDisabled : ""}`}
                    >
                      {displayName}
                    </span>
                    {paramCount > 0 && (
                      <span className={styles.toolRowParams}>
                        {paramCount} params
                      </span>
                    )}
                  </div>
                  <ToggleComponent
                    checked={!isDisabled}
                    onChange={() => toggleTool(name)}
                    size="mini"
                  />
                </div>
              );
            };

            return (
              <>
                <section className={styles.section}>
                  <div className={styles.toolSummary}>
                    <span className={styles.toolSummaryCount}>
                      {enabledCount}
                    </span>
                    <span className={styles.toolSummaryLabel}>
                      of {totalCount} tools enabled
                    </span>
                  </div>
                </section>

                {builtIn.length > 0 && (
                  <section className={styles.section}>
                    <button
                      className={styles.toolSectionToggle}
                      onClick={() => setToolBuiltInOpen((v) => !v)}
                    >
                      {toolBuiltInOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span>
                        Built-in (
                        {
                          builtIn.filter((t) => !disabled.has(t.name))
                            .length
                        }
                        /{builtIn.length})
                      </span>
                    </button>
                    {toolBuiltInOpen && (
                      <div className={styles.toolList}>
                        {builtIn.map((t) => renderTool(t, t.name))}
                      </div>
                    )}
                  </section>
                )}

                {custom.length > 0 && (
                  <section className={styles.section}>
                    <button
                      className={styles.toolSectionToggle}
                      onClick={() => setToolCustomOpen((v) => !v)}
                    >
                      {toolCustomOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span>
                        Custom (
                        {
                          custom.filter(
                            (t) => !disabled.has(t.name || t._id || ""),
                          ).length
                        }
                        /{custom.length})
                      </span>
                    </button>
                    {toolCustomOpen && (
                      <div className={styles.toolList}>
                        {custom.map((t) => renderTool(t, t.name || t._id || ""))}
                      </div>
                    )}
                  </section>
                )}
              </>
            );
          })()}

        {/* Generated Results — model nodes only */}
        {results && !results.error && !isViewer && !isInput && (
          <section className={`${styles.section} ${styles.scrollableSection}`}>
            <label className={styles.sectionLabel}>Generated Output</label>

            {results.image && (
              <div className={styles.resultBlock}>
                <span className={styles.resultType}>Image</span>
                <div className={styles.resultImageContainer}>
                  <img /* eslint-disable-line @next/next/no-img-element */
                    src={PrismService.getFileUrl(results.image)}
                    alt="Generated image"
                    className={styles.resultImage}
                  />
                  <a
                    href={PrismService.getFileUrl(results.image)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.expandButton}
                    title="Open full size"
                  >
                    <Maximize2 size={12} />
                  </a>
                </div>
              </div>
            )}

            {results.text && (
              <div className={styles.resultBlock}>
                <TextContentComponent
                  label="Text"
                  value={results.text}
                  readOnly
                />
              </div>
            )}

            {results.audio && (
              <div className={styles.resultBlock}>
                <span className={styles.resultType}>Audio</span>
                <AudioPlayerRecorderComponent
                  src={PrismService.getFileUrl(results.audio)}
                  compact
                />
              </div>
            )}

            {results.embedding && (
              <div className={styles.resultBlock}>
                <span className={styles.resultType}>
                  Embedding [{results.embedding.length} dims]
                </span>
                <div
                  className={styles.resultText}
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    maxHeight: "120px",
                    overflow: "auto",
                  }}
                >
                  [
                  {results.embedding
                    .slice(0, 8)
                    .map((v) => v.toFixed(6))
                    .join(", ")}
                  {results.embedding.length > 8 ? ", …" : ""}]
                </div>
                <button
                  className={styles.clearButton}
                  style={{ marginTop: "4px" }}
                  onClick={() =>
                    copyToClipboard(JSON.stringify(results.embedding))
                  }
                >
                  Copy All
                </button>
              </div>
            )}
          </section>
        )}

        {/* Viewer received content — show all types */}
        {isViewer &&
          receivedOutputs &&
          Object.keys(receivedOutputs).length > 0 && (
            <section
              className={`${styles.section} ${styles.scrollableSection}`}
            >
              {receivedOutputs.image && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>Image Content</span>
                  <div className={styles.resultImageContainer}>
                    <img /* eslint-disable-line @next/next/no-img-element */
                      src={PrismService.getFileUrl(receivedOutputs.image)}
                      alt="Received image"
                      className={styles.resultImage}
                    />
                    <a
                      href={PrismService.getFileUrl(receivedOutputs.image)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.expandButton}
                      title="Open full size"
                    >
                      <Maximize2 size={12} />
                    </a>
                  </div>
                </div>
              )}

              {receivedOutputs.text && (
                <div className={styles.resultBlock}>
                  <TextContentComponent
                    label="Text Content"
                    value={receivedOutputs.text}
                    readOnly
                  />
                </div>
              )}

              {receivedOutputs.audio && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>Audio Content</span>
                  <AudioPlayerRecorderComponent
                    src={PrismService.getFileUrl(receivedOutputs.audio)}
                    compact
                  />
                </div>
              )}

              {receivedOutputs.embedding && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>
                    Embedding Content [{receivedOutputs.embedding.length}{" "}
                    dims]
                  </span>
                  <div
                    className={styles.resultText}
                    style={{
                      fontSize: "11px",
                      fontFamily: "monospace",
                      maxHeight: "120px",
                      overflow: "auto",
                    }}
                  >
                    [
                    {receivedOutputs.embedding
                      .slice(0, 8)
                      .map((v) => v.toFixed(6))
                      .join(", ")}
                    {receivedOutputs.embedding.length > 8 ? ", …" : ""}]
                  </div>
                  <button
                    className={styles.clearButton}
                    style={{ marginTop: "4px" }}
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(receivedOutputs.embedding),
                      )
                    }
                  >
                    Copy All
                  </button>
                </div>
              )}
            </section>
          )}

        {/* Error */}
        {results?.error && (
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Error</label>
            <div className={styles.errorBlock}>{results.error}</div>
          </section>
        )}
      </div>
    </div>
  );
}
