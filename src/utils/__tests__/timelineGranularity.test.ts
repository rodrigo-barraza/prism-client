import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GRANULARITY_TIERS, timelineBucketLabels } from "../timelineGranularity";

// West of Greenwich, where a UTC-midnight date read in local time is the day
// before — the bug these labels had.
const originalTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Vancouver";
});
afterAll(() => {
  process.env.TZ = originalTimeZone;
});

describe("GRANULARITY_TIERS", () => {
  it("lists every granularity the server can return, finest first", () => {
    expect(GRANULARITY_TIERS.map((tier) => tier.key)).toEqual([
      "1s", "5s", "15s", "30s", "1min", "5min", "15min", "1hr", "4hr", "1day", "1week",
    ]);
    const seconds = GRANULARITY_TIERS.map((tier) => tier.seconds);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
  });
});

describe("timelineBucketLabels", () => {
  it("labels a day bucket with its own calendar date, in any timezone", () => {
    expect(timelineBucketLabels("2026-03-21")).toEqual({ label: "Mar 21", tickLabel: "Mar 21" });
    expect(timelineBucketLabels("2026-01-01").label).toBe("Jan 1");
  });

  it("reads sub-day buckets as UTC instants in local time", () => {
    // 22:05 UTC on Sep 23 is 3:05 PM in Vancouver (PDT, UTC−7).
    expect(timelineBucketLabels("2026-09-23T22:05").label).toBe("3:05 PM");
    expect(timelineBucketLabels("2026-09-23T22:05:30").label).toBe("3:05:30 PM");
    expect(timelineBucketLabels("2026-09-23T22").label).toBe("3 PM");
  });

  it("keeps sparse axis ticks: every 30 s, every 15 min, the day at midnight", () => {
    expect(timelineBucketLabels("2026-09-23T22:05:30").tickLabel).toBe("3:05:30 PM");
    expect(timelineBucketLabels("2026-09-23T22:05:15").tickLabel).toBe("");
    expect(timelineBucketLabels("2026-09-23T22:15").tickLabel).toBe("3:15 PM");
    expect(timelineBucketLabels("2026-09-23T22:05").tickLabel).toBe("");
    // 07:00 UTC is local midnight in Vancouver.
    expect(timelineBucketLabels("2026-09-24T07").tickLabel).toBe("Sep 24");
    expect(timelineBucketLabels("2026-09-24T08").tickLabel).toBe("1 AM");
  });
});
