import { useMemo, useCallback } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import styles from "./BenchmarkDashboardComponent.module.css";
import {
  dashboardModelColumn,
  dashboardProviderColumn,
  dashboardTestsColumn,
  dashboardPassedColumn,
  dashboardFailedColumn,
  dashboardPassRateColumn,
  dashboardAvgLatencyColumn,
  dashboardCostColumn,
} from "../utils/tableColumns";

/**
 * BenchmarkDashboardTableComponent — reusable table for the /benchmarks
 * dashboard, displaying aggregated per-model performance stats.
 * Uses the shared TableComponent base with column definitions from
 * tableColumns.js, following the same pattern as BenchmarksTableComponent,
 * ConversationsTableComponent, etc.
 */
export default function BenchmarkDashboardTableComponent({
  models = [],
  onRowClick,
  selectedModel,
  emptyText = "No benchmark data",
  title,
  maxHeight,
}: unknown) {
  const columns = useMemo(
    () => [
      dashboardPassRateColumn(),
      dashboardPassedColumn(),
      dashboardFailedColumn(),
      dashboardModelColumn(),
      dashboardProviderColumn(),
      dashboardTestsColumn(),
      dashboardAvgLatencyColumn(),
      dashboardCostColumn(),
    ],
    [],
  );

  const getRowClassName = useCallback(
    (row) => {
      if (
        selectedModel &&
        row.model === selectedModel.model &&
        row.provider === selectedModel.provider
      ) {
        return styles.selectedRow;
      }
      return "";
    },
    [selectedModel],
  );

  return (
    <TableComponent
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={models}
      getRowKey={(m: unknown, i: unknown) => `${m.provider}:${m.model}:${i}`}
      onRowClick={onRowClick}
      getRowClassName={getRowClassName}
      emptyText={emptyText}
      storageKey="benchmark-dashboard"
    />
  );
}
