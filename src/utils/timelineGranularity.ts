// ============================================================
// Timeline granularity — labels for the resolution picker and
// the chart's axis. Which granularities a span allows is the
// server's call (`validGranularities` on /admin/stats/timeline).
// ============================================================

export interface GranularityTier {
  key: string;
  label: string;
  shortLabel: string;
  seconds: number;
}

export const GRANULARITY_TIERS: GranularityTier[] = [
  { key: "1s", label: "1 second", shortLabel: "1s", seconds: 1 },
  { key: "5s", label: "5 seconds", shortLabel: "5s", seconds: 5 },
  { key: "15s", label: "15 seconds", shortLabel: "15s", seconds: 15 },
  { key: "30s", label: "30 seconds", shortLabel: "30s", seconds: 30 },
  { key: "1min", label: "1 minute", shortLabel: "1min", seconds: 60 },
  { key: "5min", label: "5 minutes", shortLabel: "5min", seconds: 300 },
  { key: "15min", label: "15 minutes", shortLabel: "15min", seconds: 900 },
  { key: "1hr", label: "1 hour", shortLabel: "1hr", seconds: 3600 },
  { key: "4hr", label: "4 hours", shortLabel: "4hr", seconds: 14400 },
  { key: "1day", label: "1 day", shortLabel: "1d", seconds: 86400 },
  { key: "1week", label: "1 week", shortLabel: "1w", seconds: 604800 },
];

/**
 * Tooltip and axis labels for a timeline bucket key.
 *
 * Sub-day keys are UTC instants ("2026-04-02T22:05:31", "2026-04-02T22:05",
 * "2026-04-02T14") and read in the viewer's local time. Day and week keys
 * ("2026-04-02") are calendar dates the server already cut in the viewer's
 * timezone, so they are formatted as dates, never shifted: read as a UTC
 * midnight in local time, "Mar 21" showed as "Mar 20" west of Greenwich.
 */
export function timelineBucketLabels(bucket: string): { label: string; tickLabel: string } {
  if (bucket.length <= 10) {
    const label = new Date(`${bucket}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return { label, tickLabel: label };
  }
  const time = bucket.slice(11);
  const colonCount = (time.match(/:/g) || []).length;
  if (colonCount >= 2) {
    const date = new Date(`${bucket}Z`);
    const label = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    // Dense second bins: an axis label every 30 seconds.
    return { label, tickLabel: date.getSeconds() % 30 === 0 ? label : "" };
  }
  if (colonCount === 1) {
    const date = new Date(`${bucket}:00Z`);
    const label = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return { label, tickLabel: date.getMinutes() % 15 === 0 ? label : "" };
  }
  const date = new Date(`${bucket}:00:00Z`);
  const label = date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  // Hourly bins across days: the day's name at local midnight.
  const tickLabel =
    date.getHours() === 0
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : label;
  return { label, tickLabel };
}
