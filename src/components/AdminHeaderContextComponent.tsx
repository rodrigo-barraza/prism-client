"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE } from "../constants";
import {
  adminDateRangeCookie,
  parseAdminDateRange,
  type AdminDateRange,
} from "../utils/adminDateRange";

export type DateRange = AdminDateRange;

const ALL_TIME: DateRange = { from: "", to: "" };

export interface AdminHeaderContextType {
  controls: React.ReactNode;
  setControls: (_node: React.ReactNode) => void;
  titleBadge: string | number | null;
  setTitleBadge: (_value: string | number | null) => void;
  dateRange: DateRange;
  setDateRange: (_value: DateRange) => void;
  /**
   * False until the saved range is known. It is at once when the server read
   * it from the cookie; otherwise (a first visit since the cookie existed) it
   * is restored from localStorage after mount. A page that fetches by range
   * waits for it, so its first load is not an all-time query thrown away a
   * moment later.
   */
  dateRangeReady: boolean;
  traceFilter: string | null;
  setTraceFilter: (_value: string | null) => void;
  agentFilter: string | null;
}

const AdminHeaderContext = createContext<AdminHeaderContextType>({
  controls: null,
  setControls: () => {},
  titleBadge: null,
  setTitleBadge: () => {},
  dateRange: { from: "", to: "" },
  setDateRange: () => {},
  dateRangeReady: true,
  traceFilter: null,
  setTraceFilter: () => {},
  agentFilter: null,
});

export function AdminHeaderProvider({
  children,
  initialDateRange = null,
}: {
  children: React.ReactNode;
  /** The range the server read from the cookie; null when there was none. */
  initialDateRange?: DateRange | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const agentFilter = useMemo(() => {
    const agentParam = searchParams.get("agent");
    return agentParam || null;
  }, [searchParams]);

  const [controls, setControlsState] = useState<React.ReactNode>(null);
  const [titleBadge, setTitleBadgeState] = useState<string | number | null>(
    null,
  );
  const [dateRange, setDateRangeState] = useState<DateRange>(
    initialDateRange ?? ALL_TIME,
  );
  const [traceFilter, setTraceFilterState] = useState<string | null>(null);
  const [dateRangeReady, setDateRangeReady] = useState(initialDateRange !== null);

  useEffect(() => {
    if (dateRangeReady) return;
    let stored: DateRange | null = null;
    try {
      stored = parseAdminDateRange(localStorage.getItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE));
    } catch {
      // ignore
    }
    if (stored) {
      const { from, to } = stored;
      // Same range → same object, so nothing keyed on it refetches.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setDateRangeState((previous) =>
        previous.from === from && previous.to === to ? previous : { from, to },
      );
    }
    setDateRangeReady(true);
  }, [dateRangeReady]);
  const [previousPathname, setPreviousPathname] = useState(pathname);

  const routeSegment =
    pathname.replace("/admin", "").split("/").filter(Boolean)[0] || "";
  const previousRouteSegment =
    previousPathname.replace("/admin", "").split("/").filter(Boolean)[0] || "";
  if (previousRouteSegment !== routeSegment) {
    setPreviousPathname(pathname);
    if (controls !== null) setControlsState(null);
    if (titleBadge !== null) setTitleBadgeState(null);
    if (traceFilter !== null) setTraceFilterState(null);
  } else if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
  }

  useEffect(() => {
    // Before the restore, `dateRange` is the empty initial range: writing it
    // would overwrite the saved one (a remount — Strict Mode's included —
    // then restores "All time").
    if (!dateRangeReady) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE, JSON.stringify(dateRange));
    } catch {
      // ignore
    }
    document.cookie = adminDateRangeCookie(dateRange);
  }, [dateRange, dateRangeReady]);

  const setControls = useCallback((node: React.ReactNode) => {
    setControlsState(node);
  }, []);

  const setTitleBadge = useCallback((value: string | number | null) => {
    setTitleBadgeState(value);
  }, []);

  const setDateRange = useCallback((value: DateRange) => {
    setDateRangeState(value);
  }, []);

  const setTraceFilter = useCallback((value: string | null) => {
    setTraceFilterState(value);
  }, []);

  const contextValue = useMemo(
    () => ({
      controls,
      setControls,
      titleBadge,
      setTitleBadge,
      dateRange,
      setDateRange,
      dateRangeReady,
      traceFilter,
      setTraceFilter,
      agentFilter,
    }),
    [
      controls,
      setControls,
      titleBadge,
      setTitleBadge,
      dateRange,
      setDateRange,
      dateRangeReady,
      traceFilter,
      setTraceFilter,
      agentFilter,
    ],
  );

  return (
    <AdminHeaderContext.Provider value={contextValue}>
      {children}
    </AdminHeaderContext.Provider>
  );
}

export function useAdminHeader() {
  return useContext(AdminHeaderContext);
}
