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
import { LS_DATE_RANGE } from "../constants";

export interface DateRange {
  from: string;
  to: string;
}

export interface AdminHeaderContextType {
  controls: React.ReactNode;
  setControls: (node: React.ReactNode) => void;
  titleBadge: string | number | null;
  setTitleBadge: (value: string | number | null) => void;
  dateRange: DateRange;
  setDateRange: (value: DateRange) => void;
  sessionFilter: string | null;
  setSessionFilter: (value: string | null) => void;
  agentFilter: string | null;
}

const AdminHeaderContext = createContext<AdminHeaderContextType>({
  controls: null,
  setControls: () => {},
  titleBadge: null,
  setTitleBadge: () => {},
  dateRange: { from: "", to: "" },
  setDateRange: () => {},
  sessionFilter: null,
  setSessionFilter: () => {},
  agentFilter: null,
});

export function AdminHeaderProvider({
  children,
}: {
  children: React.ReactNode;
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
  const [dateRange, setDateRangeState] = useState<DateRange>({
    from: "",
    to: "",
  });
  const [sessionFilter, setSessionFilterState] = useState<string | null>(null);

  // Hydrate dateRange from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_DATE_RANGE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.from || parsed.to) setDateRangeState(parsed);
      }
    } catch {
      // ignore
    }
  }, []);
  const [previousPathname, setPreviousPathname] = useState(pathname);

  // Render-phase derived state: clear stale controls and badge on route change.
  // React re-renders this provider immediately (before rendering children) when
  // own state is set during render, so the new page never sees the old page's
  // controls or badge — eliminating the cross-page flicker entirely.
  // Compare only the top-level route segment so sub-route navigations
  // (e.g. /admin/chat → /admin/chat/[id]) don't wipe the badge.
  const routeSegment =
    pathname.replace("/admin", "").split("/").filter(Boolean)[0] || "";
  const previousRouteSegment =
    previousPathname.replace("/admin", "").split("/").filter(Boolean)[0] || "";
  if (previousRouteSegment !== routeSegment) {
    setPreviousPathname(pathname);
    if (controls !== null) setControlsState(null);
    if (titleBadge !== null) setTitleBadgeState(null);
    if (sessionFilter !== null) setSessionFilterState(null);
  } else if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
  }

  // Persist to localStorage on change
  useEffect(() => {
    try {
      if (dateRange.from || dateRange.to) {
        localStorage.setItem(LS_DATE_RANGE, JSON.stringify(dateRange));
      } else {
        localStorage.removeItem(LS_DATE_RANGE);
      }
    } catch {
      // ignore
    }
  }, [dateRange]);

  const setControls = useCallback((node: React.ReactNode) => {
    setControlsState(node);
  }, []);

  const setTitleBadge = useCallback((value: string | number | null) => {
    setTitleBadgeState(value);
  }, []);

  const setDateRange = useCallback((value: DateRange) => {
    setDateRangeState(value);
  }, []);

  const setSessionFilter = useCallback((value: string | null) => {
    setSessionFilterState(value);
  }, []);

  return (
    <AdminHeaderContext.Provider
      value={{
        controls,
        setControls,
        titleBadge,
        setTitleBadge,
        dateRange,
        setDateRange,
        sessionFilter,
        setSessionFilter,
        agentFilter,
      }}
    >
      {children}
    </AdminHeaderContext.Provider>
  );
}

export function useAdminHeader() {
  return useContext(AdminHeaderContext);
}
