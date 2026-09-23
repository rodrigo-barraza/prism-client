import { StrictMode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  AdminHeaderProvider,
  useAdminHeader,
} from "../AdminHeaderContextComponent";
import { LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE } from "../../constants";
import {
  ADMIN_DATE_RANGE_COOKIE,
  adminDateRangeCookie,
  parseAdminDateRange,
} from "../../utils/adminDateRange";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

function Probe() {
  const { dateRange, dateRangeReady, setDateRange } = useAdminHeader();
  return (
    <>
      <span data-testid="range">{`${dateRange.from}|${dateRange.to}`}</span>
      <span data-testid="ready">{String(dateRangeReady)}</span>
      <button onClick={() => setDateRange({ from: "2026-09-01", to: "2026-09-02" })}>
        pick
      </button>
    </>
  );
}

const SAVED = { from: "2026-09-16", to: "2026-09-23" };

describe("AdminHeaderProvider date range", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${ADMIN_DATE_RANGE_COOKIE}=; max-age=0; path=/`;
  });

  it("restores the saved range under Strict Mode instead of overwriting it with All time", async () => {
    localStorage.setItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE, JSON.stringify(SAVED));
    await act(async () => {
      render(
        <StrictMode>
          <AdminHeaderProvider>
            <Probe />
          </AdminHeaderProvider>
        </StrictMode>,
      );
    });
    expect(screen.getByTestId("range").textContent).toBe("2026-09-16|2026-09-23");
    expect(screen.getByTestId("ready").textContent).toBe("true");
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE)!)).toEqual(SAVED);
  });

  it("is ready at once with the range the server read from the cookie", () => {
    render(
      <AdminHeaderProvider initialDateRange={SAVED}>
        <Probe />
      </AdminHeaderProvider>,
    );
    expect(screen.getByTestId("range").textContent).toBe("2026-09-16|2026-09-23");
    expect(screen.getByTestId("ready").textContent).toBe("true");
  });

  it("saves a picked range to localStorage and the cookie", async () => {
    render(
      <AdminHeaderProvider initialDateRange={SAVED}>
        <Probe />
      </AdminHeaderProvider>,
    );
    await act(async () => screen.getByText("pick").click());
    const picked = { from: "2026-09-01", to: "2026-09-02" };
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE)!)).toEqual(picked);
    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${ADMIN_DATE_RANGE_COOKIE}=`));
    expect(parseAdminDateRange(cookie?.slice(ADMIN_DATE_RANGE_COOKIE.length + 1))).toEqual(picked);
  });
});

describe("parseAdminDateRange", () => {
  it("reads a raw or URI-encoded JSON range and rejects anything else", () => {
    expect(parseAdminDateRange(JSON.stringify(SAVED))).toEqual(SAVED);
    expect(parseAdminDateRange(encodeURIComponent(JSON.stringify(SAVED)))).toEqual(SAVED);
    expect(parseAdminDateRange('{"from":"2026-09-16"}')).toEqual({ from: "2026-09-16", to: "" });
    expect(parseAdminDateRange(undefined)).toBeNull();
    expect(parseAdminDateRange("null")).toBeNull();
    expect(parseAdminDateRange("not json")).toBeNull();
  });

  it("round-trips through the cookie it writes", () => {
    const cookie = adminDateRangeCookie(SAVED);
    const value = cookie.split(";")[0].slice(ADMIN_DATE_RANGE_COOKIE.length + 1);
    expect(parseAdminDateRange(value)).toEqual(SAVED);
    expect(cookie).toContain("path=/");
  });
});
