/**
 * The admin date range, kept in a cookie as well as localStorage so the
 * server renders the range the viewer picked. Read from localStorage alone,
 * it arrived after hydration: the date picker's server HTML said "All time",
 * React discarded it for the page, and the dashboard waited a render before
 * its first fetch. Plain module — the admin layout (server) and the header
 * context (client) both use it.
 */

export interface AdminDateRange {
  from: string;
  to: string;
}

export const ADMIN_DATE_RANGE_COOKIE = "prism-admin-date-range";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** A stored range (cookie value or localStorage item), or null if there is none. */
export function parseAdminDateRange(raw: string | null | undefined): AdminDateRange | null {
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      const parsed = JSON.parse(candidate) as Partial<AdminDateRange> | null;
      if (parsed && typeof parsed === "object") {
        return {
          from: typeof parsed.from === "string" ? parsed.from : "",
          to: typeof parsed.to === "string" ? parsed.to : "",
        };
      }
    } catch {
      // try the next form
    }
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function adminDateRangeCookie(range: AdminDateRange): string {
  const value = encodeURIComponent(JSON.stringify({ from: range.from, to: range.to }));
  return `${ADMIN_DATE_RANGE_COOKIE}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
