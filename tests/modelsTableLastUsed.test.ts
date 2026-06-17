import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@rodrigo-barraza/components-library", () => ({}));

import BadgeComponent from "../src/components/BadgeComponent";

import type { RawModel, RowData } from "../src/components/ModelsTableComponent";

function buildTestRow(rawModel: RawModel): RowData {
  return {
    _raw: rawModel,
    lastUsed: rawModel.lastUsed,
  } as unknown as RowData;
}

describe("ModelsTableComponent lastUsed Column and Sorting", () => {
  it("correctly extracts lastUsed from rawModel in buildRow", () => {
    const lastUsedTimestamp = "2026-06-07T12:00:00Z";
    const rawModel: RawModel = {
      key: "gemini-3.5-flash",
      provider: "google",
      lastUsed: lastUsedTimestamp,
    };

    const row = buildTestRow(rawModel);
    expect(row.lastUsed).toBe(lastUsedTimestamp);
  });

  it("handles sorting values correctly based on timestamp parsing", () => {
    const earliestTimestamp = "2026-06-05T10:00:00Z";
    const latestTimestamp = "2026-06-07T12:00:00Z";

    const rowEarliest = buildTestRow({ lastUsed: earliestTimestamp });
    const rowLatest = buildTestRow({ lastUsed: latestTimestamp });
    const rowEmpty = buildTestRow({ lastUsed: undefined });

    const getSortValue = (row: RowData) => {
      const timestamp = row._raw.lastUsed;
      if (!timestamp) return 0;
      return new Date(timestamp).getTime();
    };

    expect(getSortValue(rowEmpty)).toBe(0);
    expect(getSortValue(rowEarliest)).toBeGreaterThan(0);
    expect(getSortValue(rowLatest)).toBeGreaterThan(getSortValue(rowEarliest));
  });

  it("renders time ago formatting correctly using the utility helper", () => {
    const rawModel: RawModel = {
      key: "claude-sonnet",
      lastUsed: new Date(Date.now() - 3600 * 2000).toISOString(), // 2 hours ago
    };

    const row = buildTestRow(rawModel);
    const renderCell = (row: RowData) => {
      const timestamp = row._raw.lastUsed;
      if (!timestamp) return "—";
      return React.createElement(BadgeComponent, {
        type: "dateTime",
        date: timestamp,
        relative: true,
        highlightNew: true,
      });
    };

    const output = renderCell(row);
    expect(output).toEqual(
      React.createElement(BadgeComponent, {
        type: "dateTime",
        date: rawModel.lastUsed,
        relative: true,
        highlightNew: true,
      })
    );
  });
});
