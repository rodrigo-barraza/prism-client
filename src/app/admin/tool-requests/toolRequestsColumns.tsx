import { BadgeComponent } from "@rodrigo-barraza/components-library";
import ProportionBarComponent from "../../../components/ProportionBarComponent";
import {
  createdAtColumn,
  statusColumn,
  emptyDash,
} from "../../../utils/tableColumns";
import { formatLatencyMs, formatFileSize } from "../../../utils/utilities";

/**
 * getToolRequestsColumns — column definitions for the tool-call telemetry table.
 *

 * @param {number} [opts.totalDuration=1] — Total elapsed ms across all visible calls
 *                                          (used for Duration % proportion bar)
 */
export const getToolRequestsColumns = ({ totalDuration = 1 }: any = {}) => [
  createdAtColumn("timestamp"),
  {
    key: "toolName",
    label: "Tool",
    description: "The tool function that was invoked",
    sortable: true,
    render: (r: any) => (
      <BadgeComponent variant="provider">{r.toolName || "—"}</BadgeComponent>
    ),
  },
  {
    key: "domain",
    label: "Domain",
    description: "The functional domain this tool belongs to (e.g. Weather, Health, Compute)",
    sortable: true,
    render: (r: any) => (
      <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
    ),
  },
  {
    key: "method",
    label: "Method",
    description: "HTTP method used for the tool invocation",
    sortable: false,
    render: (r: any) => (
      <BadgeComponent variant={r.method === "POST" ? "warning" : "endpoint"}>
        {r.method || "—"}
      </BadgeComponent>
    ),
  },
  {
    key: "callerAgent",
    label: "Agent",
    description: "The agentic persona that triggered this tool call (e.g. CODING, LUPOS)",
    sortable: true,
    render: (r: any) =>
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
    render: (r: any) =>
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
    render: (r: any) => {
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
    sortValue: (r: any) => r.elapsedMs || 0,
    render: (r: any) => (
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
    render: (r: any) =>
      r.inBytes > 0
        ? formatFileSize(r.inBytes)
        : emptyDash(),
  },
  {
    key: "outBytes",
    label: "Out",
    description: "Response payload size in bytes",
    sortable: true,
    align: "right",
    render: (r: any) =>
      r.outBytes > 0
        ? formatFileSize(r.outBytes)
        : emptyDash(),
  },
  {
    key: "callerIteration",
    label: "Iteration",
    description: "The agentic loop iteration that dispatched this tool call",
    sortable: true,
    align: "right",
    render: (r: any) =>
      r.callerIteration != null ? (
        <BadgeComponent variant="info">#{r.callerIteration}</BadgeComponent>
      ) : (
        emptyDash()
      ),
  },
  statusColumn(),
];
