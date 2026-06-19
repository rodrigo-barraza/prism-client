import { TableComponent } from "@rodrigo-barraza/components-library";
import ProportionBarComponent from "./ProportionBarComponent";
import {
  providerColumn,
  requestsColumn,
  modelCountColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  countLinkColumns,
  PROVIDER_COLORS,
} from "../utils/tableColumns";
import type { IrisProviderStat } from "../types/types";

interface ProvidersTableProps {
  providers?: IrisProviderStat[];
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  compact?: boolean;
  title?: React.ReactNode;
  maxHeight?: number;
}

/**
 * ProvidersTableComponent — reusable admin table for displaying provider-level
 * aggregated stats (requests, tokens, cost, latency, etc.).
 */
export default function ProvidersTableComponent({
  providers = [],
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText = "No data yet",
  compact = false,
  title = "Providers",
  maxHeight = 420,
}: ProvidersTableProps) {
  const totalRequests =
    (totalRequestsProp ?? providers.reduce((sum, provider) => sum + provider.totalRequests, 0)) ||
    1;
  const totalCost =
    (totalCostProp ?? providers.reduce((sum, provider) => sum + (provider.totalCost || 0), 0)) ||
    1;

  const allColumns = [
    providerColumn(),
    requestsColumn(),
    {
      key: "usage",
      label: "Usage",
      sortValue: (providerStat: IrisProviderStat) => providerStat.totalRequests,
      render: (providerStat: IrisProviderStat, index: number) => (
        <ProportionBarComponent
          value={providerStat.totalRequests}
          total={totalRequests}
          color={PROVIDER_COLORS[index % PROVIDER_COLORS.length]}
        />
      ),
    },
    modelCountColumn(),
    ...tokenColumns(),
    ...costColumns(totalCost),
    latencyColumn(),
    ...countLinkColumns("provider", (row) => String(row.provider || "")),
  ];

  const COMPACT_KEYS = [
    "provider",
    "totalRequests",
    "modelCount",
    "totalCost",
    "avgLatency",
  ];
  const columns = compact
    ? allColumns.filter((column) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  return (
    <TableComponent
      className="providers-table-component"
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={providers}
      getRowKey={(providerStat: IrisProviderStat, index: number) => `${providerStat.provider}-${index}`}
      emptyText={emptyText}
      storageKey="providers"
    />
  );
}
