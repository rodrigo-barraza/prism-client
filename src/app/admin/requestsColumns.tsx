import type { IrisRequestEntry } from "../../services/IrisService";
import ToolIconComponent from "../../components/ToolIconComponent";
import {
  modelColumn,
  providerColumn,
  projectColumn,
  modalitiesColumn,
  endpointColumn,
  operationColumn,
  agentColumn,
  tokenColumns,
  costColumns,
  statusColumn,
  createdAtColumn,
  latencyColumn,
  emptyDash,
  valueOrDash,
} from "../../utils/tableColumns";
import { formatLatency } from "@rodrigo-barraza/utilities-library";
import ProportionBarComponent from "../../components/ProportionBarComponent";

/**
 * getRequestsColumns — shared column definitions for the requests table.
 */
export const getRequestsColumns = ({
  totalCost = 1,
  totalDuration = 1,
  mini = false,
}: { totalCost?: number; totalDuration?: number; mini?: boolean } = {}) => [
  createdAtColumn("timestamp"),
  projectColumn(),
  modalitiesColumn({ mini }),
  endpointColumn(),
  operationColumn(),
  agentColumn(),
  providerColumn(),
  modelColumn(),
  {
    key: "toolsUsed",
    label: "Tools",
    sortable: true,
    align: "left" as const,
    render: (request: IrisRequestEntry) => {
      if (!request.toolsUsed || !request.toolDisplayNames?.length) return emptyDash();
      return (
        <ToolIconComponent
          toolDisplayNames={request.toolDisplayNames}
          toolApiNames={request.toolApiNames}
          size={mini ? 10 : undefined}
        />
      );
    },
  },
  ...tokenColumns({
    inputKey: "inputTokens",
    outputKey: "outputTokens",
    tokensPerSecondKey: "tokensPerSec",
  }),
  ...costColumns(totalCost, { costKey: "estimatedCost", mini }),
  latencyColumn("totalTime", "Latency"),
  {
    key: "duration",
    label: "Duration",
    sortable: true,
    sortValue: (request: IrisRequestEntry) => request.totalTime || 0,
    align: "right" as const,
    render: (request: IrisRequestEntry) =>
      valueOrDash(request.totalTime, (value: number) => formatLatency(value)),
  },
  {
    key: "durationShare",
    label: "Duration %",
    sortable: true,
    sortValue: (request: IrisRequestEntry) => request.totalTime || 0,
    render: (request: IrisRequestEntry) => (
      <ProportionBarComponent
        value={request.totalTime || 0}
        total={totalDuration}
        color="var(--accent-primary)"
        mini={mini}
      />
    ),
  },
  statusColumn(),
];
