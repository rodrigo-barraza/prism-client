/**
 * tableColumns.js — Shared column factory functions for all *TableComponent
 * wrappers. Each factory returns one or more column definition objects
 * compatible with TableComponent's `columns` prop.
 *
 * Usage:
 *   import { tokenColumns, costColumns, ... } from "../utils/tableColumns";
 *   const columns = [identityCol, ...tokenColumns(), ...costColumns(total)];
 */

import {
  FolderOpen,
  MessageSquare,
  Workflow,
  Zap,
} from "lucide-react";
import CountLinkComponent from "../components/CountLinkComponent";
import ProportionBarComponent from "../components/ProportionBarComponent";
import ModalityIconComponent from "../components/ModalityIconComponent";

import ToolIconComponent from "../components/ToolIconComponent";
import { TooltipComponent, StatusDotComponent } from "@rodrigo-barraza/components-library";
import BadgeComponent from "../components/BadgeComponent";
import {
  formatTokenCount,
  formatLatency,
  formatTokensPerSec,
  formatDuration,
} from "@rodrigo-barraza/utilities-library";
import { PROVIDER_COLORS, CATEGORIES, EXECUTION_STATUS } from "../constants";
import { MILLISECONDS_PER_SECOND } from "@rodrigo-barraza/utilities-library";
import {
  deriveAgentConversationState,
  AGENT_CONVERSATION_STATE_COLORS,
  type AgentConversationState,
} from "./agentConversationStates";
import styles from "../components/TableComponentsComponent.module.css";
import type { TokenUsage } from "../types/types";

export interface TableRow {
  _id?: string;
  id?: string;
  model?: string;
  provider?: string;
  project?: string;
  username?: string;
  models?: string[];
  providers?: string[];
  modelCount?: number;
  providerCount?: number;
  totalRequests?: number;
  requestCount?: number;
  isGenerating?: boolean;
  isActive?: boolean;
  pendingBackgroundTasks?: number;
  hasSubAgents?: boolean;
  requestErrorCount?: number;
  /** Server-computed canonical activity state (snapshot endpoints) */
  state?: AgentConversationState;
  modalities?: Record<string, boolean | number> | null;
  toolDisplayNames?: string[];
  toolApiNames?: string[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  avgTokensPerSec?: number | null;
  totalCost?: number | null;
  avgLatency?: number | null;
  traceCount?: number;
  conversationCount?: number;
  workflowCount?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  name?: string;
  success?: boolean;
  error?: string;
  passed?: boolean | number | null;
  failed?: number;
  errored?: number;
  _running?: boolean;
  _pending?: boolean;
  _phase?: string;
  _progress?: number;
  toolsEnabled?: boolean;
  toolCalls?: Array<{ name?: string }>;
  toolNames?: string[];
  conversations?: TableRow[];
  endpoint?: string;
  operation?: string;
  agents?: string[];
  agent?: string;
  label?: string;
  thinkingEnabled?: boolean;
  response?: string;
  matchMode?: string;
  latency?: number;
  usage?: TokenUsage;
  /** Server-persisted generation-only throughput (benchmark rows). */
  tokensPerSecond?: number;
  /** Milliseconds until first streamed content (benchmark rows). */
  ttftMs?: number | null;
  /** Per-assertion pass/fail breakdown (benchmark rows). */
  assertionResults?: Array<{
    kind: string;
    label: string;
    passed: boolean;
    error?: string;
  }>;
  /** Trial index/count when a target ran multiple times (benchmark rows). */
  trial?: number;
  trialCount?: number;
  /** LLM-judge spend for this result (benchmark rows). */
  judgeCost?: number;
  estimatedCost?: number;
  completedAt?: string;
  total?: number;
  passRate?: number;
}

export type TransformedTableRow = TableRow;

/* -- Helpers ---------------------------------------------- */

/** Renders a muted "—" dash — replaces all inline style={{ color: "var(--text-muted)" }} */
export const emptyDash = () => <span className={styles['empty-dash']}>—</span>;

/** Render a value or a muted dash if falsy/zero */
export const valueOrDash = <T,>(
  value: T | undefined | null,
  render: (_value: T) => React.ReactNode,
) => (value ? render(value) : emptyDash());

/** Merge modalities from an array of conversations into a single object */
export function mergeModalities(conversations: TableRow[]) {
  const merged: Record<string, boolean> = {};
  for (const conversation of conversations) {
    const modalities = conversation.modalities as
      | Record<string, boolean | number>
      | undefined;
    if (!modalities) continue;
    for (const [key, value] of Object.entries(modalities)) {
      if (value) merged[key] = true;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/** Get duration in ms from createdAt/updatedAt or startedAt/finishedAt */
export function getDurationMs(row: TableRow) {
  const start = (row.startedAt || row.createdAt) as string | undefined;
  const end = (row.finishedAt || row.updatedAt) as string | undefined;
  if (!start || !end) return 0;
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}



// Re-export PROVIDER_COLORS so existing consumers don't need to change imports
export { PROVIDER_COLORS };

/* -- Column Factories ------------------------------------- */

/* ·· Identity / name columns ·· */

export const modelColumn = () => ({
  key: "model",
  label: "Model",
  description: "The AI model identifier used for the request",
  render: (row: TableRow) => (
    <BadgeComponent
      type={CATEGORIES.MODEL}
      models={row.model ? [row.model as string] : []}
      provider={row.provider as string | undefined}
    />
  ),
});

export const providerColumn = () => ({
  key: "provider",
  label: "Provider",
  description:
    "The API provider hosting this model (e.g. OpenAI, Google, Anthropic)",
  render: (row: TableRow) => (
    <BadgeComponent
      type="providers"
      providers={row.provider ? [row.provider as string] : []}
    />
  ),
});

export const projectColumn = () => ({
  key: "project",
  label: "Project",
  description: "The project or application this request belongs to",
  render: (row: TableRow) => (
    <BadgeComponent
      type={CATEGORIES.PROJECT}
      project={row.project as string | undefined}
    />
  ),
});

export const userColumn = () => ({
  key: "username",
  label: "User",
  description: "The user who initiated this request",
  sortable: false,
  render: (row: TableRow) => (
    <BadgeComponent type={CATEGORIES.USER} username={row.username as string | undefined} />
  ),
});

/* ·· Models / Providers (as badge lists) ·· */

export const modelsListColumn = ({
  mini = false,
}: { mini?: boolean } = {}) => ({
  key: "models",
  label: "Models",
  description: "All distinct models used in this group",
  sortable: false,
  render: (row: TableRow) => (
    <BadgeComponent
      type={CATEGORIES.MODEL}
      models={row.models as string[] | undefined}
      providers={row.providers as string[] | undefined}
      mini={mini}
    />
  ),
});

export const modelCountColumn = () => ({
  key: "modelCount",
  label: "Models",
  description: "Number of distinct models used",
  sortValue: (row: TableRow) =>
    (row.models as string[] | undefined)?.length ??
    (row.modelCount as number | undefined) ??
    0,
  render: (row: TableRow) => (
    <BadgeComponent
      type={CATEGORIES.MODEL}
      models={(row.models as string[] | undefined) ?? []}
      providers={row.providers as string[] | undefined}
    />
  ),
});

export const providersListColumn = ({
  mini = false,
}: { mini?: boolean } = {}) => ({
  key: "providers",
  label: "Providers",
  description: "All distinct providers used in this group",
  sortable: false,
  render: (row: TableRow) => (
    <BadgeComponent
      type="providers"
      providers={row.providers as string[] | undefined}
      mini={mini}
    />
  ),
});

export const providerCountColumn = () => ({
  key: "providerCount",
  label: "Providers",
  description: "Number of distinct API providers used",
  sortValue: (row: TableRow) =>
    ((row.providers as string[] | undefined) ?? []).length,
  render: (row: TableRow) => (
    <BadgeComponent
      type="providers"
      providers={(row.providers as string[] | undefined) ?? []}
    />
  ),
});

/* ·· Request / usage columns ·· */

export const requestsColumn = () => ({
  key: "totalRequests",
  label: "Requests",
  description: "Total number of API requests made",
  align: "right" as const,
  render: (row: TableRow) =>
    (row.totalRequests as number | undefined)?.toLocaleString() ?? "0",
});

export const requestCountColumn = () => ({
  key: "requestCount",
  label: "Requests",
  description: "Number of individual API calls",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    ((row.requestCount as number | undefined) ?? 0) > 0 ? (
      <span className={styles['count-cell']}>
        <Zap size={10} />
        {row.requestCount as number}
      </span>
    ) : (
      emptyDash()
    ),
});

export const usageColumn = (totalRequests: number, color: string) => ({
  key: "usage",
  label: "Usage",
  description: "Proportional share of total requests",
  sortValue: (row: TableRow) => row.totalRequests as number | undefined,
  render: (row: TableRow) => (
    <ProportionBarComponent
      value={row.totalRequests as number | undefined}
      total={totalRequests}
      color={color}
    />
  ),
});

/* ·· Modalities ·· */

export const modalitiesColumn = ({
  mini = false,
  fromConversations = false,
}: { mini?: boolean; fromConversations?: boolean } = {}) => ({
  key: "modalities",
  label: "Modalities",
  description: "Input/output types supported (text, image, audio, video)",
  sortValue: (row: TableRow) => {
    const modalitiesState = fromConversations
      ? mergeModalities((row.conversations as TableRow[] | undefined) ?? [])
      : (row.modalities as Record<string, boolean> | undefined);
    return modalitiesState ? Object.values(modalitiesState).filter(Boolean).length : 0;
  },
  render: (row: TableRow) => {
    const modalitiesState = fromConversations
      ? mergeModalities((row.conversations as TableRow[] | undefined) ?? [])
      : (row.modalities as Record<string, boolean> | undefined);
    if (!modalitiesState) return emptyDash();
    return <ModalityIconComponent modalities={modalitiesState} size={mini ? 9 : 12} />;
  },
});

/* ·· Tools ·· */

export const toolsColumn = ({
  mini = false,
  configModels,
}: { mini?: boolean; configModels?: Record<string, string[]> } = {}) => ({
  key: "toolDisplayNames",
  label: "Tools",
  description: "External tools and capabilities configured for this model",
  sortable: false,
  align: "left" as const,
  render: (row: TableRow) => {
    // Support either direct toolDisplayNames array or config-based lookup
    if (configModels) {
      const tools =
        configModels[`${row.provider as string}:${row.model as string}`];
      if (!tools?.length) return emptyDash();
      return (
        <ToolIconComponent
          toolDisplayNames={tools}
          size={mini ? 10 : undefined}
        />
      );
    }
    return (
      <ToolIconComponent
        toolDisplayNames={row.toolDisplayNames as string[] | undefined}
        toolApiNames={row.toolApiNames as string[] | undefined}
        size={mini ? 10 : undefined}
      />
    );
  },
});

/* ·· Token columns ·· */

/** Returns 4 columns: Tokens In, Tokens Out, Tokens (total), Tok/s */
export const tokenColumns = ({
  inputKey = "totalInputTokens",
  outputKey = "totalOutputTokens",
  tokensPerSecondKey = "avgTokensPerSec",
  showDash = false,
}: {
  inputKey?: string;
  outputKey?: string;
  tokensPerSecondKey?: string;
  showDash?: boolean;
} = {}) => [
  {
    key: inputKey,
    label: "Tokens In",
    description: "Total input (prompt) tokens consumed",
    align: "right" as const,
    render: (row: TableRow) => {
      const tokenValue = (row as Record<string, unknown>)[inputKey] as number | undefined;
      if (showDash && !(tokenValue && tokenValue > 0)) return emptyDash();
      return formatTokenCount(tokenValue);
    },
  },
  {
    key: outputKey,
    label: "Tokens Out",
    description: "Total output (completion) tokens generated",
    align: "right" as const,
    render: (row: TableRow) => {
      const tokenValue = (row as Record<string, unknown>)[outputKey] as number | undefined;
      if (showDash && !(tokenValue && tokenValue > 0)) return emptyDash();
      return formatTokenCount(tokenValue);
    },
  },
  {
    key: "totalTokens",
    label: "Tokens",
    description: "Combined input + output token count",
    align: "right" as const,
    sortValue: (row: TableRow) =>
      (((row as Record<string, unknown>)[inputKey] as number | undefined) ?? 0) +
      (((row as Record<string, unknown>)[outputKey] as number | undefined) ?? 0),
    render: (row: TableRow) => {
      const total =
        (((row as Record<string, unknown>)[inputKey] as number | undefined) ?? 0) +
        (((row as Record<string, unknown>)[outputKey] as number | undefined) ?? 0);
      if (showDash && total <= 0) return emptyDash();
      return total > 0 ? formatTokenCount(total) : "0";
    },
  },
  {
    key: tokensPerSecondKey,
    label: "Tok/s",
    description: "Average output throughput in tokens per second",
    align: "right" as const,
    render: (row: TableRow) =>
      formatTokensPerSec((row as Record<string, unknown>)[tokensPerSecondKey] as number | undefined),
  },
];

/* ·· Cost columns ·· */

/** Returns 2 columns: Cost, Cost % */
export const costColumns = (
  totalCost: number,
  {
    costKey = "totalCost",
    mini = false,
  }: { costKey?: string; mini?: boolean } = {},
) => [
  {
    key: costKey,
    label: "Cost",
    description: "Total estimated cost in USD",
    sortable: true,
    align: "right" as const,
    render: (row: TableRow) => (
      <BadgeComponent
        type="cost"
        cost={((row as Record<string, unknown>)[costKey] as number) || 0}
        mini={mini}
      />
    ),
  },
  {
    key: "costShare",
    label: "Cost %",
    description: "Proportional share of total cost",
    sortable: true,
    sortValue: (row: TableRow) => (row as Record<string, unknown>)[costKey] as number | undefined,
    render: (row: TableRow) => (
      <ProportionBarComponent
        value={(row as Record<string, unknown>)[costKey] as number | undefined}
        total={totalCost}
        color="var(--color-warning)"
        mini={mini}
      />
    ),
  },
];

/* ·· Latency ·· */

export const latencyColumn = (key = "avgLatency", label = "Avg Latency") => ({
  key,
  label,
  description: "Average round-trip response time",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) => {
    const latencyValue = (row as Record<string, unknown>)[key] as number | undefined;
    if (!latencyValue || latencyValue <= 0) return emptyDash();
    return formatLatency(latencyValue);
  },
});

/* ·· Count link columns (Traces / Conversations / Workflows) ·· */

/**
 * Returns 3 columns with CountLinkComponent: Traces, Conversations, Workflows.
 */
export const countLinkColumns = (
  entityKey: string,
  entityValue: (_row: TableRow) => string,
) => [
  {
    key: "traceCount",
    label: "Traces",
    description: "Number of request traces that used this entity",
    align: "right" as const,
    render: (row: TableRow) => (
      <CountLinkComponent
        count={row.traceCount as number | undefined}
        href={`/admin/traces?${entityKey}=${encodeURIComponent(entityValue(row))}`}
        icon={FolderOpen}
      />
    ),
  },
  {
    key: "conversationCount",
    label: "Conversations",
    description: "Number of conversations that used this entity",
    align: "right" as const,
    render: (row: TableRow) => (
      <CountLinkComponent
        count={row.conversationCount as number | undefined}
        href={`/admin/chat?${entityKey}=${encodeURIComponent(entityValue(row))}`}
        icon={MessageSquare}
      />
    ),
  },
  {
    key: "workflowCount",
    label: "Workflows",
    description: "Number of workflows that used this entity",
    align: "right" as const,
    render: (row: TableRow) => (
      <CountLinkComponent
        count={row.workflowCount as number | undefined}
        href={`/admin/workflows?${entityKey}=${encodeURIComponent(entityValue(row))}`}
        icon={Workflow}
      />
    ),
  },
];

/* ·· Conversation count (inline icon) ·· */

export const conversationCountColumn = () => ({
  key: "conversationCount",
  label: "Convos",
  description: "Total number of conversations",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) => {
    const count =
      (row.conversationCount as number | undefined) ??
      ((row.conversations as TableRow[] | undefined) ?? []).length;
    return (
      <span className={styles['count-cell']}>
        <MessageSquare size={10} />
        {count}
      </span>
    );
  },
});

/* ·· Duration columns ·· */

export const durationColumn = ({
  useDurationMs = false,
}: { useDurationMs?: boolean } = {}) => ({
  key: "duration",
  label: "Duration",
  description: "Elapsed wall-clock time from start to finish",
  sortable: false,
  align: "right" as const,
  sortValue: (row: TableRow) => (useDurationMs ? getDurationMs(row) : 0),
  render: (row: TableRow) => {
    const durationMilliseconds = useDurationMs
      ? getDurationMs(row)
      : (() => {
          const startedAtTimestamp = row.startedAt as string | undefined;
          const finishedAtTimestamp = row.finishedAt as string | undefined;
          if (!startedAtTimestamp || !finishedAtTimestamp) return 0;
          return (
            new Date(finishedAtTimestamp).getTime() -
            new Date(startedAtTimestamp).getTime()
          );
        })();
    const duration = formatDuration(durationMilliseconds);
    if (!duration) return emptyDash();
    return <BadgeComponent type="stopwatch" seconds={durationMilliseconds / MILLISECONDS_PER_SECOND} />;
  },
});

export const durationShareColumn = (
  totalDuration: number,
  { mini = false }: { mini?: boolean } = {},
) => ({
  key: "durationShare",
  label: "Duration %",
  description: "Proportional share of total duration",
  sortable: true,
  sortValue: (row: TableRow) => getDurationMs(row),
  render: (row: TableRow) => (
    <ProportionBarComponent
      value={getDurationMs(row)}
      total={totalDuration}
      color="var(--accent-primary)"
      mini={mini}
    />
  ),
});

/* ·· Timestamps ·· */

export const createdAtColumn = (
  key = "createdAt",
  { highlightNew = false }: { highlightNew?: boolean } = {},
) => ({
  key,
  label: "Created",
  description: "When this record was first created",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    (row as Record<string, unknown>)[key] ? (
      <BadgeComponent
        type="dateTime"
        date={(row as Record<string, unknown>)[key] as string}
        highlightNew={highlightNew}
      />
    ) : (
      emptyDash()
    ),
});

/* ·· Trace ID ·· */

export const traceIdColumn = () => ({
  key: "id",
  label: "Trace",
  description: "Unique trace identifier (click to view conversations)",
  sortable: false,
  render: (row: TableRow) => (
    <a
      href={`/admin/chat?trace=${row.id as string}`}
      className={styles['conversation-id-cell']}
      title={`View conversations for trace ${row.id as string}`}
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      <FolderOpen size={12} className={styles['conversation-icon']} />
      <span className={styles['conversation-id-text']}>
        {(row.id as string).slice(0, 8)}
      </span>
    </a>
  ),
});

/* ·· Conversation title ·· */

export const conversationTitleColumn = ({
  mini = false,
}: { mini?: boolean } = {}) => ({
  key: "title",
  label: "Conversation",
  description: "Auto-generated conversation title",
  sortable: false,
  render: (conversation: TableRow) => (
    <span
      className={`${styles['conversation-title']} ${mini ? styles['conversation-title-mini'] : ""}`}
    >
      <MessageSquare size={mini ? 9 : 12} />
      {(conversation.title as string | undefined) || "Untitled"}
    </span>
  ),
});

/**
 * Renders a StatusDotComponent with a unique oklch color per conversation state.
 *
 * Colors are derived from PHASE_TOKENS (statusBarPhaseTokens.ts), the single source of truth
 * ensuring a consistent visual language across all surfaces.
 * State is derived from persisted MongoDB fields only — see agentConversationStates.ts.
 */
export const activeStatusColumn = () => ({
  key: "isActive",
  label: "",
  description: "Live session activity status derived from persisted conversation state",
  sortable: false,
  width: "32px",
  render: (conversation: TableRow) => {
    const conversationState = deriveAgentConversationState({
      state: conversation.state,
      isActive: conversation.isActive,
      isGenerating: conversation.isGenerating,
      pendingBackgroundTasks: conversation.pendingBackgroundTasks,
      hasSubAgents: conversation.hasSubAgents,
      requestErrorCount: conversation.requestErrorCount,
    });
    const { primary, glow, label, pulse } = AGENT_CONVERSATION_STATE_COLORS[conversationState];

    const tooltipContent = conversationState === "sub-agents-running" || conversationState === "background-tasks"
      ? `${conversation.pendingBackgroundTasks} ${label}`
      : conversationState === "completed-with-errors"
        ? `Completed with ${conversation.requestErrorCount} error${conversation.requestErrorCount !== 1 ? "s" : ""}`
        : label;

    return (
      <TooltipComponent content={tooltipContent} position="right">
        <StatusDotComponent
          variant="inactive"
          size="size-small"
          pulse={pulse}
          style={{
            background: primary,
            boxShadow: pulse
              ? `0 0 6px ${glow}, 0 0 12px ${glow}`
              : conversationState === "completed" ? "none" : `0 0 4px ${glow}`,
          }}
        />
      </TooltipComponent>
    );
  },
});

/* ·· Project / User as inline badges (for Conversations) ·· */

export const projectBadgeColumn = ({
  mini = false,
}: { mini?: boolean } = {}) => ({
  key: "project",
  label: "Project",
  description: "The project this conversation belongs to",
  sortable: false,
  render: (conversation: TableRow) =>
    conversation.project ? (
      <BadgeComponent variant="info" mini={mini}>
        {conversation.project as string}
      </BadgeComponent>
    ) : (
      emptyDash()
    ),
});

export const userBadgeColumn = ({ mini = false }: { mini?: boolean } = {}) => ({
  key: "username",
  label: "User",
  description: "The user who started this conversation",
  sortable: false,
  render: (conversation: TableRow) =>
    conversation.username && conversation.username !== "unknown" ? (
      <BadgeComponent variant="provider" mini={mini}>
        {conversation.username as string}
      </BadgeComponent>
    ) : (
      emptyDash()
    ),
});

/* ·· Endpoint ·· */

export const endpointColumn = () => ({
  key: "endpoint",
  label: "Endpoint",
  description: "The API endpoint path called (e.g. /chat, /image, /audio)",
  render: (row: TableRow) => (
    <BadgeComponent variant="endpoint">
      {(row.endpoint as string | undefined) || "-"}
    </BadgeComponent>
  ),
});

export const operationColumn = () => ({
  key: "operation",
  label: "Operation",
  description:
    "The semantic purpose of this LLM call (e.g. chat, agent:iteration, memory:extract)",
  render: (row: TableRow) => (
    <BadgeComponent variant="info">
      {(row.operation as string | undefined) || "-"}
    </BadgeComponent>
  ),
});

/* ·· Agent ·· */

export const agentColumn = () => ({
  key: "agent",
  label: "Agent",
  description:
    "The originating agent that made this request (e.g. CODING, LUPOS)",
  sortable: false,
  render: (row: TableRow) => {
    // Normalize: conversations expose `agents` (array), requests expose `agent` (string)
    const agents =
      (row.agents as string[] | undefined) ??
      (row.agent ? [row.agent as string] : []);
    return <BadgeComponent type={CATEGORIES.AGENT} agents={agents} />;
  },
});

/* ·· Status ·· */

export const statusColumn = () => ({
  key: "success",
  label: "Status",
  description:
    "Whether the request completed successfully (OK) or failed (ERR)",
  align: "right" as const,
  render: (row: TableRow) => {
    const statusVariant =
      row.success === true
        ? EXECUTION_STATUS.SUCCESS
        : row.success === false
          ? EXECUTION_STATUS.ERROR
          : EXECUTION_STATUS.WARNING;
    const statusLabel =
      row.success === true
        ? "OK"
        : row.success === false
          ? "ERR"
          : "PENDING";

    return (
      <BadgeComponent variant={statusVariant}>
        {statusLabel}
      </BadgeComponent>
    );
  },
});
