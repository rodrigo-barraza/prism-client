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

export interface DateRange {
  from: string;
  to: string;
}

export interface AdminHeaderContextType {
  controls: React.ReactNode;
  setControls: (_node: React.ReactNode) => void;
  titleBadge: string | number | null;
  setTitleBadge: (_value: string | number | null) => void;
  dateRange: DateRange;
  setDateRange: (_value: DateRange) => void;
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
  traceFilter: null,
  setTraceFilter: () => {},
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
  const [traceFilter, setTraceFilterState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
        setDateRangeState(parsed);
        return;
      }
    } catch {
      // ignore
    }

    setDateRangeState({
      from: "",
      to: "",
    });
  }, []);
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
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE, JSON.stringify(dateRange));
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

  const setTraceFilter = useCallback((value: string | null) => {
    setTraceFilterState(value);
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
        traceFilter,
        setTraceFilter,
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
