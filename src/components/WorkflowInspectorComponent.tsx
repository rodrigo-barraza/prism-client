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
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 320;

function getStoredWidth() {
  try {
    const v = localStorage.getItem(LS_WORKFLOW_INSPECTOR_WIDTH);
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

/**
 * Right-side inspector panel that shows details about the selected workflow node.
 */
export default function WorkflowInspector({
  // @ts-ignore
  // @ts-ignore
  node: any,
  // @ts-ignore
  // @ts-ignore
  connections: any,
  // @ts-ignore
  // @ts-ignore
  nodes: any,
  allModels = [],
  // @ts-ignore
  // @ts-ignore
  nodeResults: any,
  // @ts-ignore
  // @ts-ignore
  nodeStatuses: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeConfig: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeContent: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateFileInput: any,
  // @ts-ignore
  // @ts-ignore
  onChangeModel: any,
  // @ts-ignore
  // @ts-ignore
  onSelectNode: any,
  // @ts-ignore
  // @ts-ignore
  onClose: any,
  readOnly = false,
}) {
  // Model change state (hooks must be called before any early return)
  const [modelSearch, setModelSearch] = useState<any>("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState<any>(false);
  const [conversationView, setConversationView] = useState<any>("json");
  const [toolBuiltInOpen, setToolBuiltInOpen] = useState<any>(true);
  const [toolCustomOpen, setToolCustomOpen] = useState<any>(true);

  // -- Resize logic --
  const [inspectorWidth, setInspectorWidth] = useState<any>(getStoredWidth);
  const isDragging = useRef<any>(false);

  const handleResizeStart = useCallback((e: any) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: any) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, window.innerWidth - ev.clientX),
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

  // @ts-ignore
  // @ts-ignore
  const isModel = node ? !node.nodeType : false;
  // @ts-ignore
  // @ts-ignore
  const isTools = node ? node.nodeType === "tools" : false;

  // Find incoming / outgoing connections
  const incoming = useMemo<any>(
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    () => (connections || []).filter((c: any) => node && c.targetNodeId === node.id),
    // @ts-ignore
    // @ts-ignore
    [connections, node],
  );
  const outgoing = useMemo<any>(
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    () => (connections || []).filter((c: any) => node && c.sourceNodeId === node.id),
    // @ts-ignore
    // @ts-ignore
    [connections, node],
  );

  // Compute compatible models based on connections
  const compatibleModels = useMemo<any>(() => {
    if (!isModel) return [];
    const requiredInputs = incoming.map((c: any) => c.targetModality);
    const requiredOutputs = outgoing.map((c: any) => c.sourceModality);

    return allModels.filter((m) => {
      // @ts-ignore
      const mInputs = m.inputTypes || [];
      // @ts-ignore
      const mOutputs = m.outputTypes || [];
      // Check input compatibility: conversation-type models accept "conversation" edges
      // Tools connections are always compatible with FC-capable models
      if (requiredInputs.length > 0) {
        const inputsOk = requiredInputs.every(
          (mod: any) =>
            mod === "tools" ||
            mInputs.includes(mod) ||
            // @ts-ignore
            (mod === "conversation" && m.modelType === "conversation"),
        );
        if (!inputsOk) return false;
      }
      if (
        requiredOutputs.length > 0 &&
        !requiredOutputs.every((mod: any) => mOutputs.includes(mod))
      )
        return false;
      return true;
    });
  }, [isModel, incoming, outgoing, allModels]);

  // Filtered by search
  const filteredModels = useMemo<any>(() => {
    if (!modelSearch.trim()) return compatibleModels;
    const q = modelSearch.trim().toLowerCase();
    return compatibleModels.filter((m: any) => {
      const name = m.display_name || m.label || m.name || "";
      const provider = m.provider || "";
      return (
        name.toLowerCase().includes(q) || provider.toLowerCase().includes(q)
      );
    });
  }, [compatibleModels, modelSearch]);

  // @ts-ignore
  if (!node) return null;

  // @ts-ignore
  // @ts-ignore
  const status = nodeStatuses?.[node.id];
  // @ts-ignore
  // @ts-ignore
  const results = nodeResults?.[node.id];
  // @ts-ignore
  const isInput = node.nodeType === "input";
  // @ts-ignore
  const isViewer = node.nodeType === "viewer";

  const getNodeLabel = (id: any) => {
    // @ts-ignore
    const n = (nodes || []).find((nd: any) => nd.id === id);
    if (!n) return id;
    if (n.nodeType === "input") {
      const labels = {
        text: "Text",
        image: "Image",
        audio: "Audio",
        video: "Video",
        pdf: "PDF",
        conversation: "Chat History",
      };
      // @ts-ignore
      return n.customName || labels[n.modality] || "Media";
    }
    if (n.nodeType === "viewer") return n.customName || "Output";
    if (n.nodeType === "tools") return n.customName || "Tools";
    return n.displayName || n.modelName || id;
  };

  const NODE_TYPE_LABELS = {
    text: "Text Node",
    image: "Image Node",
    audio: "Audio Node",
    video: "Video Node",
    pdf: "PDF Node",
    conversation: "Chat History Node",
  };

  const nodeSubtitle = isModel
    // @ts-ignore
    ? node.provider
    : isTools
      ? "Tool Calling"
      : isInput
        // @ts-ignore
        // @ts-ignore
        ? NODE_TYPE_LABELS[node.modality] || "Media Node"
        : "Output Node";

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
              {/* @ts-ignore */}
              <ProviderLogo provider={node.provider} size={18} />
            </div>
          )}
          {isInput && (
            <div
              className={styles.typeIcon}
              // @ts-ignore
              // @ts-ignore
              style={{ color: MODALITY_ICONS[node.modality]?.color }}
            >
              {/* @ts-ignore */}
              {node.modality === "text" ? (
                <Type size={16} />
              // @ts-ignore
              ) : node.modality === "audio" ? (
                <Volume2 size={16} />
              // @ts-ignore
              // @ts-ignore
              ) : MODALITY_ICONS[node.modality]?.icon ? (
                (() => {
                  // @ts-ignore
                  // @ts-ignore
                  const Icon = MODALITY_ICONS[node.modality].icon;
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
                // @ts-ignore
                // @ts-ignore
                ? node.displayName || node.modelName
                : isTools
                  // @ts-ignore
                  ? node.customName || "Tools"
                  : isInput
                    // @ts-ignore
                    ? node.customName ||
                      // @ts-ignore
                      {
                        text: "Text",
                        image: "Image",
                        audio: "Audio",
                        video: "Video",
                        pdf: "PDF",
                        conversation: "Chat History",
                      // @ts-ignore
                      }[node.modality] ||
                      "Media"
                    // @ts-ignore
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
        {/* @ts-ignore */}
        <button className={styles.closeBtn} onClick={onClose}>
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
                onClick={() => setModelDropdownOpen((prev: any) => !prev)}
              >
                <span className={styles.modelSelectorContent}>
                  {/* @ts-ignore */}
                  <ProviderLogo provider={node.provider} size={14} />
                  <span className={styles.modelSelectorLabel}>
                    // @ts-ignore
                    {/* @ts-ignore */}
                    {node.displayName || node.modelName}
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
                      onChange={(e) => setModelSearch(e.target.value)}
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
                      filteredModels.map((m: any) => {
                        const key = `${m.provider}:${m.name}`;
                        const isCurrent =
                          // @ts-ignore
                          m.name === node.modelName &&
                          // @ts-ignore
                          m.provider === node.provider;
                        return (
                          <button
                            key={key}
                            className={`${styles.modelDropdownItem} ${isCurrent ? styles.modelDropdownItemActive : ""}`}
                            onClick={() => {
                              // @ts-ignore
                              // @ts-ignore
                              onChangeModel?.(node.id, m);
                              setModelDropdownOpen(false);
                              setModelSearch("");
                            }}
                          >
                            <ProviderLogo provider={m.provider} size={13} />
                            <span className={styles.modelDropdownItemName}>
                              {m.display_name || m.label || m.name}
                            </span>
                            <span
                              className={styles.modelDropdownItemModalities}
                            >
                              {(m.rawInputTypes || m.inputTypes || []).map(
                                (t: any) => {
                                  // @ts-ignore
                                  const mod = MODALITY_ICONS[t];
                                  if (!mod) return null;
                                  const Icon = mod.icon;
                                  return (
                                    <Icon
                                      key={`in-${t}`}
                                      size={9}
                                      style={{ color: mod.color }}
                                    />
                                  );
                                },
                              )}
                              <span className={styles.modelDropdownItemArrow}>
                                →
                              </span>
                              {(m.outputTypes || []).map((t: any) => {
                                // @ts-ignore
                                const mod = MODALITY_ICONS[t];
                                if (!mod) return null;
                                const Icon = mod.icon;
                                return (
                                  <Icon
                                    key={`out-${t}`}
                                    size={9}
                                    style={{ color: mod.color }}
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
                {/* @ts-ignore */}
                <ProviderLogo provider={node.provider} size={14} />
                <span className={styles.modelSelectorLabel}>
                  // @ts-ignore
                  {/* @ts-ignore */}
                  {node.displayName || node.modelName}
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
              {incoming.map((c: any) => (
                <div
                  key={c.id}
                  className={`${styles.connectionItem} ${styles.connectionItemClickable}`}
                  role="button"
                  tabIndex={0}
                  // @ts-ignore
                  onClick={() => onSelectNode?.(c.sourceNodeId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      // @ts-ignore
                      onSelectNode?.(c.sourceNodeId);
                  }}
                >
                  <span
                    className={styles.connectionDot}
                    style={{
                      background:
                        // @ts-ignore
                        MODALITY_ICONS[c.targetModality]?.color || "#888",
                    }}
                  />
                  <span className={styles.connectionFrom}>
                    {getNodeLabel(c.sourceNodeId)}
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
              {outgoing.map((c: any) => (
                <div
                  key={c.id}
                  className={`${styles.connectionItem} ${styles.connectionItemClickable}`}
                  role="button"
                  tabIndex={0}
                  // @ts-ignore
                  onClick={() => onSelectNode?.(c.targetNodeId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      // @ts-ignore
                      onSelectNode?.(c.targetNodeId);
                  }}
                >
                  <span className={styles.connectionModality}>
                    {c.sourceModality}
                  </span>
                  <span className={styles.connectionArrow}>→</span>
                  <span className={styles.connectionTo}>
                    {getNodeLabel(c.targetNodeId)}
                  </span>
                  <span
                    className={styles.connectionDot}
                    style={{
                      background:
                        // @ts-ignore
                        MODALITY_ICONS[c.sourceModality]?.color || "#888",
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Content — text input assets */}
        {/* @ts-ignore */}
        {isInput && node.modality === "text" && (
          <section className={`${styles.section} ${styles.scrollableSection}`}>
            {/* @ts-ignore */}
            <TextContentComponent
              label="Text Content"
              // @ts-ignore
              value={node.content || ""}
              onChange={
                readOnly
                  ? undefined
                  // @ts-ignore
                  // @ts-ignore
                  : (val: any) => onUpdateNodeContent?.(node.id, val)
              }
              readOnly={readOnly}
              placeholder="Enter text..."
            />
          </section>
        )}

        {/* Content — file input assets (image, audio, or empty) */}
        {isInput &&
          // @ts-ignore
          node.modality !== "text" &&
          // @ts-ignore
          node.modality !== "conversation" && (
            <section
              className={`${styles.section} ${styles.scrollableSection}`}
            >
              <label className={styles.sectionLabel}>Media Content</label>
              {/* @ts-ignore */}
              {node.content ? (
                <div className={styles.previewContainer}>
                  {/* @ts-ignore */}
                  {node.modality === "image" ? (
                    <img /* eslint-disable-line @next/next/no-img-element */
                      // @ts-ignore
                      src={PrismService.getFileUrl(node.content)}
                      alt="Input asset"
                      className={styles.previewImage}
                    />
                  // @ts-ignore
                  ) : node.modality === "audio" ? (
                    // @ts-ignore
                    <AudioPlayerRecorderComponent
                      // @ts-ignore
                      src={PrismService.getFileUrl(node.content)}
                      compact
                    />
                  // @ts-ignore
                  ) : node.modality === "video" ? (
                    <video
                      controls
                      // @ts-ignore
                      src={PrismService.getFileUrl(node.content)}
                      className={styles.previewVideo}
                    />
                  // @ts-ignore
                  ) : node.modality === "pdf" ? (
                    <div className={styles.previewPdfWrap}>
                      <iframe
                        // @ts-ignore
                        src={PrismService.getFileUrl(node.content)}
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
                    className={styles.clearBtn}
                    // @ts-ignore
                    // @ts-ignore
                    onClick={() => onUpdateFileInput?.(node.id, null, null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <AssetInputOptions
                  onFile={(dataUrl: any, mimeType: any) =>
                    // @ts-ignore
                    // @ts-ignore
                    onUpdateFileInput?.(node.id, dataUrl, mimeType)
                  }
                />
              )}
            </section>
          )}

        {/* Conversation messages — conversation input nodes */}
        {isInput &&
          // @ts-ignore
          node.modality === "conversation" &&
          // @ts-ignore
          (node.messages || []).length > 0 &&
          (() => {
            // Build resolved messages by merging static template with connected input content
            // @ts-ignore
            const resolved = structuredClone(node.messages || []);
            for (const conn of incoming) {
              const dotIdx = conn.targetModality.indexOf(".");
              if (dotIdx === -1) continue;
              const msgIdx = parseInt(conn.targetModality.substring(0, dotIdx));
              const modality = conn.targetModality.substring(dotIdx + 1);
              if (msgIdx < 0 || msgIdx >= resolved.length) continue;
              // @ts-ignore
              const sourceNode = (nodes || []).find(
                (n: any) => n.id === conn.sourceNodeId,
              );
              if (!sourceNode?.content) continue;
              const msg = resolved[msgIdx];
              if (modality === "text") {
                msg.content = msg.content
                  ? `${msg.content}\n\n${sourceNode.content}`
                  : sourceNode.content;
              } else if (modality === "image") {
                msg.images = [...(msg.images || []), "[image attached]"];
              } else if (modality === "audio") {
                msg.audio = [...(msg.audio || []), "[audio attached]"];
              } else if (modality === "video") {
                msg.video = [...(msg.video || []), "[video attached]"];
              } else if (modality === "pdf") {
                msg.pdf = [...(msg.pdf || []), "[pdf attached]"];
              }
            }
            const resolveRef = (ref: any) => {
              if (typeof ref === "string" && ref.startsWith("minio://"))
                return PrismService.getFileUrl(ref);
              if (typeof ref === "string" && ref.startsWith("data:")) {
                const mime = ref.match(/^data:([^;]+)/)?.[1] || "unknown";
                return `[${mime} attached]`;
              }
              return ref;
            };
            const messagesJson = JSON.stringify(
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              // @ts-ignore
              resolved.map(({ role: any, content: any, images: any, audio: any, video: any, pdf: any }) => ({
                // @ts-ignore
                role,
                // @ts-ignore
                content: content || "",
                // @ts-ignore
                ...(images?.length > 0
                  // @ts-ignore
                  ? { images: images.map(resolveRef) }
                  : {}),
                // @ts-ignore
                // @ts-ignore
                ...(audio?.length > 0 ? { audio: audio.map(resolveRef) } : {}),
                // @ts-ignore
                // @ts-ignore
                ...(video?.length > 0 ? { video: video.map(resolveRef) } : {}),
                // @ts-ignore
                // @ts-ignore
                ...(pdf?.length > 0 ? { pdf: pdf.map(resolveRef) } : {}),
              })),
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
                    {/* @ts-ignore */}
                    <MessageList messages={resolved} readOnly />
                  </div>
                ) : (
                  // @ts-ignore
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
            // @ts-ignore
            const builtIn = node.builtInTools || [];
            // @ts-ignore
            const custom = node.customTools || [];
            // @ts-ignore
            const disabled = new Set(node.disabledTools || []);
            const enabledCount =
              builtIn.filter((t: any) => !disabled.has(t.name)).length +
              custom.filter((t: any) => !disabled.has(t.name || t._id)).length;
            const totalCount = builtIn.length + custom.length;

            const toggleTool = (toolName: any) => {
              const next = new Set(disabled);
              if (next.has(toolName)) next.delete(toolName);
              else next.add(toolName);
              // @ts-ignore
              // @ts-ignore
              onUpdateNodeConfig?.(node.id, "disabledTools", [...next]);
            };

            const renderTool = (t: any, key: any) => {
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
                      onClick={() => setToolBuiltInOpen((v: any) => !v)}
                    >
                      {toolBuiltInOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span>
                        Built-in (
                        {builtIn.filter((t: any) => !disabled.has(t.name)).length}/
                        {builtIn.length})
                      </span>
                    </button>
                    {toolBuiltInOpen && (
                      <div className={styles.toolList}>
                        {builtIn.map((t: any) => renderTool(t, t.name))}
                      </div>
                    )}
                  </section>
                )}

                {custom.length > 0 && (
                  <section className={styles.section}>
                    <button
                      className={styles.toolSectionToggle}
                      onClick={() => setToolCustomOpen((v: any) => !v)}
                    >
                      {toolCustomOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span>
                        Custom (
                        {
                          custom.filter((t: any) => !disabled.has(t.name || t._id))
                            .length
                        }
                        /{custom.length})
                      </span>
                    </button>
                    {toolCustomOpen && (
                      <div className={styles.toolList}>
                        {custom.map((t: any) => renderTool(t, t.name || t._id))}
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
                    className={styles.expandBtn}
                    title="Open full size"
                  >
                    <Maximize2 size={12} />
                  </a>
                </div>
              </div>
            )}

            {results.text && (
              <div className={styles.resultBlock}>
                {/* @ts-ignore */}
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
                {/* @ts-ignore */}
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
                    .map((v: any) => v.toFixed(6))
                    .join(", ")}
                  {results.embedding.length > 8 ? ", …" : ""}]
                </div>
                <button
                  className={styles.clearBtn}
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
          // @ts-ignore
          node.receivedOutputs &&
          // @ts-ignore
          Object.keys(node.receivedOutputs).length > 0 && (
            <section
              className={`${styles.section} ${styles.scrollableSection}`}
            >
              {/* @ts-ignore */}
              {node.receivedOutputs.image && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>Image Content</span>
                  <div className={styles.resultImageContainer}>
                    <img /* eslint-disable-line @next/next/no-img-element */
                      // @ts-ignore
                      src={PrismService.getFileUrl(node.receivedOutputs.image)}
                      alt="Received image"
                      className={styles.resultImage}
                    />
                    <a
                      // @ts-ignore
                      href={PrismService.getFileUrl(node.receivedOutputs.image)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.expandBtn}
                      title="Open full size"
                    >
                      <Maximize2 size={12} />
                    </a>
                  </div>
                </div>
              )}

              {/* @ts-ignore */}
              {node.receivedOutputs.text && (
                <div className={styles.resultBlock}>
                  {/* @ts-ignore */}
                  <TextContentComponent
                    label="Text Content"
                    // @ts-ignore
                    value={node.receivedOutputs.text}
                    readOnly
                  />
                </div>
              )}

              {/* @ts-ignore */}
              {node.receivedOutputs.audio && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>Audio Content</span>
                  {/* @ts-ignore */}
                  <AudioPlayerRecorderComponent
                    // @ts-ignore
                    src={PrismService.getFileUrl(node.receivedOutputs.audio)}
                    compact
                  />
                </div>
              )}

              {/* @ts-ignore */}
              {node.receivedOutputs.embedding && (
                <div className={styles.resultBlock}>
                  <span className={styles.resultType}>
                    {/* @ts-ignore */}
                    Embedding Content [{node.receivedOutputs.embedding.length}{" "}
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
                    {/* @ts-ignore */}
                    {node.receivedOutputs.embedding
                      .slice(0, 8)
                      .map((v: any) => v.toFixed(6))
                      .join(", ")}
                    {/* @ts-ignore */}
                    {node.receivedOutputs.embedding.length > 8 ? ", …" : ""}]
                  </div>
                  <button
                    className={styles.clearBtn}
                    style={{ marginTop: "4px" }}
                    onClick={() =>
                      copyToClipboard(
                        // @ts-ignore
                        JSON.stringify(node.receivedOutputs.embedding),
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
