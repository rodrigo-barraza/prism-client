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

/**
 * ProvidersTableComponent — reusable admin table for displaying provider-level
 * aggregated stats (requests, tokens, cost, latency, etc.).
 *

 * @param {Array}   props.providers         - Array of provider stat objects


 */
export default function ProvidersTableComponent({
  providers = [],
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText = "No data yet",
  compact = false,
  title = "Providers",
  maxHeight = 420,
}: any) {
  const totalRequests =
    (totalRequestsProp ??
      providers.reduce((s: any, p: any) => s + p.totalRequests, 0)) ||
    1;
  const totalCost =
    (totalCostProp ??
      providers.reduce((s: any, p: any) => s + (p.totalCost || 0), 0)) ||
    1;

  const allColumns = [
    providerColumn(),
    requestsColumn(),
    {
      key: "usage",
      label: "Usage",
      sortValue: (p: any) => p.totalRequests,
      render: (p: any, i: any) => (
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
    ...countLinkColumns("provider", (row: any) => row.provider),
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
      getRowKey={(p: any, i: any) => `${p.provider}-${i}`}
      emptyText={emptyText}
      storageKey="providers"
    />
  );
}
