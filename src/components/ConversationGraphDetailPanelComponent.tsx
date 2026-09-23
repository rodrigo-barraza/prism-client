"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Wrench,
  X,
} from "lucide-react";
import type { GraphNode } from "@rodrigo-barraza/utilities-library/graph";
import {
  formatCost,
  formatElapsedTime,
  formatNumber,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";
import IrisService, { type IrisRequestEntry } from "../services/IrisService";
import { cleanModelName } from "./BadgeComponent";
import { resolveProviderLabel } from "./ProviderLogosComponent";
import {
  NODE_LABELS,
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  isFailedRequest,
  isPendingRequest,
  requestToolNames,
} from "../utils/conversationGraphModel";
import styles from "./ConversationGraphDetailPanelComponent.module.css";

interface ConversationGraphDetailPanelProps {
  node: GraphNode;
  color: string;
  connectionCount: number;
  toolEmojiMap: Map<string, string>;
  onClose: () => void;
  onCenter: () => void;
}

const PAYLOAD_PREVIEW_LIMIT = 500;

function metadataNumber(node: GraphNode, key: string): number | null {
  const value = node.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataString(node: GraphNode, key: string): string | null {
  const value = node.metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

function preview(text: string): string {
  return text.length > PAYLOAD_PREVIEW_LIMIT ? `${text.slice(0, PAYLOAD_PREVIEW_LIMIT)}…` : text;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles['detail-row']}>
      <span className={styles['detail-row-label']}>{label}</span>
      <span className={styles['detail-row-value']}>{value}</span>
    </div>
  );
}

function CopyableIdRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className={styles['detail-row']}>
      <span className={styles['detail-row-label']}>{label}</span>
      <button
        type="button"
        className={styles['detail-copy-button']}
        title={value}
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {});
        }}
      >
        <span className={styles['detail-copy-value']}>{value.length > 14 ? `${value.slice(0, 12)}…` : value}</span>
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles['detail-section']}>
      <h3 className={styles['detail-section-title']}>{title}</h3>
      {children}
    </section>
  );
}

function StatusChip({ node }: { node: GraphNode }) {
  if (node.category !== "request") return null;
  const status = node.id === PROACTIVE_PENDING_REQUEST_NODE_ID || isPendingRequest(node)
    ? "running"
    : isFailedRequest(node)
      ? "failed"
      : "completed";
  return (
    <span className={`${styles['status-chip']} ${styles[`status-chip-${status}`]}`}>
      {status === "running" ? <Loader2 size={10} className={styles['spinning-icon']} /> : status === "failed" ? <AlertTriangle size={10} /> : <Check size={10} />}
      {status}
    </span>
  );
}

function ToolChips({ toolNames, toolEmojiMap }: { toolNames: string[]; toolEmojiMap: Map<string, string> }) {
  return (
    <div className={styles['tool-chip-row']}>
      {toolNames.map((toolName) => {
        const toolEmoji = toolEmojiMap.get(toolName);
        return (
          <span key={toolName} className={styles['tool-chip']}>
            {toolEmoji?.startsWith("http")
              ? <img src={toolEmoji} alt="" className={styles['tool-chip-image']} />
              : <span aria-hidden="true">{toolEmoji || "⚙"}</span>}
            {toolName}
          </span>
        );
      })}
    </div>
  );
}

function CollapsibleHeader({
  label,
  icon: IconComponent,
  badgeCount,
  isExpanded,
  onToggle,
}: {
  label: string;
  icon: ComponentType<{ size?: number }>;
  badgeCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles['collapsible-header']} onClick={onToggle} aria-expanded={isExpanded}>
      <span className={styles['collapsible-header-left']}>
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <IconComponent size={12} />
        {label}
      </span>
      {badgeCount != null && badgeCount > 0 && <span className={styles['collapsible-badge']}>{badgeCount}</span>}
    </button>
  );
}

interface RequestPayloadMessage {
  role?: string;
  content?: string | unknown[] | null;
}

interface RequestPayloadToolCall {
  name: string;
  args?: unknown;
}

function RequestPayloads({ requestDetail }: { requestDetail: IrisRequestEntry }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggle = (sectionKey: string) => setExpandedSections((previous) => {
    const next = new Set(previous);
    if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
    return next;
  });

  const requestPayload = requestDetail.requestPayload as { messages?: RequestPayloadMessage[] } | null;
  const responsePayload = requestDetail.responsePayload as {
    text?: string | null;
    thinking?: string | null;
    images?: string[];
    toolCalls?: RequestPayloadToolCall[] | null;
  } | null;

  const userMessages = (requestPayload?.messages || []).filter((message) => message.role === "user" && message.content);
  const outputText = responsePayload?.text || null;
  const thinkingText = responsePayload?.thinking || null;
  const outputImages = responsePayload?.images || [];
  const outputToolCalls = responsePayload?.toolCalls || [];

  if (userMessages.length === 0 && !outputText && !thinkingText && outputImages.length === 0 && outputToolCalls.length === 0) {
    return null;
  }

  return (
    <div className={styles['payloads']}>
      {userMessages.length > 0 && (
        <div className={styles['payload-section']}>
          <CollapsibleHeader label="Input" icon={MessageSquare} badgeCount={userMessages.length} isExpanded={expandedSections.has("input")} onToggle={() => toggle("input")} />
          {expandedSections.has("input") && (
            <div className={styles['payload-content']}>
              {userMessages.map((message, messageIndex) => (
                <div key={messageIndex} className={styles['message-block']}>
                  <span className={styles['role-badge']}>{message.role || "user"}</span>
                  <div className={styles['message-content']}>
                    {preview(typeof message.content === "string" ? message.content : JSON.stringify(message.content))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(outputText || thinkingText) && (
        <div className={styles['payload-section']}>
          <CollapsibleHeader label="Output" icon={FileText} isExpanded={expandedSections.has("output")} onToggle={() => toggle("output")} />
          {expandedSections.has("output") && (
            <div className={styles['payload-content']}>
              {thinkingText && (
                <div className={styles['message-block']}>
                  <span className={`${styles['role-badge']} ${styles['role-badge-thinking']}`}>thinking</span>
                  <div className={styles['message-content']}>{preview(thinkingText)}</div>
                </div>
              )}
              {outputText && (
                <div className={styles['message-block']}>
                  <span className={`${styles['role-badge']} ${styles['role-badge-assistant']}`}>assistant</span>
                  <div className={styles['message-content']}>{preview(outputText)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {outputImages.length > 0 && (
        <div className={styles['payload-section']}>
          <CollapsibleHeader label="Generated Assets" icon={ImageIcon} badgeCount={outputImages.length} isExpanded={expandedSections.has("assets")} onToggle={() => toggle("assets")} />
          {expandedSections.has("assets") && (
            <div className={`${styles['payload-content']} ${styles['assets-grid']}`}>
              {outputImages.map((imageUrl, imageIndex) => (
                <a key={imageIndex} href={imageUrl} target="_blank" rel="noopener noreferrer" className={styles['asset-link']}>
                  <img src={imageUrl} alt={`Generated asset ${imageIndex + 1}`} className={styles['asset-image']} loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {outputToolCalls.length > 0 && (
        <div className={styles['payload-section']}>
          <CollapsibleHeader label="Tool Calls" icon={Wrench} badgeCount={outputToolCalls.length} isExpanded={expandedSections.has("tools")} onToggle={() => toggle("tools")} />
          {expandedSections.has("tools") && (
            <div className={styles['payload-content']}>
              {outputToolCalls.map((toolCall, toolCallIndex) => (
                <div key={toolCallIndex} className={styles['tool-call-block']}>
                  <div className={styles['tool-call-name']}><Wrench size={11} />{toolCall.name}</div>
                  {toolCall.args != null && <pre className={styles['tool-call-arguments']}>{JSON.stringify(toolCall.args, null, 2)}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Fetches the full request row once per request id — not once per graph
    mutation (the old popover refetched on every drag and settle frame,
    collapsing whatever section was open). */
function useRequestDetail(requestId: string | null) {
  const [state, setState] = useState<{ requestId: string | null; detail: IrisRequestEntry | null; isLoading: boolean }>({
    requestId: null,
    detail: null,
    isLoading: false,
  });
  useEffect(() => {
    if (!requestId) return;
    let isCancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag is the effect's own output
    setState({ requestId, detail: null, isLoading: true });
    IrisService.getRequest(requestId)
      .then((detail) => { if (!isCancelled) setState({ requestId, detail, isLoading: false }); })
      .catch(() => { if (!isCancelled) setState({ requestId, detail: null, isLoading: false }); });
    return () => { isCancelled = true; };
  }, [requestId]);
  return state.requestId === requestId ? state : { requestId, detail: null, isLoading: !!requestId };
}

export default function ConversationGraphDetailPanelComponent({
  node,
  color,
  connectionCount,
  toolEmojiMap,
  onClose,
  onCenter,
}: ConversationGraphDetailPanelProps) {
  const isRealRequest = node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID;
  const requestId = isRealRequest ? metadataString(node, "requestId") : null;
  const { detail: requestDetail, isLoading: isRequestDetailLoading } = useRequestDetail(
    isRealRequest && !isPendingRequest(node) ? requestId : null,
  );
  const toolNames = requestToolNames(node);
  const errorMessage = metadataString(node, "errorMessage");

  const totalCost = metadataNumber(node, "totalCost");
  const requestCount = metadataNumber(node, "requestCount");
  const totalTokens = metadataNumber(node, "totalTokens");
  const failedRequestCount = metadataNumber(node, "failedRequestCount");

  return (
    <aside
      className={styles['detail-panel']}
      style={{ "--detail-color": color } as CSSProperties}
      aria-label={`${NODE_LABELS[node.category]} details`}
    >
      <header className={styles['detail-header']}>
        <div className={styles['detail-heading']}>
          <div className={styles['detail-kicker']}>
            <span className={styles['category-chip']}>{NODE_LABELS[node.category]}</span>
            <StatusChip node={node} />
          </div>
          <h2 className={styles['detail-title']} title={node.label}>{node.label}</h2>
        </div>
        <div className={styles['detail-actions']}>
          <button type="button" className={styles['icon-button']} onClick={onCenter} title="Center on node" aria-label="Center on node">
            <Crosshair size={13} />
          </button>
          <button type="button" className={styles['icon-button']} onClick={onClose} title="Close details (Esc)" aria-label="Close details">
            <X size={13} />
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className={styles['error-box']} role="status">
          <AlertTriangle size={13} />
          <span>{errorMessage}</span>
        </div>
      )}

      {node.category === "session" && (
        <Section title="Conversation">
          {metadataString(node, "conversationId") && <CopyableIdRow label="Conversation ID" value={metadataString(node, "conversationId")!} />}
          {metadataString(node, "status") && <DetailRow label="Status" value={metadataString(node, "status")!} />}
          <DetailRow label="Requests" value={formatNumber(requestCount ?? 0)} />
          {!!failedRequestCount && <DetailRow label="Failed" value={formatNumber(failedRequestCount)} />}
          {metadataNumber(node, "subAgentCount") ? <DetailRow label="Sub-agents" value={formatNumber(metadataNumber(node, "subAgentCount"))} /> : null}
          <DetailRow label="Total cost" value={formatCost(totalCost ?? 0)} />
          <DetailRow label="Total tokens" value={formatNumber(totalTokens ?? 0)} />
          {(metadataNumber(node, "totalElapsedTime") ?? 0) > 0 && (
            <DetailRow label="Duration" value={formatElapsedTime(metadataNumber(node, "totalElapsedTime"))} />
          )}
          {metadataString(node, "createdAt") && <DetailRow label="Created" value={formatTimeAgo(metadataString(node, "createdAt"))} />}
        </Section>
      )}

      {node.category === "request" && (
        <>
          <Section title="Request">
            {node.sequenceNumber != null && <DetailRow label="Sequence" value={`#${node.sequenceNumber}`} />}
            <DetailRow label="Operation" value={metadataString(node, "operation") ?? "—"} />
            {metadataString(node, "model") && <DetailRow label="Model" value={cleanModelName(metadataString(node, "model")!)} />}
            {metadataString(node, "provider") && (
              <DetailRow label="Provider" value={resolveProviderLabel(metadataString(node, "provider")!) || metadataString(node, "provider")!} />
            )}
            {isRealRequest && <DetailRow label="Cost" value={formatCost(metadataNumber(node, "estimatedCost") ?? 0)} />}
            {(metadataNumber(node, "inputTokens") ?? 0) > 0 && <DetailRow label="Input tokens" value={formatNumber(metadataNumber(node, "inputTokens"))} />}
            {(metadataNumber(node, "outputTokens") ?? 0) > 0 && <DetailRow label="Output tokens" value={formatNumber(metadataNumber(node, "outputTokens"))} />}
            {(metadataNumber(node, "duration") ?? 0) > 0 && <DetailRow label="Duration" value={formatElapsedTime(metadataNumber(node, "duration"))} />}
            {metadataString(node, "timestamp") && <DetailRow label="Started" value={formatTimeAgo(metadataString(node, "timestamp"))} />}
            {requestId && <CopyableIdRow label="Request ID" value={requestId} />}
          </Section>

          {toolNames.length > 0 && (
            <Section title="Tools invoked">
              <ToolChips toolNames={toolNames} toolEmojiMap={toolEmojiMap} />
            </Section>
          )}

          {isRequestDetailLoading && (
            <div className={styles['loading-row']}>
              <Loader2 size={13} className={styles['spinning-icon']} />
              Loading payloads…
            </div>
          )}
          {requestDetail && <RequestPayloads requestDetail={requestDetail} />}
        </>
      )}

      {node.category === "turn" && (
        <Section title={`Turn ${(metadataNumber(node, "turnIndex") ?? 0) + 1}`}>
          <p className={styles['turn-message']}>{metadataString(node, "message") ?? node.label}</p>
        </Section>
      )}

      {(node.category === "agent" || node.category === "subagent") && (
        <Section title={node.category === "agent" ? "Agent" : "Sub-agent"}>
          <DetailRow label="Agent" value={metadataString(node, "agent") ?? node.label} />
          <DetailRow label="Role" value={node.category === "agent" ? "Orchestrator" : `Sub-agent · level ${node.depth ?? 1}`} />
          {requestCount !== null && <DetailRow label="Requests" value={formatNumber(requestCount)} />}
          {!!failedRequestCount && <DetailRow label="Failed" value={formatNumber(failedRequestCount)} />}
          {totalCost !== null && <DetailRow label="Cost" value={formatCost(totalCost)} />}
          {totalTokens !== null && <DetailRow label="Tokens" value={formatNumber(totalTokens)} />}
          {metadataString(node, "parentAgentConversationId") && (
            <CopyableIdRow label="Parent" value={metadataString(node, "parentAgentConversationId")!} />
          )}
        </Section>
      )}

      {node.category === "project" && (
        <Section title="Project">
          <DetailRow label="Project" value={metadataString(node, "project") ?? node.label} />
        </Section>
      )}

      {node.category === "user" && (
        <Section title="User">
          <DetailRow label="Username" value={metadataString(node, "username") ?? node.label} />
        </Section>
      )}

      <footer className={styles['detail-footer']}>
        {connectionCount} connection{connectionCount === 1 ? "" : "s"}
      </footer>
    </aside>
  );
}
