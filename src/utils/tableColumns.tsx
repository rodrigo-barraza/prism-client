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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Gauge,
  HardDrive,
  Brain,
  Wrench,
  Loader2,
  Circle,
} from "lucide-react";
import CountLinkComponent from "../components/CountLinkComponent";
import ProportionBarComponent from "../components/ProportionBarComponent";
import ModalityIconComponent from "../components/ModalityIconComponent";

import ToolIconComponent from "../components/ToolIconComponent";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import BadgeComponent from "../components/BadgeComponent";
import ProviderLogo from "../components/ProviderLogosComponent";
import { resolveProviderLabel } from "../components/ProviderLogosComponent";
import {
  formatTokenCount,
  formatLatency,
  formatTokensPerSec,
  formatDuration,
} from "@rodrigo-barraza/utilities-library";
import {
  getTotalInputTokens,
} from "./utilities";
import { PROVIDER_COLORS } from "../constants";
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
  render: (value: T) => React.ReactNode,
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
      type="model"
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
      type="project"
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
    <BadgeComponent type="user" username={row.username as string | undefined} />
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
      type="model"
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
      type="model"
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
  entityValue: (row: TableRow) => string,
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
    return <BadgeComponent type="stopwatch" seconds={durationMilliseconds / 1000} />;
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
    return <BadgeComponent type="agent" agents={agents} />;
  },
});

/* ·· Status ·· */

export const statusColumn = () => ({
  key: "success",
  label: "Status",
  description:
    "Whether the request completed successfully (OK) or failed (ERR)",
  align: "right" as const,
  render: (row: TableRow) => (
    <BadgeComponent variant={row.success ? "success" : "error"}>
      {row.success ? "OK" : "ERR"}
    </BadgeComponent>
  ),
});

/* -- Benchmark result columns ---------------------------- */

export const benchmarkStatusColumn = () => ({
  key: "status",
  label: "Status",
  description: "Whether the model passed, failed, or errored on this benchmark",
  sortValue: (row: TableRow) =>
    row._running ? -2 : row._pending ? -3 : row.error ? -1 : row.passed ? 1 : 0,
  render: (row: TableRow) => {
    if (row._pending) {
      return (
        <span className={styles['benchmark-status-cell']}>
          <Circle size={16} className={styles['benchmark-pending-icon']} />
          <span>Queued</span>
        </span>
      );
    }
    if (row._running) {
      return (
        <span className={styles['benchmark-status-cell']}>
          <Loader2 size={16} className={styles['benchmark-running-icon']} />
          <span>{(row._phase as string | undefined) || "Running"}</span>
        </span>
      );
    }
    if (row.error) {
      return (
        <span className={styles['benchmark-status-cell']}>
          <AlertTriangle size={16} className={styles['benchmark-error-icon']} />
          <span>Error</span>
        </span>
      );
    }
    if (row.passed) {
      return (
        <span className={styles['benchmark-status-cell']}>
          <CheckCircle2 size={16} className={styles['benchmark-pass-icon']} />
          <span>Pass</span>
        </span>
      );
    }
    return (
      <span className={styles['benchmark-status-cell']}>
        <XCircle size={16} className={styles['benchmark-fail-icon']} />
        <span>Fail</span>
      </span>
    );
  },
});

export const benchmarkModelColumn = () => ({
  key: "label",
  label: "Model",
  description: "The model and provider tested",
  render: (row: TableRow) => (
    <span
      className={`${styles['benchmark-model-cell']} ${row._pending ? styles['benchmark-model-pending'] : ""}`}
    >
      <span className={styles['benchmark-model-name']}>{row.label as string}</span>
      <span className={styles['benchmark-model-provider-layout-row']}>
        <span className={styles['benchmark-model-provider']}>
          {resolveProviderLabel(row.provider as string | undefined)}
        </span>
        {!!row._running && typeof row._progress === "number" && row._progress > 0 && (
          <span className={styles['benchmark-progress-pct']}>
            {Math.round(row._progress * 100)}%
          </span>
        )}
      </span>
    </span>
  ),
});

export const benchmarkToolsColumn = () => ({
  key: "toolsEnabled",
  label: "Tools",
  description: "Whether tool use (function calling) was enabled for this run",
  sortable: true,
  sortValue: (row: TableRow) => (row.toolsEnabled ? 1 : 0),
  defaultHidden: true,
  render: (row: TableRow) => {
    if (!row.toolsEnabled) return emptyDash();
    const rawToolCalls = row.toolCalls as Array<{ name?: string }> | undefined;
    const toolNames = rawToolCalls?.length
      ? ([
          ...new Set(rawToolCalls.map((toolCall) => toolCall.name).filter(Boolean)),
        ] as string[])
      : null;
    const badge = (
      <BadgeComponent variant="warning" mini>
        <Wrench size={10} /> Tools{toolNames ? ` (${toolNames.length})` : ""}
      </BadgeComponent>
    );
    if (!toolNames?.length) return badge;
    return (
      <TooltipComponent label={toolNames.join(", ")}>{badge}</TooltipComponent>
    );
  },
});

export const benchmarkThinkingColumn = () => ({
  key: "thinkingEnabled",
  label: "Thinking",
  description: "Whether extended thinking / chain-of-thought was enabled",
  sortable: true,
  sortValue: (row: TableRow) => (row.thinkingEnabled ? 1 : 0),
  defaultHidden: true,
  render: (row: TableRow) =>
    row.thinkingEnabled ? (
      <BadgeComponent variant="accent" mini>
        <Brain size={10} /> Thinking
      </BadgeComponent>
    ) : (
      emptyDash()
    ),
});

/**
 * Model file size column for benchmarks.
 * Shows the GGUF/weight file size for local models (e.g. "4.3 GB").
 */
export const benchmarkSizeColumn = ({
  modelConfigMap = {},
}: { modelConfigMap?: Record<string, { size?: string }> } = {}) => ({
  key: "size",
  label: "Size",
  description: "Model file/weight size on disk (local models only)",
  sortable: true,
  sortValue: (row: TableRow) => {
    const config =
      modelConfigMap[`${row.provider as string}:${row.model as string}`];
    const sizeString = config?.size ?? "";
    const match = sizeString.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "GB") return value * 1024;
    if (unit === "MB") return value;
    return value / 1024;
  },
  align: "right" as const,
  render: (row: TableRow) => {
    const config =
      modelConfigMap[`${row.provider as string}:${row.model as string}`];
    if (!config?.size) return emptyDash();
    return (
      <span className={styles['benchmark-tps-cell']}>
        <HardDrive size={10} />
        {config.size}
      </span>
    );
  },
});

/**
 * Highlight the expected value substring inside a response string.
 * Returns an array of React nodes with <mark> wrapping matched portions.
 */
function highlightExpected(text: string, expected: string, matchMode: string) {
  if (!text || !expected) return text || "—";

  const normalizeString = (textValue: string) => textValue.trim().toLowerCase();
  const normalizedText = normalizeString(text);
  const normalizedExpected = normalizeString(expected);

  // For regex mode, find the first match in the original text
  if (matchMode === "regex") {
    try {
      const regex = new RegExp(`(${expected})`, "i");
      const match = text.match(regex);
      if (!match || match.index === undefined) return text;
      const index = match.index;
      const matchLength = match[0].length;
      return (
        <>
          {text.slice(0, index)}
          <mark className={styles['benchmark-highlight']}>
            {text.slice(index, index + matchLength)}
          </mark>
          {text.slice(index + matchLength)}
        </>
      );
    } catch {
      return text;
    }
  }

  // For exact mode — highlight the entire response if it matches
  if (matchMode === "exact" && normalizedText === normalizedExpected) {
    return <mark className={styles['benchmark-highlight']}>{text}</mark>;
  }

  // For contains / startsWith — find the substring position (case-insensitive)
  const index = normalizedText.indexOf(normalizedExpected);
  if (index === -1) return text;

  const before = text.slice(0, index);
  const matched = text.slice(index, index + expected.trim().length);
  const after = text.slice(index + expected.trim().length);

  return (
    <>
      {before}
      <mark className={styles['benchmark-highlight']}>{matched}</mark>
      {after}
    </>
  );
}

export const benchmarkResponseColumn = ({
  expectedValue,
  matchMode,
}: { expectedValue?: string; matchMode?: string } = {}) => ({
  key: "response",
  label: "Response",
  description: "The model's output text (or error message)",
  sortable: false,
  render: (row: TableRow) => {
    if (row.error) {
      return (
        <span className={styles['benchmark-error-message']}>
          {row.error as string}
        </span>
      );
    }
    return (
      <span
        className={styles['benchmark-response-cell']}
        title={row.response as string | undefined}
      >
        {expectedValue
          ? highlightExpected(
              row.response as string,
              expectedValue,
              matchMode ?? (row.matchMode as string | undefined) ?? "contains",
            )
          : (row.response as string | undefined) || "—"}
      </span>
    );
  },
});

export const benchmarkLatencyColumn = () => ({
  key: "latency",
  label: "Latency",
  description: "Time taken for the model to respond",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    row.latency ? (
      <span className={styles['mono-cell']}>
        {formatLatency(row.latency as number)}
      </span>
    ) : (
      emptyDash()
    ),
});

export const benchmarkDurationColumn = () => ({
  key: "duration",
  label: "Duration",
  description: "Wall-clock time from request start to finish",
  sortable: true,
  sortValue: (row: TableRow) => (row.latency as number | undefined) ?? 0,
  align: "right" as const,
  render: (row: TableRow) => {
    if (!row.latency) return emptyDash();
    return <BadgeComponent type="stopwatch" seconds={row.latency as number} />;
  },
});

export const benchmarkTokensInColumn = () => ({
  key: "tokensIn",
  label: "Tokens In",
  description: "Input (prompt) tokens consumed by this model",
  sortable: true,
  sortValue: (row: TableRow) =>
    getTotalInputTokens(row.usage as TokenUsage | undefined) ?? 0,
  align: "right" as const,
  render: (row: TableRow) => {
    const inputTokens = getTotalInputTokens(row.usage as TokenUsage | undefined);
    return inputTokens > 0 ? (
      <BadgeComponent type="tokens" value={inputTokens} label="in" mini />
    ) : (
      emptyDash()
    );
  },
});

export const benchmarkTokensOutColumn = () => ({
  key: "tokensOut",
  label: "Tokens Out",
  description: "Output (completion) tokens generated by this model",
  sortable: true,
  sortValue: (row: TableRow) =>
    (row.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0,
  align: "right" as const,
  render: (row: TableRow) => {
    const outputTokens =
      (row.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0;
    return outputTokens > 0 ? (
      <BadgeComponent type="tokens" value={outputTokens} label="out" mini />
    ) : (
      emptyDash()
    );
  },
});

export const benchmarkTokPerSecColumn = () => ({
  key: "tokPerSec",
  label: "Tok/s",
  description: "Output throughput — completion tokens per second",
  sortable: true,
  sortValue: (row: TableRow) => {
    const usage = row.usage as { outputTokens?: number } | undefined;
    const outputTokens = usage?.outputTokens ?? 0;
    const latencyValue = row.latency as number | undefined;
    return latencyValue && latencyValue > 0 && outputTokens > 0 ? outputTokens / latencyValue : 0;
  },
  align: "right" as const,
  render: (row: TableRow) => {
    const usage = row.usage as { outputTokens?: number } | undefined;
    const outputTokens = usage?.outputTokens ?? 0;
    const latencyValue = row.latency as number | undefined;
    if (!latencyValue || latencyValue <= 0 || outputTokens <= 0) return emptyDash();
    const tokensPerSecond = outputTokens / latencyValue;
    return (
      <span className={styles['benchmark-tps-cell']}>
        <Gauge size={10} />
        {tokensPerSecond.toFixed(1)}
      </span>
    );
  },
});

export const benchmarkCostColumn = () => ({
  key: "estimatedCost",
  label: "Cost",
  description: "Estimated cost for this individual model run",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    row.estimatedCost != null ? (
      <BadgeComponent type="cost" cost={row.estimatedCost as number} mini />
    ) : (
      emptyDash()
    ),
});

export const benchmarkDateColumn = () => ({
  key: "completedAt",
  label: "Date",
  description: "When this model was tested",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    row.completedAt ? (
      <BadgeComponent type="dateTime" date={row.completedAt as string} />
    ) : (
      emptyDash()
    ),
});

const MATCH_MODE_LABELS: Record<string, string> = {
  contains: "Contains",
  exact: "Exact",
  startsWith: "Starts With",
  regex: "Regex",
};

export const benchmarkMatchModeColumn = () => ({
  key: "matchMode",
  label: "Match",
  description:
    "Evaluation strategy used to compare response against expected value",
  sortable: false,
  render: (row: TableRow) => (
    <BadgeComponent variant="info" mini>
      {MATCH_MODE_LABELS[row.matchMode as string] ??
        (row.matchMode as string | undefined) ??
        "—"}
    </BadgeComponent>
  ),
});

/* -- Benchmark Dashboard columns (aggregated model stats) -- */

export const dashboardModelColumn = () => ({
  key: "label",
  label: "Model",
  description: "Model name and provider tested across benchmarks",
  sortable: true,
  render: (row: TableRow) => (
    <span className={styles['dashboard-model-cell']}>
      <ProviderLogo provider={row.provider as string | undefined} size={16} />
      <span className={styles['dashboard-model-name']}>{row.label as string}</span>
    </span>
  ),
});

export const dashboardProviderColumn = () => ({
  key: "provider",
  label: "Provider",
  description: "The API provider hosting this model",
  sortable: true,
  render: (row: TableRow) => (
    <BadgeComponent
      type="providers"
      providers={row.provider ? [row.provider as string] : []}
    />
  ),
});

export const dashboardTestsColumn = () => ({
  key: "total",
  label: "Tests",
  description: "Total number of benchmark tests run for this model",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) => (
    <span className={styles['mono-cell']}>{row.total as number}</span>
  ),
});

export const dashboardPassedColumn = () => ({
  key: "passed",
  label: "Pass",
  description: "Number of benchmark tests this model passed",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) => (
    <span className={styles['dashboard-passed-cell']}>
      <CheckCircle2 size={12} />
      {row.passed as number}
    </span>
  ),
});

export const dashboardFailedColumn = () => ({
  key: "failed",
  label: "Fail",
  description: "Number of benchmark tests this model failed or errored",
  sortable: true,
  sortValue: (row: TableRow) => (row.failed as number) + (row.errored as number),
  align: "right" as const,
  render: (row: TableRow) => (
    <span className={styles['dashboard-failed-cell']}>
      <XCircle size={12} />
      {(row.failed as number) + (row.errored as number)}
    </span>
  ),
});

export const dashboardPassRateColumn = () => ({
  key: "passRate",
  label: "Pass Rate",
  description: "Percentage of benchmark tests this model passed",
  sortable: true,
  width: "100px",
  render: (row: TableRow) => {
    const percentage = Math.round((row.passRate as number) * 100);
    const color =
      percentage >= 80
        ? "var(--color-success)"
        : percentage >= 50
          ? "var(--color-warning)"
          : "var(--color-danger)";
    return (
      <span className={styles['dashboard-rate-cell']}>
        <span className={styles['dashboard-rate-bar']}>
          <span
            className={styles['dashboard-rate-bar-fill']}
            style={{ width: `${percentage}%`, background: color }}
          />
        </span>
        <span className={styles['dashboard-rate-value']} style={{ color }}>
          {percentage}%
        </span>
      </span>
    );
  },
});

export const dashboardAvgLatencyColumn = () => ({
  key: "avgLatency",
  label: "Avg Latency",
  description: "Average response latency across all benchmark tests",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) => (
    <BadgeComponent type="stopwatch" seconds={row.avgLatency as number} />
  ),
});

export const dashboardCostColumn = () => ({
  key: "totalCost",
  label: "Cost",
  description: "Total estimated cost across all benchmark tests for this model",
  sortable: true,
  align: "right" as const,
  render: (row: TableRow) =>
    ((row.totalCost as number | undefined) ?? 0 > 0) ? (
      <BadgeComponent type="cost" cost={row.totalCost as number} mini />
    ) : (
      emptyDash()
    ),
});
