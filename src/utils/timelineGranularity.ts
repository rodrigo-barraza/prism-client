// ============================================================
// Timeline Granularity Configuration
// ============================================================
// Single source of truth for adaptive timeline resolution.
// Defines all granularity tiers, span-based rules (default,
// min, max), and helper functions for the resolution picker.
// ============================================================

export interface GranularityTier {
  key: string;
  label: string;
  shortLabel: string;
  seconds: number;
}

export interface SpanRule {
  maxSpanMs: number;
  defaultGranularity: string;
  minGranularity: string;
  maxGranularity: string;
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

const TIER_INDEX_BY_KEY = new Map(
  GRANULARITY_TIERS.map((tier, index) => [tier.key, index]),
);

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

export const SPAN_RULES: SpanRule[] = [
  { maxSpanMs: 2 * MINUTES, defaultGranularity: "1s", minGranularity: "1s", maxGranularity: "15s" },
  { maxSpanMs: 10 * MINUTES, defaultGranularity: "5s", minGranularity: "1s", maxGranularity: "1min" },
  { maxSpanMs: 30 * MINUTES, defaultGranularity: "15s", minGranularity: "5s", maxGranularity: "5min" },
  { maxSpanMs: 1 * HOURS, defaultGranularity: "30s", minGranularity: "15s", maxGranularity: "5min" },
  { maxSpanMs: 6 * HOURS, defaultGranularity: "1min", minGranularity: "15s", maxGranularity: "15min" },
  { maxSpanMs: 1 * DAYS, defaultGranularity: "5min", minGranularity: "1min", maxGranularity: "1hr" },
  { maxSpanMs: 3 * DAYS, defaultGranularity: "15min", minGranularity: "5min", maxGranularity: "1day" },
  { maxSpanMs: 7 * DAYS, defaultGranularity: "1day", minGranularity: "1hr", maxGranularity: "1day" },
  { maxSpanMs: 14 * DAYS, defaultGranularity: "1day", minGranularity: "4hr", maxGranularity: "1day" },
  { maxSpanMs: 30 * DAYS, defaultGranularity: "1day", minGranularity: "4hr", maxGranularity: "1week" },
  { maxSpanMs: 90 * DAYS, defaultGranularity: "1day", minGranularity: "1day", maxGranularity: "1week" },
  { maxSpanMs: Infinity, defaultGranularity: "1week", minGranularity: "1day", maxGranularity: "1week" },
];

export function getSpanRule(spanMs: number): SpanRule {
  for (const rule of SPAN_RULES) {
    if (spanMs <= rule.maxSpanMs) return rule;
  }
  return SPAN_RULES[SPAN_RULES.length - 1];
}

export function getDefaultGranularity(spanMs: number): string {
  return getSpanRule(spanMs).defaultGranularity;
}

export function getValidGranularities(spanMs: number): GranularityTier[] {
  const rule = getSpanRule(spanMs);
  const minimumIndex = TIER_INDEX_BY_KEY.get(rule.minGranularity) ?? 0;
  const maximumIndex = TIER_INDEX_BY_KEY.get(rule.maxGranularity) ?? GRANULARITY_TIERS.length - 1;
  return GRANULARITY_TIERS.slice(minimumIndex, maximumIndex + 1);
}

export function isValidGranularity(spanMs: number, granularity: string): boolean {
  const validTiers = getValidGranularities(spanMs);
  return validTiers.some((tier) => tier.key === granularity);
}

export function resolveGranularity(
  spanMs: number,
  requestedGranularity?: string | null,
): string {
  if (!requestedGranularity) return getDefaultGranularity(spanMs);
  if (isValidGranularity(spanMs, requestedGranularity)) return requestedGranularity;
  return getDefaultGranularity(spanMs);
}
