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
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { copyToClipboard } from "../utils/utilities";
import MarkdownContent from "./MarkdownContentComponent";
import TextContentComponent from "./TextContentComponent";
import MessageList from "./MessageListComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import AssetInputOptions from "./AssetInputOptionsComponent";
import { ToggleComponent } from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import styles from "./WorkflowInspectorComponent.module.css";
import { LS_WORKFLOW_INSPECTOR_WIDTH } from "../constants";
import {
  ModelOption,
  WorkflowConnection,
  WorkflowNode,
  WorkflowNodeStatus,
  Message,
} from "../types/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 320;

function getStoredWidth(): number {
  try {
    const storedWidth = localStorage.getItem(LS_WORKFLOW_INSPECTOR_WIDTH);
    if (storedWidth) {
      const parsedWidth = parseInt(storedWidth, 10);
      if (
        !isNaN(parsedWidth) &&
        parsedWidth >= MIN_WIDTH &&
        parsedWidth <= MAX_WIDTH
      )
        return parsedWidth;
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
  connections: WorkflowConnection[];
  nodes: WorkflowNode[];
  allModels?: ModelOption[];
  nodeResults?: Record<string, NodeResult | null | undefined>;
  nodeStatuses?: Record<string, string>;
  onUpdateNodeConfig?: (nodeId: string, key: string, value: unknown) => void;
  onUpdateNodeContent?: (nodeId: string, content: string) => void;
  onUpdateFileInput?: (
    nodeId: string,
    fileData: string | ArrayBuffer | null,
    mimeType: string | null,
  ) => void;
  onChangeModel?: (nodeId: string, model: ModelOption) => void;
  onSelectNode?: (nodeId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

const getModalityIcon = (modality: string | null | undefined) => {
  if (!modality) return null;
  const icons = MODALITY_ICONS as Record<
    string,
    | {
        icon: React.ComponentType<{
          size?: number;
          className?: string;
          style?: React.CSSProperties;
        }>;
        label: string;
        color: string;
      }
    | undefined
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
        (edge: WorkflowConnection) => node && edge.targetNodeId === node.id,
      ),
    [connections, node],
  );
  const outgoing = useMemo(
    () =>
      (connections || []).filter(
        (edge: WorkflowConnection) => node && edge.sourceNodeId === node.id,
      ),
    [connections, node],
  );

  // Compute compatible models based on connections
  const compatibleModels = useMemo(() => {
    if (!isModel) return [];
    const requiredInputs = incoming.map((edge: WorkflowConnection) => edge.targetModality);
    const requiredOutputs = outgoing.map((edge: WorkflowConnection) => edge.sourceModality);

    return allModels.filter((modelOption: ModelOption) => {
      const mInputs = modelOption.inputTypes || [];
      const mOutputs = modelOption.outputTypes || [];
      // Check input compatibility: conversation-type models accept "conversation" edges
      // Tools connections are always compatible with FC-capable models
      if (requiredInputs.length > 0) {
        const inputsOk = requiredInputs.every(
          (modality: string | undefined) =>
            modality === "tools" ||
            mInputs.includes(modality || "") ||
            (modality === "conversation" && modelOption.modelType === "conversation"),
        );
        if (!inputsOk) return false;
      }
      if (
        requiredOutputs.length > 0 &&
        !requiredOutputs.every((modality: string | undefined) =>
          mOutputs.includes(modality || ""),
        )
      )
        return false;
      return true;
    });
  }, [isModel, incoming, outgoing, allModels]);

  // Filtered by search
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return compatibleModels;
    const normalizedSearch = modelSearch.trim().toLowerCase();
    return compatibleModels.filter((modelOption: ModelOption) => {
      const name = modelOption.display_name || modelOption.label || modelOption.name || "";
      const provider = modelOption.provider || "";
      return (
        name.toLowerCase().includes(normalizedSearch) ||
        provider.toLowerCase().includes(normalizedSearch)
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
      const key =
        typeof matchedNode.modality === "string" ? matchedNode.modality : "";
      return matchedNode.customName || labels[key] || "Media";
    }
    if (matchedNode.nodeType === "viewer")
      return matchedNode.customName || "Output";
    if (matchedNode.nodeType === "tools")
      return matchedNode.customName || "Tools";
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
        ? (typeof node.modality === "string"
            ? NODE_TYPE_LABELS[node.modality]
            : "") || "Media Node"
        : "Output Node";

  const receivedOutputs = node.receivedOutputs as
    | {
        image?: string;
        text?: string;
        audio?: string;
        embedding?: number[];
      }
    | undefined;

  return (
    <div
      className={`workflow-inspector-component ${styles['inspector']}`}
      style={{ width: inspectorWidth, minWidth: MIN_WIDTH }}
    >
      <div className={styles['resize-handle']} onMouseDown={handleResizeStart} />
      {/* Header */}
      <div className={styles['header']}>
        <div className={styles['header-left']}>
          {isModel && (
            <div className={styles['provider-icon']}>
              <ProviderLogo provider={node.provider || ""} size={18} />
            </div>
          )}
          {isInput && (
            <div
              className={styles['type-icon']}
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
            <div className={styles['type-icon']} style={{ color: "#a78bfa" }}>
              <Eye size={16} />
            </div>
          )}
          {isTools && (
            <div className={styles['type-icon']} style={{ color: "#f97316" }}>
              <Parentheses size={16} />
            </div>
          )}
          <div className={styles['header-info']}>
            <span className={styles['header-title']}>
              {isModel
                ? (node.displayName as string) || node.modelName
                : isTools
                  ? node.customName || "Tools"
                  : isInput
                    ? node.customName ||
                      (
                        {
                          text: "Text",
                          image: "Image",
                          audio: "Audio",
                          video: "Video",
                          pdf: "PDF",
                          conversation: "Chat History",
                        } as Record<string, string>
                      )[
                        typeof node.modality === "string" ? node.modality : ""
                      ] ||
                      "Media"
                    : node.customName || "Output"}
            </span>
            <span className={styles['header-subtitle']}>
              {nodeSubtitle}
              {status && (
                <span
                  className={`${styles['status-badge']} ${styles[`status-${status}`] || ""}`}
                >
                  {status}
                </span>
              )}
            </span>
          </div>
        </div>
        <button className={styles['close-button']} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className={styles['body']}>
        {/* Model selector — model nodes only, hidden in readOnly */}
        {isModel && !readOnly && (
          <section className={styles['section']}>
            <label className={styles['section-label']}>Model</label>
            <div className={styles['model-selector']}>
              <button
                className={`${styles['model-selector-trigger']} ${modelDropdownOpen ? styles['model-selector-trigger-open'] : ""}`}
                onClick={() => setModelDropdownOpen((previousOpenState) => !previousOpenState)}
              >
                <span className={styles['model-selector-content']}>
                  <ProviderLogo provider={node.provider || ""} size={14} />
                  <span className={styles['model-selector-label']}>
                    {(node.displayName as string) || node.modelName}
                  </span>
                </span>
                <ChevronDown
                  size={12}
                  className={`${styles['model-selector-chevron']} ${modelDropdownOpen ? styles['model-selector-chevron-open'] : ""}`}
                />
              </button>

              {modelDropdownOpen && (
                <div className={styles['model-dropdown']}>
                  <div className={styles['model-dropdown-search']}>
                    <Search
                      size={11}
                      className={styles['model-dropdown-search-icon']}
                    />
                    <input
                      type="text"
                      className={styles['model-dropdown-search-input']}
                      placeholder="Search models…"
                      value={modelSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setModelSearch(e.target.value)
                      }
                      autoFocus
                    />
                    {modelSearch && (
                      <button
                        className={styles['model-dropdown-search-clear']}
                        onClick={() => setModelSearch("")}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <div className={styles['model-dropdown-list']}>
                    {filteredModels.length === 0 ? (
                      <div className={styles['model-dropdown-empty']}>
                        No compatible models found
                      </div>
                    ) : (
                      filteredModels.map((modelOption: ModelOption) => {
                        const key = `${modelOption.provider}:${modelOption.name}`;
                        const isCurrent =
                          modelOption.name === node.modelName &&
                          modelOption.provider === node.provider;
                        return (
                          <button
                            key={key}
                            className={`${styles['model-dropdown-item']} ${isCurrent ? styles['model-dropdown-item-is-active-state'] : ""}`}
                            onClick={() => {
                              onChangeModel?.(node.id, modelOption);
                              setModelDropdownOpen(false);
                              setModelSearch("");
                            }}
                          >
                            <ProviderLogo
                              provider={modelOption.provider || ""}
                              size={13}
                            />
                            <span className={styles['model-dropdown-item-name']}>
                              {modelOption.display_name || modelOption.label || modelOption.name}
                            </span>
                            <span
                              className={styles['model-dropdown-item-modalities']}
                            >
                              {(modelOption.rawInputTypes || modelOption.inputTypes || []).map(
                                (modalityType: string) => {
                                  const modalityIcon = getModalityIcon(modalityType);
                                  if (!modalityIcon) return null;
                                  const Icon = modalityIcon.icon;
                                  return (
                                    <Icon
                                      key={`in-${modalityType}`}
                                      size={9}
                                      style={{ color: modalityIcon.color }}
                                    />
                                  );
                                },
                              )}
                              <span className={styles['model-dropdown-item-arrow']}>
                                →
                              </span>
                              {(modelOption.outputTypes || []).map((modalityType: string) => {
                                const modalityIcon = getModalityIcon(modalityType);
                                if (!modalityIcon) return null;
                                const Icon = modalityIcon.icon;
                                return (
                                  <Icon
                                    key={`out-${modalityType}`}
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
          <section className={styles['section']}>
            <label className={styles['section-label']}>Model</label>
            <div
              className={styles['model-selector-trigger']}
              style={{ cursor: "default" }}
            >
              <span className={styles['model-selector-content']}>
                <ProviderLogo provider={node.provider || ""} size={14} />
                <span className={styles['model-selector-label']}>
                  {(node.displayName as string) || node.modelName}
                </span>
              </span>
            </div>
          </section>
        )}

        {/* Input Ports */}
        {incoming.length > 0 && (
          <section className={styles['section']}>
            <label className={styles['section-label']}>Input Ports</label>
            <div className={styles['connection-list']}>
              {incoming.map((edge: WorkflowConnection) => (
                <div
                  key={edge.id}
                  className={`${styles['connection-item']} ${styles['connection-item-clickable']}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectNode?.(edge.sourceNodeId || "")}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ")
                      onSelectNode?.(edge.sourceNodeId || "");
                  }}
                >
                  <span
                    className={styles['connection-dot']}
                    style={{
                      background:
                        getModalityIcon(edge.targetModality)?.color || "#888",
                    }}
                  />
                  <span className={styles['connection-from']}>
                    {getNodeLabel(edge.sourceNodeId || "")}
                  </span>
                  <span className={styles['connection-arrow']}>→</span>
                  <span className={styles['connection-modality']}>
                    {edge.targetModality}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Output Ports */}
        {outgoing.length > 0 && (
          <section className={styles['section']}>
            <label className={styles['section-label']}>Output Ports</label>
            <div className={styles['connection-list']}>
              {outgoing.map((edge: WorkflowConnection) => (
                <div
                  key={edge.id}
                  className={`${styles['connection-item']} ${styles['connection-item-clickable']}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectNode?.(edge.targetNodeId || "")}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ")
                      onSelectNode?.(edge.targetNodeId || "");
                  }}
                >
                  <span className={styles['connection-modality']}>
                    {edge.sourceModality}
                  </span>
                  <span className={styles['connection-arrow']}>→</span>
                  <span className={styles['connection-to']}>
                    {getNodeLabel(edge.targetNodeId || "")}
                  </span>
                  <span
                    className={styles['connection-dot']}
                    style={{
                      background:
                        getModalityIcon(edge.sourceModality)?.color || "#888",
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Content — text input assets */}
        {isInput && node.modality === "text" && (
          <section className={`${styles['section']} ${styles['scrollable-section']}`}>
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
              className={`${styles['section']} ${styles['scrollable-section']}`}
            >
              <label className={styles['section-label']}>Media Content</label>
              {node.content ? (
                <div className={styles['preview-container']}>
                  {node.modality === "image" ? (
                    <img /* eslint-disable-line @next/next/no-img-element */
                      src={PrismService.getFileUrl(node.content as string)}
                      alt="Input asset"
                      className={styles['preview-image']}
                    />
                  ) : node.modality === "audio" ? (
                    <AudioPlayerRecorderComponent
                      sourceUrl={PrismService.getFileUrl(node.content as string)}
                      compact
                    />
                  ) : node.modality === "video" ? (
                    <video
                      controls
                      src={PrismService.getFileUrl(node.content as string)}
                      className={styles['preview-video']}
                    />
                  ) : node.modality === "pdf" ? (
                    <div className={styles['preview-pdf-wrap']}>
                      <iframe
                        src={PrismService.getFileUrl(node.content as string)}
                        className={styles['preview-pdf']}
                        title="PDF preview"
                      />
                    </div>
                  ) : (
                    <div className={styles['audio-indicator']}>
                      <Paperclip size={16} />
                      <span>File attached</span>
                    </div>
                  )}
                  <button
                    className={styles['clear-button']}
                    onClick={() => onUpdateFileInput?.(node.id, null, null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <AssetInputOptions
                  onFile={(
                    dataUrl: string | ArrayBuffer | null,
                    mimeType: string | null,
                  ) => onUpdateFileInput?.(node.id, dataUrl, mimeType)}
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
              const dotIndex = conn.targetModality?.indexOf(".") ?? -1;
              if (dotIndex === -1) continue;
              const messageIndex = parseInt(
                conn.targetModality!.substring(0, dotIndex),
              );
              const modality = conn.targetModality!.substring(dotIndex + 1);
              if (messageIndex < 0 || messageIndex >= resolved.length) continue;
              const sourceNode = (nodes || []).find(
                (nodeItem: WorkflowNode) => nodeItem.id === conn.sourceNodeId,
              );
              if (!sourceNode?.content) continue;
              const message = resolved[messageIndex];
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
                const audioArray = Array.isArray(existing)
                  ? existing
                  : existing
                    ? [existing]
                    : [];
                message.audio = [...audioArray, "[audio attached]"];
              } else if (modality === "video") {
                const existing = message.video;
                const videoArray = Array.isArray(existing)
                  ? existing
                  : existing
                    ? [existing]
                    : [];
                message.video = [...videoArray, "[video attached]"];
              } else if (modality === "pdf") {
                const existing = message.pdf;
                const pdfArray = Array.isArray(existing)
                  ? existing
                  : existing
                    ? [existing]
                    : [];
                message.pdf = [...pdfArray, "[pdf attached]"];
              }
            }
            const resolveRef = (
              ref: string | ArrayBuffer | null | undefined,
            ): string | null => {
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
                    ? {
                        audio: (Array.isArray(audio) ? audio : [audio]).map(
                          resolveRef,
                        ),
                      }
                    : {}),
                  ...(video && (Array.isArray(video) ? video.length > 0 : true)
                    ? {
                        video: (Array.isArray(video) ? video : [video]).map(
                          resolveRef,
                        ),
                      }
                    : {}),
                  ...(pdf && (Array.isArray(pdf) ? pdf.length > 0 : true)
                    ? {
                        pdf: (Array.isArray(pdf) ? pdf : [pdf]).map(resolveRef),
                      }
                    : {}),
                }),
              ),
              null,
              2,
            );
            return (
              <section
                className={`${styles['section']} ${styles['scrollable-section']}`}
              >
                <div className={styles['section-header-layout-row']}>
                  <label className={styles['section-label']}>
                    {conversationView === "json"
                      ? "Conversation JSON"
                      : "Conversation Preview"}
                  </label>
                  <div className={styles['content-tabs']}>
                    <button
                      className={`${styles['content-tab']} ${conversationView === "json" ? styles['content-tab-is-active-state'] : ""}`}
                      onClick={() => setConversationView("json")}
                    >
                      <Code size={10} />
                      JSON
                    </button>
                    <button
                      className={`${styles['content-tab']} ${conversationView === "preview" ? styles['content-tab-is-active-state'] : ""}`}
                      onClick={() => setConversationView("preview")}
                    >
                      <BookOpen size={10} />
                      Preview
                    </button>
                  </div>
                </div>
                {conversationView === "preview" ? (
                  <div className={styles['conversation-preview']}>
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

        {/* Tool node — built-in tool toggles */}
        {isTools &&
          (() => {
            const builtIn = (node.builtInTools || []) as Array<{
              name: string;
              parameters?: {
                properties?: Record<string, any>;
                length?: number;
              };
            }>;
            const disabled = new Set(node.disabledTools || []);
            const enabledCount =
              builtIn.filter((tool) => !disabled.has(tool.name)).length;
            const totalCount = builtIn.length;

            const toggleTool = (toolName: string) => {
              const next = new Set(disabled);
              if (next.has(toolName)) next.delete(toolName);
              else next.add(toolName);
              onUpdateNodeConfig?.(node.id, "disabledTools", [...next]);
            };

            const renderTool = (
              tool: {
                name?: string;
                parameters?: {
                  properties?: Record<string, any>;
                  length?: number;
                };
              },
              key: string,
            ) => {
              const name = tool.name || key;
              const isDisabled = disabled.has(name);
              const paramCount = tool.parameters?.properties
                ? Object.keys(tool.parameters.properties).length
                : tool.parameters?.length || 0;
              const displayName = renderToolName(name);
              return (
                <div key={name} className={styles['tool-layout-row']}>
                  <div className={styles['tool-layout-row-left']}>
                    <span
                      className={`${styles['tool-layout-row-name']} ${isDisabled ? styles['tool-layout-row-name-disabled'] : ""}`}
                    >
                      {displayName}
                    </span>
                    {paramCount > 0 && (
                      <span className={styles['tool-layout-row-params']}>
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
                <section className={styles['section']}>
                  <div className={styles['tool-summary']}>
                    <span className={styles['tool-summary-count']}>
                      {enabledCount}
                    </span>
                    <span className={styles['tool-summary-label']}>
                      of {totalCount} tools enabled
                    </span>
                  </div>
                </section>

                {builtIn.length > 0 && (
                  <section className={styles['section']}>
                    <button
                      className={styles['tool-section-toggle']}
                      onClick={() => setToolBuiltInOpen((value) => !value)}
                    >
                      {toolBuiltInOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span>
                        Built-in (
                        {builtIn.filter((tool) => !disabled.has(tool.name)).length}/
                        {builtIn.length})
                      </span>
                    </button>
                    {toolBuiltInOpen && (
                      <div className={styles['tool-list']}>
                        {builtIn.map((tool) => renderTool(tool, tool.name))}
                      </div>
                    )}
                  </section>
                )}
              </>
            );
          })()}

        {/* Generated Results — model nodes only */}
        {results && !results.error && !isViewer && !isInput && (
          <section className={`${styles['section']} ${styles['scrollable-section']}`}>
            <label className={styles['section-label']}>Generated Output</label>

            {results.image && (
              <div className={styles['result-block']}>
                <span className={styles['result-type']}>Image</span>
                <div className={styles['result-image-container']}>
                  <img /* eslint-disable-line @next/next/no-img-element */
                    src={PrismService.getFileUrl(results.image)}
                    alt="Generated image"
                    className={styles['result-image']}
                  />
                  <a
                    href={PrismService.getFileUrl(results.image)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles['expand-button']}
                    title="Open full size"
                  >
                    <Maximize2 size={12} />
                  </a>
                </div>
              </div>
            )}

            {results.text && (
              <div className={styles['result-block']}>
                <TextContentComponent
                  label="Text"
                  value={results.text}
                  readOnly
                />
              </div>
            )}

            {results.audio && (
              <div className={styles['result-block']}>
                <span className={styles['result-type']}>Audio</span>
                <AudioPlayerRecorderComponent
                  sourceUrl={PrismService.getFileUrl(results.audio)}
                  compact
                />
              </div>
            )}

            {results.embedding && (
              <div className={styles['result-block']}>
                <span className={styles['result-type']}>
                  Embedding [{results.embedding.length} dims]
                </span>
                <div
                  className={styles['result-text']}
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
                    .map((value) => value.toFixed(6))
                    .join(", ")}
                  {results.embedding.length > 8 ? ", …" : ""}]
                </div>
                <button
                  className={styles['clear-button']}
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
              className={`${styles['section']} ${styles['scrollable-section']}`}
            >
              {receivedOutputs.image && (
                <div className={styles['result-block']}>
                  <span className={styles['result-type']}>Image Content</span>
                  <div className={styles['result-image-container']}>
                    <img /* eslint-disable-line @next/next/no-img-element */
                      src={PrismService.getFileUrl(receivedOutputs.image)}
                      alt="Received image"
                      className={styles['result-image']}
                    />
                    <a
                      href={PrismService.getFileUrl(receivedOutputs.image)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles['expand-button']}
                      title="Open full size"
                    >
                      <Maximize2 size={12} />
                    </a>
                  </div>
                </div>
              )}

              {receivedOutputs.text && (
                <div className={styles['result-block']}>
                  <TextContentComponent
                    label="Text Content"
                    value={receivedOutputs.text}
                    readOnly
                  />
                </div>
              )}

              {receivedOutputs.audio && (
                <div className={styles['result-block']}>
                  <span className={styles['result-type']}>Audio Content</span>
                  <AudioPlayerRecorderComponent
                    sourceUrl={PrismService.getFileUrl(receivedOutputs.audio)}
                    compact
                  />
                </div>
              )}

              {receivedOutputs.embedding && (
                <div className={styles['result-block']}>
                  <span className={styles['result-type']}>
                    Embedding Content [{receivedOutputs.embedding.length} dims]
                  </span>
                  <div
                    className={styles['result-text']}
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
                      .map((value) => value.toFixed(6))
                      .join(", ")}
                    {receivedOutputs.embedding.length > 8 ? ", …" : ""}]
                  </div>
                  <button
                    className={styles['clear-button']}
                    style={{ marginTop: "4px" }}
                    onClick={() =>
                      copyToClipboard(JSON.stringify(receivedOutputs.embedding))
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
          <section className={styles['section']}>
            <label className={styles['section-label']}>Error</label>
            <div className={styles['error-block']}>{results.error}</div>
          </section>
        )}
      </div>
    </div>
  );
}
