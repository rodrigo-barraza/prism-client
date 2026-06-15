import { describe, it, expect } from "vitest";
import {
  getSpanRule,
  getDefaultGranularity,
  getValidGranularities,
  isValidGranularity,
  resolveGranularity,
  GRANULARITY_TIERS,
  SPAN_RULES,
} from "../src/utils/timelineGranularity";

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

// ═══════════════════════════════════════════════════════════════
// getSpanRule
// ═══════════════════════════════════════════════════════════════

describe("getSpanRule", () => {
  it("should return the first rule for very small spans (under 2 minutes)", () => {
    const rule = getSpanRule(30 * 1000);
    expect(rule.defaultGranularity).toBe("1s");
  });

  it("should return the correct tier for 5-minute span", () => {
    const rule = getSpanRule(5 * MINUTES);
    expect(rule.defaultGranularity).toBe("5s");
  });

  it("should return the correct tier for 1-hour span", () => {
    const rule = getSpanRule(1 * HOURS);
    expect(rule.defaultGranularity).toBe("30s");
  });

  it("should return the correct tier for 1-day span", () => {
    const rule = getSpanRule(1 * DAYS);
    expect(rule.defaultGranularity).toBe("5min");
  });

  it("should return the last rule for spans exceeding all thresholds", () => {
    const rule = getSpanRule(365 * DAYS);
    expect(rule.defaultGranularity).toBe("1week");
  });

  it("should return the correct rule at exact boundary (2 minutes)", () => {
    const rule = getSpanRule(2 * MINUTES);
    expect(rule.maxSpanMs).toBe(2 * MINUTES);
    expect(rule.defaultGranularity).toBe("1s");
  });
});

// ═══════════════════════════════════════════════════════════════
// getDefaultGranularity
// ═══════════════════════════════════════════════════════════════

describe("getDefaultGranularity", () => {
  it("should return '1s' for a 1-minute span", () => {
    expect(getDefaultGranularity(1 * MINUTES)).toBe("1s");
  });

  it("should return '1min' for a 3-hour span", () => {
    expect(getDefaultGranularity(3 * HOURS)).toBe("1min");
  });

  it("should return '1day' for a 5-day span", () => {
    expect(getDefaultGranularity(5 * DAYS)).toBe("1day");
  });

  it("should return '1week' for very large spans", () => {
    expect(getDefaultGranularity(100 * DAYS)).toBe("1week");
  });
});

// ═══════════════════════════════════════════════════════════════
// getValidGranularities
// ═══════════════════════════════════════════════════════════════

describe("getValidGranularities", () => {
  it("should return a non-empty array for any span", () => {
    expect(getValidGranularities(10 * MINUTES).length).toBeGreaterThan(0);
  });

  it("should include the default granularity in the valid set", () => {
    const spanMilliseconds = 30 * MINUTES;
    const validTiers = getValidGranularities(spanMilliseconds);
    const defaultKey = getDefaultGranularity(spanMilliseconds);
    expect(validTiers.some((tier) => tier.key === defaultKey)).toBe(true);
  });

  it("should return tiers bounded between minGranularity and maxGranularity", () => {
    const rule = getSpanRule(6 * HOURS);
    const validTiers = getValidGranularities(6 * HOURS);
    const firstTierKey = validTiers[0].key;
    const lastTierKey = validTiers[validTiers.length - 1].key;
    expect(firstTierKey).toBe(rule.minGranularity);
    expect(lastTierKey).toBe(rule.maxGranularity);
  });

  it("should have all tiers sorted by ascending seconds", () => {
    const validTiers = getValidGranularities(1 * HOURS);
    for (let index = 1; index < validTiers.length; index++) {
      expect(validTiers[index].seconds).toBeGreaterThan(validTiers[index - 1].seconds);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// isValidGranularity
// ═══════════════════════════════════════════════════════════════

describe("isValidGranularity", () => {
  it("should return true for a granularity within the valid range", () => {
    expect(isValidGranularity(30 * MINUTES, "15s")).toBe(true);
  });

  it("should return false for a granularity outside the valid range", () => {
    expect(isValidGranularity(30 * MINUTES, "1day")).toBe(false);
  });

  it("should return false for a non-existent granularity key", () => {
    expect(isValidGranularity(1 * HOURS, "42s")).toBe(false);
  });

  it("should return true for the default granularity of any span", () => {
    const spanMilliseconds = 3 * DAYS;
    const defaultKey = getDefaultGranularity(spanMilliseconds);
    expect(isValidGranularity(spanMilliseconds, defaultKey)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveGranularity
// ═══════════════════════════════════════════════════════════════

describe("resolveGranularity", () => {
  it("should return the default granularity when requestedGranularity is null", () => {
    const spanMilliseconds = 10 * MINUTES;
    expect(resolveGranularity(spanMilliseconds, null)).toBe(getDefaultGranularity(spanMilliseconds));
  });

  it("should return the default granularity when requestedGranularity is undefined", () => {
    const spanMilliseconds = 10 * MINUTES;
    expect(resolveGranularity(spanMilliseconds, undefined)).toBe(getDefaultGranularity(spanMilliseconds));
  });

  it("should return the requested granularity when it is valid", () => {
    expect(resolveGranularity(30 * MINUTES, "5s")).toBe("5s");
  });

  it("should fall back to the default when the requested granularity is invalid", () => {
    const spanMilliseconds = 30 * MINUTES;
    expect(resolveGranularity(spanMilliseconds, "1day")).toBe(getDefaultGranularity(spanMilliseconds));
  });

  it("should fall back to the default when the requested granularity is an empty string", () => {
    const spanMilliseconds = 1 * HOURS;
    expect(resolveGranularity(spanMilliseconds, "")).toBe(getDefaultGranularity(spanMilliseconds));
  });
});

// ═══════════════════════════════════════════════════════════════
// Data integrity
// ═══════════════════════════════════════════════════════════════

describe("GRANULARITY_TIERS data integrity", () => {
  it("should have strictly ascending seconds values", () => {
    for (let index = 1; index < GRANULARITY_TIERS.length; index++) {
      expect(GRANULARITY_TIERS[index].seconds).toBeGreaterThan(
        GRANULARITY_TIERS[index - 1].seconds,
      );
    }
  });

  it("should have unique keys", () => {
    const keys = GRANULARITY_TIERS.map((tier) => tier.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("SPAN_RULES data integrity", () => {
  it("should have strictly ascending maxSpanMs values", () => {
    for (let index = 1; index < SPAN_RULES.length; index++) {
      expect(SPAN_RULES[index].maxSpanMs).toBeGreaterThan(
        SPAN_RULES[index - 1].maxSpanMs,
      );
    }
  });

  it("should reference only valid granularity tier keys", () => {
    const validKeys = new Set(GRANULARITY_TIERS.map((tier) => tier.key));
    for (const rule of SPAN_RULES) {
      expect(validKeys.has(rule.defaultGranularity)).toBe(true);
      expect(validKeys.has(rule.minGranularity)).toBe(true);
      expect(validKeys.has(rule.maxGranularity)).toBe(true);
    }
  });
});
