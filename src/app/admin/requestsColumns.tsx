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
import { formatLatency } from "../../utils/utilities";
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
    align: "left",
    render: (r: IrisRequestEntry) => {
      if (!r.toolsUsed || !r.toolDisplayNames?.length) return emptyDash();
      return (
        <ToolIconComponent
          toolDisplayNames={r.toolDisplayNames}
          toolApiNames={r.toolApiNames}
          size={mini ? 10 : undefined}
        />
      );
    },
  },
  ...tokenColumns({
    inputKey: "inputTokens",
    outputKey: "outputTokens",
    tpsKey: "tokensPerSec",
  }),
  ...costColumns(totalCost, { costKey: "estimatedCost", mini }),
  latencyColumn("totalTime", "Latency"),
  {
    key: "duration",
    label: "Duration",
    sortable: true,
    sortValue: (r: IrisRequestEntry) => r.totalTime || 0,
    align: "right",
    render: (r: IrisRequestEntry) => valueOrDash(r.totalTime, (v: number) => formatLatency(v)),
  },
  {
    key: "durationShare",
    label: "Duration %",
    sortable: true,
    sortValue: (r: IrisRequestEntry) => r.totalTime || 0,
    render: (r: IrisRequestEntry) => (
      <ProportionBarComponent
        value={r.totalTime || 0}
        total={totalDuration}
        color="var(--accent-color)"
        mini={mini}
      />
    ),
  },
  statusColumn(),
];
