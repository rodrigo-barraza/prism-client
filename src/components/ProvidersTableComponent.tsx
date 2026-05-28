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
    (totalRequestsProp ?? providers.reduce((s, p) => s + p.totalRequests, 0)) ||
    1;
  const totalCost =
    (totalCostProp ?? providers.reduce((s, p) => s + (p.totalCost || 0), 0)) ||
    1;

  const allColumns = [
    providerColumn(),
    requestsColumn(),
    {
      key: "usage",
      label: "Usage",
      sortValue: (p: any) => p.totalRequests,
      render: (p: any, i: number) => (
        <ProportionBarComponent
          value={p.totalRequests}
          total={totalRequests}
          color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
        />
      ),
    },
    modelCountColumn(),
    ...tokenColumns(),
    ...costColumns(totalCost),
    latencyColumn(),
    ...countLinkColumns("provider", (row: any) => String(row.provider || "")),
  ];

  const COMPACT_KEYS = [
    "provider",
    "totalRequests",
    "modelCount",
    "totalCost",
    "avgLatency",
  ];
  const columns = compact
    ? allColumns.filter((c: any) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={providers}
      getRowKey={(p: any, i: number) => `${p.provider}-${i}`}
      emptyText={emptyText}
      storageKey="providers"
    />
  );
}
