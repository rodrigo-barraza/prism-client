import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import type { IrisSkillUsageReport } from "../../services/IrisService";

// The shared table renders each column's cell with its `render`: enough to
// read what a row shows without the library's layout machinery.
vi.mock("@rodrigo-barraza/components-library", () => ({
  TableComponent: ({
    title,
    columns,
    data,
    getRowKey,
    emptyText,
  }: {
    title: string;
    columns: Array<{ key: string; label: string; render: (row: unknown) => React.ReactNode }>;
    data: unknown[];
    getRowKey: (row: unknown) => string;
    emptyText: string;
  }) => (
    <table>
      <caption>{title}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td>{emptyText}</td>
          </tr>
        ) : (
          data.map((row) => (
            <tr key={getRowKey(row)} data-testid={`row-${getRowKey(row)}`}>
              {columns.map((column) => (
                <td key={column.key} data-column={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  ),
}));

vi.mock("../BadgeComponent", () => ({
  default: (props: Record<string, unknown>) => (
    <span data-badge={String(props.type ?? props.variant)}>
      {props.type === "tokens"
        ? String(props.value)
        : props.type === "dateTime"
          ? String(props.date)
          : props.type === "project"
            ? String(props.project)
            : props.type === "user"
              ? String(props.username)
              : props.type === "agent"
                ? String(props.agent)
                : (props.children as React.ReactNode)}
    </span>
  ),
}));

import SkillUsageTableComponent from "../SkillUsageTableComponent";

function report(): IrisSkillUsageReport {
  return {
    windowDays: 30,
    since: "2026-08-24T12:00:00.000Z",
    generatedAt: "2026-09-23T12:00:00.000Z",
    skills: [
      {
        id: "a",
        name: "deploy-service",
        skillId: "deploy_service",
        source: "user",
        enabled: true,
        project: "prism-chat",
        username: "alice",
        agent: null,
        invocations: 3,
        totalInvocations: 7,
        lastUsedAt: "2026-09-22T12:00:00.000Z",
        catalogTokens: 11,
        bodyTokens: 60,
        neverInvokedInWindow: false,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "b",
        name: "release-notes",
        skillId: "release_notes",
        source: "claude-config:/ws/app",
        enabled: true,
        project: null,
        username: null,
        agent: null,
        invocations: 0,
        totalInvocations: 1,
        lastUsedAt: "2026-08-14T12:00:00.000Z",
        catalogTokens: 12,
        bodyTokens: 900,
        neverInvokedInWindow: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "c",
        name: "old-habit",
        skillId: "old_habit",
        source: "agent",
        enabled: false,
        project: "prism-chat",
        username: "alice",
        agent: "CODING",
        invocations: 0,
        totalInvocations: 0,
        lastUsedAt: null,
        catalogTokens: 8,
        bodyTokens: 40,
        neverInvokedInWindow: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    totals: { skills: 3, invocations: 3, catalogTokens: 23, neverInvokedInWindow: 2 },
  };
}

function cell(rowId: string, column: string) {
  return within(screen.getByTestId(`row-${rowId}`)).getByText(
    (_content, element) => element?.getAttribute("data-column") === column,
  );
}

describe("SkillUsageTableComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows each skill's invocations, last use, catalog and body tokens", () => {
    render(<SkillUsageTableComponent report={report()} />);

    expect(screen.getByText("Invocations (30 d)")).toBeTruthy();
    expect(cell("a", "invocations").textContent).toBe("3");
    expect(cell("a", "totalInvocations").textContent).toBe("7");
    expect(cell("a", "lastUsedAt").textContent).toBe("2026-09-22T12:00:00.000Z");
    expect(cell("a", "catalogTokens").textContent).toBe("11");
    expect(cell("a", "bodyTokens").textContent).toBe("60");
    expect(cell("a", "name").textContent).toContain("deploy-service");
    expect(cell("b", "name").textContent).toContain("claude-config:/ws/app");
    expect(cell("c", "lastUsedAt").textContent).toBe("—");
  });

  it("flags the skills never invoked in the window, and the disabled ones", () => {
    render(<SkillUsageTableComponent report={report()} />);

    expect(cell("a", "status").textContent).toBe("");
    expect(cell("b", "status").textContent).toBe("never invoked in 30 days");
    expect(cell("c", "status").textContent).toContain("never invoked in 30 days");
    expect(cell("c", "status").textContent).toContain("disabled");
  });

  it("names each skill's scope, and a dash for a legacy skill every scope sees", () => {
    render(<SkillUsageTableComponent report={report()} />);

    expect(cell("a", "scope").textContent).toBe("prism-chatalice");
    expect(cell("c", "scope").textContent).toBe("prism-chataliceCODING");
    expect(cell("b", "scope").textContent).toBe("—");
  });

  it("sums the report in its title", () => {
    render(<SkillUsageTableComponent report={report()} />);

    expect(screen.getByText(
      "3 skills · 3 invocations in 30 days · 23 catalog tokens per prompt · 2 never invoked",
    )).toBeTruthy();
  });
});
