"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { TableComponent } from "@rodrigo-barraza/components-library";
import {
  conversationTitleColumn,
  projectBadgeColumn,
  userBadgeColumn,
  modalitiesColumn,
  modelsListColumn,
  providersListColumn,
  toolsColumn,
  requestCountColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  durationColumn,
  durationShareColumn,
  createdAtColumn,
  getDurationMs,
} from "../utils/tableColumns";

/**
 * ConversationsTableComponent — reusable admin table for displaying
 * conversation lists (used in sessions, request associations, etc.).
 */
export default function ConversationsTableComponent({
  conversations = [],
  emptyText = "No conversations",
  sortKey,
  sortDir,
  onSort,
  compact = false,
  mini = false,
  maxHeight,
  title,
  traceId = null,
}: unknown) {
  const router = useRouter();

  const totalCost = useMemo(
    () =>
      conversations.reduce((sum, c) => sum + (c.totalCost || 0), 0) ||
      1,
    [conversations],
  );

  const totalDuration = useMemo(
    () =>
      conversations.reduce((sum, c) => sum + getDurationMs(c), 0) ||
      1,
    [conversations],
  );

  const columns = useMemo(
    () => [
      conversationTitleColumn({ mini }),
      projectBadgeColumn({ mini }),
      userBadgeColumn({ mini }),
      modalitiesColumn({ mini }),
      modelsListColumn({ mini }),
      providersListColumn({ mini }),
      toolsColumn({ mini }),
      requestCountColumn(),
      ...tokenColumns({
        inputKey: "inputTokens",
        outputKey: "outputTokens",
        showDash: true,
      }),
      ...costColumns(totalCost, { mini }),
      latencyColumn("totalLatency", "Latency"),
      durationColumn({ useDurationMs: true }),
      durationShareColumn(totalDuration, { mini }),
      createdAtColumn(),
    ],
    [mini, totalCost, totalDuration],
  );

  return (
    <TableComponent
      columns={columns}
      data={conversations}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={(c, i) => c.id || c._id || `conv-${i}`}
      onRowClick={(c) => {
        const traceQs = traceId ? `?trace=${traceId}` : "";
        router.push(`/admin/conversations/${c.id}${traceQs}`);
      }}
      emptyText={emptyText}
      maxHeight={maxHeight || (compact ? "300px" : undefined)}
      mini={mini}
      title={title}
      storageKey="conversations"
    />
  );
}
