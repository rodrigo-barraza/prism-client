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
import type { Conversation } from "../types/types";

interface ConversationsTableProps {
  conversations?: Conversation[];
  emptyText?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onSort?: (key: string) => void;
  compact?: boolean;
  mini?: boolean;
  maxHeight?: number | string;
  title?: React.ReactNode;
  traceId?: string | null;
}

/**
 * ConversationsTableComponent — reusable admin table for displaying
 * conversation lists (used in traces, request associations, etc.).
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
}: ConversationsTableProps) {
  const router = useRouter();

  const totalCost = useMemo(
    () =>
      conversations.reduce((sum, conversation) => sum + (conversation.totalCost || 0), 0) || 1,
    [conversations],
  );

  const totalDuration = useMemo(
    () => conversations.reduce((sum, conversation) => sum + getDurationMs(conversation), 0) || 1,
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
      className="conversations-table-component"
      columns={columns}
      data={conversations}
      sortKey={sortKey}
      sortDir={sortDir ?? undefined}
      onSort={onSort}
      getRowKey={(conversation: Conversation, index: number) => conversation.id || `conv-${index}`}
      onRowClick={(conversation: Conversation) => {
        const traceQs = traceId ? `?trace=${traceId}` : "";
        router.push(`/admin/chat/${conversation.id}${traceQs}`);
      }}
      emptyText={emptyText}
      maxHeight={maxHeight || (compact ? "300px" : undefined)}
      mini={mini}
      title={title}
      storageKey="conversations"
    />
  );
}
