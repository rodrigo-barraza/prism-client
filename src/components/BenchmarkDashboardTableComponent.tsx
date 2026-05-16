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
 *
 * @param {Object}   props
 * @param {Array}    props.models           - Array of aggregated model stats
 * @param {Function} [props.onRowClick]     - (row) => void — called when a row is clicked
 * @param {Object}   [props.selectedModel]  - Currently selected model row (for highlight)
 * @param {string}   [props.emptyText]      - Text shown when no data
 * @param {string}   [props.title]          - Optional table title
 * @param {number}   [props.maxHeight]      - Optional max height for scrollable body
 */
export default function BenchmarkDashboardTableComponent({
  models = [],
  // @ts-ignore
  // @ts-ignore
  onRowClick: any,
  // @ts-ignore
  // @ts-ignore
  selectedModel: any,
  emptyText = "No benchmark data",
  // @ts-ignore
  // @ts-ignore
  title: any,
  // @ts-ignore
  // @ts-ignore
  maxHeight: any,
}) {
  const columns = useMemo<any>(
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
    (row: any) => {
      if (
        // @ts-ignore
        selectedModel &&
        // @ts-ignore
        row.model === selectedModel.model &&
        // @ts-ignore
        row.provider === selectedModel.provider
      ) {
        return styles.selectedRow;
      }
      return "";
    },
    // @ts-ignore
    [selectedModel],
  );

  return (
    <TableComponent
      // @ts-ignore
      title={title}
      // @ts-ignore
      maxHeight={maxHeight}
      columns={columns}
      data={models}
      getRowKey={(m: any, i: any) => `${m.provider}:${m.model}:${i}`}
      // @ts-ignore
      onRowClick={onRowClick}
      getRowClassName={getRowClassName}
      emptyText={emptyText}
      storageKey="benchmark-dashboard"
    />
  );
}
