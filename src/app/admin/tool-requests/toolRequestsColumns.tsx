import { BadgeComponent } from "@rodrigo-barraza/components-library";
import ProportionBarComponent from "../../../components/ProportionBarComponent";
import {
  createdAtColumn,
  statusColumn,
  emptyDash,
} from "../../../utils/tableColumns";
import { formatLatencyMs, formatFileSize } from "../../../utils/utilities";


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
  args?: Record<string, any>;
  result?: Record<string, any>;
}


/**
 * getToolRequestsColumns — column definitions for the tool-call telemetry table.
 */
export const getToolRequestsColumns = ({ totalDuration = 1 }: { totalDuration?: number } = {}) => [
  createdAtColumn("timestamp"),
  {
    key: "toolName",
    label: "Tool",
    description: "The tool function that was invoked",
    sortable: true,
    render: (r: ToolCallRecord) => (
      <BadgeComponent variant="provider">{r.toolName || "—"}</BadgeComponent>
    ),
  },
  {
    key: "domain",
    label: "Domain",
    description:
      "The functional domain this tool belongs to (e.g. Weather, Health, Compute)",
    sortable: true,
    render: (r: ToolCallRecord) => (
      <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
    ),
  },
  {
    key: "method",
    label: "Method",
    description: "HTTP method used for the tool invocation",
    sortable: false,
    render: (r: ToolCallRecord) => (
      <BadgeComponent variant={r.method === "POST" ? "warning" : "endpoint"}>
        {r.method || "—"}
      </BadgeComponent>
    ),
  },
  {
    key: "callerAgent",
    label: "Agent",
    description:
      "The agentic persona that triggered this tool call (e.g. CODING, LUPOS)",
    sortable: true,
    render: (r: ToolCallRecord) =>
      r.callerAgent ? (
        <BadgeComponent variant="accent">{r.callerAgent}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  {
    key: "callerUsername",
    label: "User",
    description: "The user whose session triggered the tool call",
    sortable: true,
    render: (r: ToolCallRecord) =>
      r.callerUsername ? (
        <BadgeComponent variant="provider">{r.callerUsername}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  {
    key: "elapsedMs",
    label: "Latency",
    description: "Server-side execution time for this tool call",
    sortable: true,
    align: "right",
    render: (r: ToolCallRecord) => {
      if (!r.elapsedMs || r.elapsedMs <= 0) return emptyDash();
      // Convert ms to human-readable latency
      return formatLatencyMs(r.elapsedMs);
    },
  },
  {
    key: "durationShare",
    label: "Latency %",
    description: "Proportional share of total latency",
    sortable: true,
    sortValue: (r: ToolCallRecord) => r.elapsedMs || 0,
    render: (r: ToolCallRecord) => (
      <ProportionBarComponent
        value={r.elapsedMs || 0}
        total={totalDuration}
        color="var(--accent-color)"
      />
    ),
  },
  {
    key: "inBytes",
    label: "In",
    description: "Request payload size in bytes",
    sortable: true,
    align: "right",
    render: (r: ToolCallRecord) =>
      (r.inBytes || 0) > 0 ? formatFileSize(r.inBytes || 0) : emptyDash(),
  },
  {
    key: "outBytes",
    label: "Out",
    description: "Response payload size in bytes",
    sortable: true,
    align: "right",
    render: (r: ToolCallRecord) =>
      (r.outBytes || 0) > 0 ? formatFileSize(r.outBytes || 0) : emptyDash(),
  },
  {
    key: "callerIteration",
    label: "Iteration",
    description: "The agentic loop iteration that dispatched this tool call",
    sortable: true,
    align: "right",
    render: (r: ToolCallRecord) =>
      r.callerIteration != null ? (
        <BadgeComponent variant="info">#{r.callerIteration}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  statusColumn(),
];
