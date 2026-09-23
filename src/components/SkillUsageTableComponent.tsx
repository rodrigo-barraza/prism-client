import { TableComponent } from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import { emptyDash } from "../utils/tableColumns";
import type { IrisSkillUsageReport, IrisSkillUsageRow } from "../services/IrisService";

interface SkillUsageTableProps {
  report: IrisSkillUsageReport;
  emptyText?: string;
  maxHeight?: number;
}

/**
 * The skill usage report (prism-service GET /admin/skills/usage): per skill,
 * its invocations in the window, lifetime total, last use, what its catalog
 * line costs every prompt and what its body costs when loaded — and the
 * skills nobody invoked in the window, which pay catalog tokens for nothing.
 */
export default function SkillUsageTableComponent({
  report,
  emptyText = "No skills yet",
  maxHeight = 640,
}: SkillUsageTableProps) {
  const days = report.windowDays;
  const columns = [
    {
      key: "name",
      label: "Skill",
      description: "The skill's name, and where it came from (panel, agent, import, plugin)",
      render: (row: IrisSkillUsageRow) => (
        <span>
          {row.name}{" "}
          <BadgeComponent variant="default" mini>
            {row.source}
          </BadgeComponent>
        </span>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      description: "Who can see it: its project, owner and persona (unset = every one)",
      sortValue: (row: IrisSkillUsageRow) => `${row.project ?? ""}/${row.username ?? ""}/${row.agent ?? ""}`,
      render: (row: IrisSkillUsageRow) => (
        <span>
          {row.project ? <BadgeComponent type="project" project={row.project} /> : null}
          {row.username ? <BadgeComponent type="user" username={row.username} /> : null}
          {row.agent ? <BadgeComponent type="agent" agent={row.agent} /> : null}
          {!row.project && !row.username && !row.agent ? emptyDash() : null}
        </span>
      ),
    },
    {
      key: "invocations",
      label: `Invocations (${days} d)`,
      description: `load_skill and execute_skill calls in the last ${days} days`,
      align: "right" as const,
      render: (row: IrisSkillUsageRow) => row.invocations.toLocaleString(),
    },
    {
      key: "totalInvocations",
      label: "All time",
      description: "Every invocation since the skill was created",
      align: "right" as const,
      render: (row: IrisSkillUsageRow) => row.totalInvocations.toLocaleString(),
    },
    {
      key: "lastUsedAt",
      label: "Last used",
      description: "When the skill was last loaded or run",
      align: "right" as const,
      render: (row: IrisSkillUsageRow) =>
        row.lastUsedAt ? <BadgeComponent type="dateTime" date={row.lastUsedAt} /> : emptyDash(),
    },
    {
      key: "catalogTokens",
      label: "Catalog tokens",
      description: "What the skill's catalog line adds to every prompt that lists it",
      align: "right" as const,
      render: (row: IrisSkillUsageRow) => <BadgeComponent type="tokens" value={row.catalogTokens} />,
    },
    {
      key: "bodyTokens",
      label: "Body tokens",
      description: "What load_skill returns when the skill is loaded",
      align: "right" as const,
      render: (row: IrisSkillUsageRow) => <BadgeComponent type="tokens" value={row.bodyTokens} />,
    },
    {
      key: "status",
      label: "Status",
      description: `Disabled skills are not in the catalog; enabled ones not invoked in ${days} days still cost their catalog line`,
      sortValue: (row: IrisSkillUsageRow) => (row.neverInvokedInWindow ? 1 : 0),
      render: (row: IrisSkillUsageRow) => (
        <span>
          {row.neverInvokedInWindow ? (
            <BadgeComponent variant="warning" mini>
              {`never invoked in ${days} days`}
            </BadgeComponent>
          ) : null}
          {!row.enabled ? (
            <BadgeComponent variant="default" mini>
              disabled
            </BadgeComponent>
          ) : null}
        </span>
      ),
    },
  ];

  const { totals } = report;
  const title = `${totals.skills.toLocaleString()} skills · ${totals.invocations.toLocaleString()} invocations in ${days} days · ${totals.catalogTokens.toLocaleString()} catalog tokens per prompt · ${totals.neverInvokedInWindow.toLocaleString()} never invoked`;

  return (
    <TableComponent
      className="skill-usage-table-component"
      title={title}
      maxHeight={maxHeight}
      columns={columns as unknown as { key: string; label: string }[]}
      data={report.skills}
      getRowKey={(row: IrisSkillUsageRow) => row.id}
      emptyText={emptyText}
      storageKey="skill-usage"
    />
  );
}
