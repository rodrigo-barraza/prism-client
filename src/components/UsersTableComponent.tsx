import { TableComponent } from "@rodrigo-barraza/components-library";
import ProportionBarComponent from "./ProportionBarComponent";
import BadgeComponent from "./BadgeComponent";
import {
  requestsColumn,
  costColumns,
  latencyColumn,
  emptyDash,
} from "../utils/tableColumns";
import type { IrisUserStat } from "../types/types";

interface UsersTableProps {
  users?: IrisUserStat[];
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  compact?: boolean;
  title?: React.ReactNode;
  maxHeight?: number;
}

export default function UsersTableComponent({
  users = [],
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText = "No users yet",
  compact = false,
  title = "Users",
  maxHeight = 520,
}: UsersTableProps) {
  const totalRequests =
    (totalRequestsProp ??
      users.reduce((sum, user) => sum + user.totalRequests, 0)) || 1;
  const totalCost =
    (totalCostProp ??
      users.reduce((sum, user) => sum + (user.totalCost || 0), 0)) || 1;

  const userColors = [
    "oklch(0.72 0.18 200)",
    "oklch(0.72 0.18 145)",
    "oklch(0.72 0.18 30)",
    "oklch(0.72 0.18 310)",
    "oklch(0.72 0.18 70)",
    "oklch(0.72 0.18 250)",
  ];

  const allColumns = [
    {
      key: "username",
      label: "User",
      description: "The username associated with this user's requests",
      render: (row: IrisUserStat) => (
        <BadgeComponent type="user" username={row.username} />
      ),
    },
    requestsColumn(),
    {
      key: "usage",
      label: "Usage",
      description: "Proportional share of total requests",
      sortValue: (row: IrisUserStat) => row.totalRequests,
      render: (row: IrisUserStat, index: number) => (
        <ProportionBarComponent
          value={row.totalRequests}
          total={totalRequests}
          color={userColors[index % userColors.length]}
        />
      ),
    },
    {
      key: "totalTokens",
      label: "Tokens",
      description: "Total combined tokens consumed by this user",
      align: "right" as const,
      render: (row: IrisUserStat) =>
        row.totalTokens ? row.totalTokens.toLocaleString() : emptyDash(),
    },
    ...costColumns(totalCost),
    latencyColumn(),
    {
      key: "lastRequest",
      label: "Last Active",
      description: "When this user last made a request",
      align: "right" as const,
      render: (row: IrisUserStat) =>
        row.lastRequest ? (
          <BadgeComponent type="dateTime" date={row.lastRequest} highlightNew />
        ) : (
          emptyDash()
        ),
    },
  ];

  const COMPACT_KEYS = [
    "username",
    "totalRequests",
    "totalCost",
    "lastRequest",
  ];

  const columns = compact
    ? allColumns.filter((column) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  return (
    <TableComponent
      className="users-table-component"
      title={title}
      maxHeight={maxHeight}
      columns={columns as unknown as { key: string; label: string }[]}
      data={users}
      getRowKey={(user: IrisUserStat, index: number) =>
        `${user.username || "unknown"}-${index}`
      }
      emptyText={emptyText}
      storageKey="users"
    />
  );
}
