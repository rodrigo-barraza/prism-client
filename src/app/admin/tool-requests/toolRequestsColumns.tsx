import { BadgeComponent } from "@rodrigo-barraza/components-library";
import ProportionBarComponent from "../../../components/ProportionBarComponent";
import {
  createdAtColumn,
  statusColumn,
  emptyDash,
} from "../../../utils/tableColumns";
import { formatLatencyMilliseconds, formatFileSize } from "@rodrigo-barraza/utilities-library";
import type { JsonValue } from "../../../types/types";
export interface ToolCallRecord {
  _id?: string;
  toolName?: string;
  domain?: string;
  method?: string;
  path?: string;
  status?: number | string;
  success?: boolean;
  errorMessage?: string;
  elapsedMs?: number;
  inBytes?: number;
  outBytes?: number;
  callerProject?: string;
  callerUsername?: string;
  callerAgent?: string;
  callerRequestId?: string;
  callerConversationId?: string;
  callerIteration?: number;
  clientIp?: string;
  timestamp?: string;
  args?: Record<string, JsonValue>;
  result?: Record<string, JsonValue>;
}

/**
 * getToolRequestsColumns — column definitions for the tool-call telemetry table.
 */
export const getToolRequestsColumns = ({
  totalDuration = 1,
}: { totalDuration?: number } = {}) => [
  createdAtColumn("timestamp"),
  {
    key: "toolName",
    label: "Tool",
    description: "The tool function that was invoked",
    sortable: true,
    render: (record: ToolCallRecord) => (
      <BadgeComponent variant="provider">{record.toolName || "—"}</BadgeComponent>
    ),
  },
  {
    key: "domain",
    label: "Domain",
    description:
      "The functional domain this tool belongs to (e.g. Weather, Health, Compute)",
    sortable: true,
    render: (record: ToolCallRecord) => (
      <BadgeComponent variant="info">{record.domain || "—"}</BadgeComponent>
    ),
  },
  {
    key: "method",
    label: "Method",
    description: "HTTP method used for the tool invocation",
    sortable: false,
    render: (record: ToolCallRecord) => (
      <BadgeComponent variant={record.method === "POST" ? "warning" : "endpoint"}>
        {record.method || "—"}
      </BadgeComponent>
    ),
  },
  {
    key: "callerAgent",
    label: "Agent",
    description:
      "The agentic persona that triggered this tool call (e.g. CODING, LUPOS)",
    sortable: true,
    render: (record: ToolCallRecord) =>
      record.callerAgent ? (
        <BadgeComponent variant="accent">{record.callerAgent}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  {
    key: "callerUsername",
    label: "User",
    description: "The user whose conversation triggered the tool call",
    sortable: true,
    render: (record: ToolCallRecord) =>
      record.callerUsername ? (
        <BadgeComponent variant="provider">{record.callerUsername}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  {
    key: "elapsedMs",
    label: "Latency",
    description: "Server-side execution time for this tool call",
    sortable: true,
    align: "right" as const,
    render: (record: ToolCallRecord) => {
      if (!record.elapsedMs || record.elapsedMs <= 0) return emptyDash();
      // Convert ms to human-readable latency
      return formatLatencyMilliseconds(record.elapsedMs);
    },
  },
  {
    key: "durationShare",
    label: "Latency %",
    description: "Proportional share of total latency",
    sortable: true,
    sortValue: (record: ToolCallRecord) => record.elapsedMs || 0,
    render: (record: ToolCallRecord) => (
      <ProportionBarComponent
        value={record.elapsedMs || 0}
        total={totalDuration}
        color="var(--accent-primary)"
      />
    ),
  },
  {
    key: "inBytes",
    label: "In",
    description: "Request payload size in bytes",
    sortable: true,
    align: "right" as const,
    render: (record: ToolCallRecord) =>
      (record.inBytes || 0) > 0 ? formatFileSize(record.inBytes || 0) : emptyDash(),
  },
  {
    key: "outBytes",
    label: "Out",
    description: "Response payload size in bytes",
    sortable: true,
    align: "right" as const,
    render: (record: ToolCallRecord) =>
      (record.outBytes || 0) > 0 ? formatFileSize(record.outBytes || 0) : emptyDash(),
  },
  {
    key: "callerIteration",
    label: "Iteration",
    description: "The agentic loop iteration that dispatched this tool call",
    sortable: true,
    align: "right" as const,
    render: (record: ToolCallRecord) =>
      record.callerIteration != null ? (
        <BadgeComponent variant="info">#{record.callerIteration}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  statusColumn(),
];
