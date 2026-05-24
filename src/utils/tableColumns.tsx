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
import ModelBadgeComponent from "../components/ModelBadgeComponent";
import ProvidersBadgeComponent from "../components/ProvidersBadgeComponent";
import AgentBadgeComponent from "../components/AgentBadgeComponent";
import ProjectBadgeComponent from "../components/ProjectBadgeComponent";
import UserBadgeComponent from "../components/UserBadgeComponent";
import CountLinkComponent from "../components/CountLinkComponent";
import CostBadgeComponent from "../components/CostBadgeComponent";
import ProportionBarComponent from "../components/ProportionBarComponent";
import ModalityIconComponent from "../components/ModalityIconComponent";

import ToolIconComponent from "../components/ToolIconComponent";
import {
  BadgeComponent,
  DateTimeBadgeComponent,
} from "@rodrigo-barraza/components-library";
import ProviderLogo from "../components/ProviderLogosComponent";
import { resolveProviderLabel } from "../components/ProviderLogosComponent";
import {
  formatTokenCount,
  formatLatency,
  formatTokensPerSec,
  formatDuration,
  getTotalInputTokens,
} from "./utilities";
import { PROVIDER_COLORS } from "../constants";

import StopwatchBadgeComponent from "../components/StopwatchBadgeComponent";
import TokenCountBadgeComponent from "../components/TokenCountBadgeComponent";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "../components/TableComponentsComponent.module.css";
import type { TokenUsage } from "../types/types";

/* -- Generic table row type -------------------------------- */

/**
 * Generic table row — columns are reused across many entity types
 * (conversations, sessions, requests, benchmarks, etc.) so we use
 * a wide index type. Individual column renderers narrow via field access.
 */
export interface TransformedTableRow {
  [key: string]: any;
}
export type TableRow = TransformedTableRow;

/* -- Helpers ---------------------------------------------- */

/** Renders a muted "—" dash — replaces all inline style={{ color: "var(--text-muted)" }} */
export const emptyDash = () => <span className={styles.emptyDash}>—</span>;

/** Render a value or a muted dash if falsy/zero */
export const valueOrDash = <T,>(value: T | undefined | null, render: (v: T) => React.ReactNode) =>
  value ? render(value) : emptyDash();

/** Merge modalities from an array of conversations into a single object */
export function mergeModalities(conversations: TableRow[]) {
  const merged: Record<string, boolean> = {};
  for (const c of conversations) {
    const modalities = c.modalities as Record<string, boolean | number> | undefined;
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

// formatDuration(ms) imported from @rodrigo-barraza/utilities-library via ./utilities

// Re-export PROVIDER_COLORS so existing consumers don't need to change imports
export { PROVIDER_COLORS };

/* -- Column Factories ------------------------------------- */

/* ·· Identity / name columns ·· */

export const modelColumn = () => ({
  key: "model",
  label: "Model",
  description: "The AI model identifier used for the request",
  render: (row: TableRow) => (
    <ModelBadgeComponent
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
    <ProvidersBadgeComponent providers={row.provider ? [row.provider as string] : []} />
  ),
});

export const projectColumn = () => ({
  key: "project",
  label: "Project",
  description: "The project or application this request belongs to",
  render: (row: TableRow) => <ProjectBadgeComponent project={row.project as string | undefined} />,
});

export const userColumn = () => ({
  key: "username",
  label: "User",
  description: "The user who initiated this request",
  sortable: false,
  render: (row: TableRow) => <UserBadgeComponent username={row.username as string | undefined} />,
});

/* ·· Models / Providers (as badge lists) ·· */

export const modelsListColumn = ({ mini = false }: { mini?: boolean } = {}) => ({
  key: "models",
  label: "Models",
  description: "All distinct models used in this group",
  sortable: false,
  render: (row: TableRow) => (
    <ModelBadgeComponent
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
  sortValue: (row: TableRow) => (row.models as string[] | undefined)?.length ?? (row.modelCount as number | undefined) ?? 0,
  render: (row: TableRow) => (
    <ModelBadgeComponent models={(row.models as string[] | undefined) ?? []} providers={row.providers as string[] | undefined} />
  ),
});

export const providersListColumn = ({ mini = false }: { mini?: boolean } = {}) => ({
  key: "providers",
  label: "Providers",
  description: "All distinct providers used in this group",
  sortable: false,
  render: (row: TableRow) => (
    <ProvidersBadgeComponent providers={row.providers as string[] | undefined} mini={mini} />
  ),
});

export const providerCountColumn = () => ({
  key: "providerCount",
  label: "Providers",
  description: "Number of distinct API providers used",
  sortValue: (row: TableRow) => ((row.providers as string[] | undefined) ?? []).length,
  render: (row: TableRow) => (
    <ProvidersBadgeComponent providers={(row.providers as string[] | undefined) ?? []} />
  ),
});

/* ·· Request / usage columns ·· */

export const requestsColumn = () => ({
  key: "totalRequests",
  label: "Requests",
  description: "Total number of API requests made",
  align: "right",
  render: (row: TableRow) => (row.totalRequests as number | undefined)?.toLocaleString() ?? "0",
});

export const requestCountColumn = () => ({
  key: "requestCount",
  label: "Requests",
  description: "Number of individual API calls",
  sortable: true,
  align: "right",
  render: (row: TableRow) =>
    ((row.requestCount as number | undefined) ?? 0) > 0 ? (
      <span className={styles.countCell}>
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
    const mods = fromConversations
      ? mergeModalities((row.conversations as TableRow[] | undefined) ?? [])
      : row.modalities as Record<string, boolean> | undefined;
    return mods ? Object.values(mods).filter(Boolean).length : 0;
  },
  render: (row: TableRow) => {
    const mods = fromConversations
      ? mergeModalities((row.conversations as TableRow[] | undefined) ?? [])
      : row.modalities as Record<string, boolean> | undefined;
    if (!mods) return emptyDash();
    return <ModalityIconComponent modalities={mods} size={mini ? 9 : 12} />;
  },
});

/* ·· Tools ·· */

export const toolsColumn = ({ mini = false, configModels }: { mini?: boolean; configModels?: Record<string, string[]> } = {}) => ({
  key: "toolDisplayNames",
  label: "Tools",
  description: "External tools and capabilities configured for this model",
  sortable: false,
  align: "left",
  render: (row: TableRow) => {
    // Support either direct toolDisplayNames array or config-based lookup
    if (configModels) {
      const tools = configModels[`${row.provider as string}:${row.model as string}`];
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
  tpsKey = "avgTokensPerSec",
  showDash = false,
}: { inputKey?: string; outputKey?: string; tpsKey?: string; showDash?: boolean } = {}) => [
  {
    key: inputKey,
    label: "Tokens In",
    description: "Total input (prompt) tokens consumed",
    align: "right",
    render: (row: TableRow) => {
      const v = row[inputKey] as number | undefined;
      if (showDash && !(v && v > 0)) return emptyDash();
      return formatTokenCount(v);
    },
  },
  {
    key: outputKey,
    label: "Tokens Out",
    description: "Total output (completion) tokens generated",
    align: "right",
    render: (row: TableRow) => {
      const v = row[outputKey] as number | undefined;
      if (showDash && !(v && v > 0)) return emptyDash();
      return formatTokenCount(v);
    },
  },
  {
    key: "totalTokens",
    label: "Tokens",
    description: "Combined input + output token count",
    align: "right",
    sortValue: (row: TableRow) => ((row[inputKey] as number | undefined) ?? 0) + ((row[outputKey] as number | undefined) ?? 0),
    render: (row: TableRow) => {
      const total = ((row[inputKey] as number | undefined) ?? 0) + ((row[outputKey] as number | undefined) ?? 0);
      if (showDash && total <= 0) return emptyDash();
      return total > 0 ? formatTokenCount(total) : "0";
    },
  },
  {
    key: tpsKey,
    label: "Tok/s",
    description: "Average output throughput in tokens per second",
    align: "right",
    render: (row: TableRow) => formatTokensPerSec(row[tpsKey] as number | undefined),
  },
];

/* ·· Cost columns ·· */

/** Returns 2 columns: Cost, Cost % */
export const costColumns = (
  totalCost: number,
  { costKey = "totalCost", mini = false }: { costKey?: string; mini?: boolean } = {},
) => [
  {
    key: costKey,
    label: "Cost",
    description: "Total estimated cost in USD",
    sortable: true,
    align: "right",
    render: (row: TableRow) => (
      <CostBadgeComponent cost={(row[costKey] as number) || 0} mini={mini} />
    ),
  },
  {
    key: "costShare",
    label: "Cost %",
    description: "Proportional share of total cost",
    sortable: true,
    sortValue: (row: TableRow) => row[costKey] as number | undefined,
    render: (row: TableRow) => (
      <ProportionBarComponent
        value={row[costKey] as number | undefined}
        total={totalCost}
        color="var(--warning)"
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
  align: "right",
  render: (row: TableRow) => {
    const v = row[key] as number | undefined;
    if (!v || v <= 0) return emptyDash();
    return formatLatency(v);
  },
});

/* ·· Count link columns (Sessions / Conversations / Workflows) ·· */

/**
 * Returns 3 columns with CountLinkComponent: Sessions, Conversations, Workflows.
 */
export const countLinkColumns = (entityKey: string, entityValue: (row: TableRow) => string) => [
  {
    key: "traceCount",
    label: "Traces",
    description: "Number of request traces that used this entity",
    align: "right",
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
    align: "right",
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
    align: "right",
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
  align: "right",
  render: (row: TableRow) => {
    const count =
      (row.conversationCount as number | undefined) ??
      ((row.conversations as TableRow[] | undefined) ?? []).length;
    return (
      <span className={styles.countCell}>
        <MessageSquare size={10} />
        {count}
      </span>
    );
  },
});

/* ·· Duration columns ·· */

export const durationColumn = ({ useDurationMs = false }: { useDurationMs?: boolean } = {}) => ({
  key: "duration",
  label: "Duration",
  description: "Elapsed wall-clock time from start to finish",
  sortable: false,
  align: "right",
  sortValue: (row: TableRow) => (useDurationMs ? getDurationMs(row) : 0),
  render: (row: TableRow) => {
    const ms = useDurationMs
      ? getDurationMs(row)
      : (() => {
          const s = row.startedAt as string | undefined;
          const f = row.finishedAt as string | undefined;
          if (!s || !f) return 0;
          return new Date(f).getTime() - new Date(s).getTime();
        })();
    const duration = formatDuration(ms);
    if (!duration) return emptyDash();
    return <StopwatchBadgeComponent seconds={ms / 1000} />;
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
      color="var(--accent-color)"
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
  align: "right",
  render: (row: TableRow) =>
    row[key] ? (
      <DateTimeBadgeComponent date={row[key] as string} highlightNew={highlightNew} />
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
  render: (s: TableRow) => (
    <a
      href={`/admin/chat?trace=${s.id as string}`}
      className={styles.sessionIdCell}
      title={`View conversations for trace ${s.id as string}`}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <FolderOpen size={12} className={styles.sessionIcon} />
      <span className={styles.sessionIdText}>{(s.id as string).slice(0, 8)}</span>
    </a>
  ),
});

/* ·· Conversation title ·· */

export const conversationTitleColumn = ({ mini = false }: { mini?: boolean } = {}) => ({
  key: "title",
  label: "Conversation",
  description: "Auto-generated conversation title",
  sortable: false,
  render: (c: TableRow) => (
    <span
      className={`${styles.conversationTitle} ${mini ? styles.conversationTitleMini : ""}`}
    >
      <MessageSquare size={mini ? 9 : 12} />
      {(c.title as string | undefined) || "Untitled"}
    </span>
  ),
});

/* ·· Project / User as inline badges (for Conversations) ·· */

export const projectBadgeColumn = ({ mini = false }: { mini?: boolean } = {}) => ({
  key: "project",
  label: "Project",
  description: "The project this conversation belongs to",
  sortable: false,
  render: (c: TableRow) =>
    c.project ? (
      <BadgeComponent variant="info" mini={mini}>
        {c.project as string}
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
  render: (c: TableRow) =>
    c.username && c.username !== "unknown" ? (
      <BadgeComponent variant="provider" mini={mini}>
        {c.username as string}
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
  render: (r: TableRow) => (
    <BadgeComponent variant="endpoint">{(r.endpoint as string | undefined) || "-"}</BadgeComponent>
  ),
});

export const operationColumn = () => ({
  key: "operation",
  label: "Operation",
  description:
    "The semantic purpose of this LLM call (e.g. chat, agent:iteration, memory:extract)",
  render: (r: TableRow) => (
    <BadgeComponent variant="info">{(r.operation as string | undefined) || "-"}</BadgeComponent>
  ),
});

/* ·· Agent ·· */

export const agentColumn = () => ({
  key: "agent",
  label: "Agent",
  description:
    "The originating agent that made this request (e.g. CODING, LUPOS)",
  sortable: false,
  render: (r: TableRow) => {
    // Normalize: sessions expose `agents` (array), requests expose `agent` (string)
    const agents = (r.agents as string[] | undefined) ?? (r.agent ? [r.agent as string] : []);
    return <AgentBadgeComponent agents={agents} />;
  },
});

/* ·· Status ·· */

export const statusColumn = () => ({
  key: "success",
  label: "Status",
  description:
    "Whether the request completed successfully (OK) or failed (ERR)",
  align: "right",
  render: (r: TableRow) => (
    <BadgeComponent variant={r.success ? "success" : "error"}>
      {r.success ? "OK" : "ERR"}
    </BadgeComponent>
  ),
});

/* -- Benchmark result columns ---------------------------- */

export const benchmarkStatusColumn = () => ({
  key: "status",
  label: "Status",
  description: "Whether the model passed, failed, or errored on this benchmark",
  sortValue: (r: TableRow) =>
    r._running ? -2 : r._pending ? -3 : r.error ? -1 : r.passed ? 1 : 0,
  render: (r: TableRow) => {
    if (r._pending) {
      return (
        <span className={styles.benchmarkStatusCell}>
          <Circle size={16} className={styles.benchmarkPendingIcon} />
          <span>Queued</span>
        </span>
      );
    }
    if (r._running) {
      return (
        <span className={styles.benchmarkStatusCell}>
          <Loader2 size={16} className={styles.benchmarkRunningIcon} />
          <span>{(r._phase as string | undefined) || "Running"}</span>
        </span>
      );
    }
    if (r.error) {
      return (
        <span className={styles.benchmarkStatusCell}>
          <AlertTriangle size={16} className={styles.benchmarkErrorIcon} />
          <span>Error</span>
        </span>
      );
    }
    if (r.passed) {
      return (
        <span className={styles.benchmarkStatusCell}>
          <CheckCircle2 size={16} className={styles.benchmarkPassIcon} />
          <span>Pass</span>
        </span>
      );
    }
    return (
      <span className={styles.benchmarkStatusCell}>
        <XCircle size={16} className={styles.benchmarkFailIcon} />
        <span>Fail</span>
      </span>
    );
  },
});

export const benchmarkModelColumn = () => ({
  key: "label",
  label: "Model",
  description: "The model and provider tested",
  render: (r: TableRow) => (
    <span
      className={`${styles.benchmarkModelCell} ${r._pending ? styles.benchmarkModelPending : ""}`}
    >
      <span className={styles.benchmarkModelName}>{r.label as string}</span>
      <span className={styles.benchmarkModelProviderRow}>
        <span className={styles.benchmarkModelProvider}>
          {resolveProviderLabel(r.provider as string | undefined)}
        </span>
        {!!r._running && typeof r._progress === "number" && r._progress > 0 && (
          <span className={styles.benchmarkProgressPct}>
            {Math.round(r._progress * 100)}%
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
  sortValue: (r: TableRow) => (r.toolsEnabled ? 1 : 0),
  defaultHidden: true,
  render: (r: TableRow) => {
    if (!r.toolsEnabled) return emptyDash();
    const rawToolCalls = r.toolCalls as Array<{ name?: string }> | undefined;
    const toolNames = rawToolCalls?.length
      ? [...new Set(rawToolCalls.map((tc) => tc.name).filter(Boolean))] as string[]
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
  sortValue: (r: TableRow) => (r.thinkingEnabled ? 1 : 0),
  defaultHidden: true,
  render: (r: TableRow) =>
    r.thinkingEnabled ? (
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
export const benchmarkSizeColumn = ({ modelConfigMap = {} }: { modelConfigMap?: Record<string, { size?: string }> } = {}) => ({
  key: "size",
  label: "Size",
  description: "Model file/weight size on disk (local models only)",
  sortable: true,
  sortValue: (r: TableRow) => {
    const config = modelConfigMap[`${r.provider as string}:${r.model as string}`];
    const s = config?.size ?? "";
    const match = s.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "GB") return value * 1024;
    if (unit === "MB") return value;
    return value / 1024;
  },
  align: "right",
  render: (r: TableRow) => {
    const config = modelConfigMap[`${r.provider as string}:${r.model as string}`];
    if (!config?.size) return emptyDash();
    return (
      <span className={styles.benchmarkTpsCell}>
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

  const norm = (s: string) => s.trim().toLowerCase();
  const normText = norm(text);
  const normExpected = norm(expected);

  // For regex mode, find the first match in the original text
  if (matchMode === "regex") {
    try {
      const regex = new RegExp(`(${expected})`, "i");
      const match = text.match(regex);
      if (!match || match.index === undefined) return text;
      const index = match.index;
      const len = match[0].length;
      return (
        <>
          {text.slice(0, index)}
          <mark className={styles.benchmarkHighlight}>
            {text.slice(index, index + len)}
          </mark>
          {text.slice(index + len)}
        </>
      );
    } catch {
      return text;
    }
  }

  // For exact mode — highlight the entire response if it matches
  if (matchMode === "exact" && normText === normExpected) {
    return <mark className={styles.benchmarkHighlight}>{text}</mark>;
  }

  // For contains / startsWith — find the substring position (case-insensitive)
  const index = normText.indexOf(normExpected);
  if (index === -1) return text;

  const before = text.slice(0, index);
  const matched = text.slice(index, index + expected.trim().length);
  const after = text.slice(index + expected.trim().length);

  return (
    <>
      {before}
      <mark className={styles.benchmarkHighlight}>{matched}</mark>
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
  render: (r: TableRow) => {
    if (r.error) {
      return <span className={styles.benchmarkErrorMessage}>{r.error as string}</span>;
    }
    return (
      <span className={styles.benchmarkResponseCell} title={r.response as string | undefined}>
        {expectedValue
          ? highlightExpected(
              r.response as string,
              expectedValue,
              matchMode ?? (r.matchMode as string | undefined) ?? "contains",
            )
          : (r.response as string | undefined) || "—"}
      </span>
    );
  },
});

export const benchmarkLatencyColumn = () => ({
  key: "latency",
  label: "Latency",
  description: "Time taken for the model to respond",
  sortable: true,
  align: "right",
  render: (r: TableRow) =>
    r.latency ? (
      <span className={styles.monoCell}>{formatLatency(r.latency as number)}</span>
    ) : (
      emptyDash()
    ),
});

export const benchmarkDurationColumn = () => ({
  key: "duration",
  label: "Duration",
  description: "Wall-clock time from request start to finish",
  sortable: true,
  sortValue: (r: TableRow) => (r.latency as number | undefined) ?? 0,
  align: "right",
  render: (r: TableRow) => {
    if (!r.latency) return emptyDash();
    return <StopwatchBadgeComponent seconds={r.latency as number} />;
  },
});

export const benchmarkTokensInColumn = () => ({
  key: "tokensIn",
  label: "Tokens In",
  description: "Input (prompt) tokens consumed by this model",
  sortable: true,
  sortValue: (r: TableRow) => getTotalInputTokens(r.usage as TokenUsage | undefined) ?? 0,
  align: "right",
  render: (r: TableRow) => {
    const v = getTotalInputTokens(r.usage as TokenUsage | undefined);
    return v > 0 ? (
      <TokenCountBadgeComponent value={v} label="in" mini />
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
  sortValue: (r: TableRow) => (r.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0,
  align: "right",
  render: (r: TableRow) => {
    const v = (r.usage as { outputTokens?: number } | undefined)?.outputTokens ?? 0;
    return v > 0 ? (
      <TokenCountBadgeComponent value={v} label="out" mini />
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
  sortValue: (r: TableRow) => {
    const usage = r.usage as { outputTokens?: number } | undefined;
    const out = usage?.outputTokens ?? 0;
    const lat = r.latency as number | undefined;
    return lat && lat > 0 && out > 0 ? out / lat : 0;
  },
  align: "right",
  render: (r: TableRow) => {
    const usage = r.usage as { outputTokens?: number } | undefined;
    const out = usage?.outputTokens ?? 0;
    const lat = r.latency as number | undefined;
    if (!lat || lat <= 0 || out <= 0) return emptyDash();
    const tps = out / lat;
    return (
      <span className={styles.benchmarkTpsCell}>
        <Gauge size={10} />
        {tps.toFixed(1)}
      </span>
    );
  },
});

export const benchmarkCostColumn = () => ({
  key: "estimatedCost",
  label: "Cost",
  description: "Estimated cost for this individual model run",
  sortable: true,
  align: "right",
  render: (r: TableRow) =>
    r.estimatedCost != null ? (
      <CostBadgeComponent cost={r.estimatedCost as number} mini />
    ) : (
      emptyDash()
    ),
});

export const benchmarkDateColumn = () => ({
  key: "completedAt",
  label: "Date",
  description: "When this model was tested",
  sortable: true,
  align: "right",
  render: (r: TableRow) =>
    r.completedAt ? (
      <DateTimeBadgeComponent date={r.completedAt as string} />
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
  render: (r: TableRow) => (
    <BadgeComponent variant="info" mini>
      {MATCH_MODE_LABELS[r.matchMode as string] ?? (r.matchMode as string | undefined) ?? "—"}
    </BadgeComponent>
  ),
});

/* -- Benchmark Dashboard columns (aggregated model stats) -- */

export const dashboardModelColumn = () => ({
  key: "label",
  label: "Model",
  description: "Model name and provider tested across benchmarks",
  sortable: true,
  render: (r: TableRow) => (
    <span className={styles.dashboardModelCell}>
      <ProviderLogo provider={r.provider as string | undefined} size={16} />
      <span className={styles.dashboardModelName}>{r.label as string}</span>
    </span>
  ),
});

export const dashboardProviderColumn = () => ({
  key: "provider",
  label: "Provider",
  description: "The API provider hosting this model",
  sortable: true,
  render: (r: TableRow) => (
    <ProvidersBadgeComponent providers={r.provider ? [r.provider as string] : []} />
  ),
});

export const dashboardTestsColumn = () => ({
  key: "total",
  label: "Tests",
  description: "Total number of benchmark tests run for this model",
  sortable: true,
  align: "right",
  render: (r: TableRow) => <span className={styles.monoCell}>{r.total as number}</span>,
});

export const dashboardPassedColumn = () => ({
  key: "passed",
  label: "Pass",
  description: "Number of benchmark tests this model passed",
  sortable: true,
  align: "right",
  render: (r: TableRow) => (
    <span className={styles.dashboardPassedCell}>
      <CheckCircle2 size={12} />
      {r.passed as number}
    </span>
  ),
});

export const dashboardFailedColumn = () => ({
  key: "failed",
  label: "Fail",
  description: "Number of benchmark tests this model failed or errored",
  sortable: true,
  sortValue: (r: TableRow) => (r.failed as number) + (r.errored as number),
  align: "right",
  render: (r: TableRow) => (
    <span className={styles.dashboardFailedCell}>
      <XCircle size={12} />
      {(r.failed as number) + (r.errored as number)}
    </span>
  ),
});

export const dashboardPassRateColumn = () => ({
  key: "passRate",
  label: "Pass Rate",
  description: "Percentage of benchmark tests this model passed",
  sortable: true,
  width: "100px",
  render: (r: TableRow) => {
    const percentage = Math.round((r.passRate as number) * 100);
    const color =
      percentage >= 80
        ? "var(--success)"
        : percentage >= 50
          ? "var(--warning)"
          : "var(--danger)";
    return (
      <span className={styles.dashboardRateCell}>
        <span className={styles.dashboardRateBar}>
          <span
            className={styles.dashboardRateBarFill}
            style={{ width: `${percentage}%`, background: color }}
          />
        </span>
        <span className={styles.dashboardRateValue} style={{ color }}>
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
  align: "right",
  render: (r: TableRow) => <StopwatchBadgeComponent seconds={r.avgLatency as number} />,
});

export const dashboardCostColumn = () => ({
  key: "totalCost",
  label: "Cost",
  description: "Total estimated cost across all benchmark tests for this model",
  sortable: true,
  align: "right",
  render: (r: TableRow) =>
    (r.totalCost as number | undefined) ?? 0 > 0 ? (
      <CostBadgeComponent cost={r.totalCost as number} mini />
    ) : (
      emptyDash()
    ),
});
