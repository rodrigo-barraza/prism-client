"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  FEEDBACK_STANDARD_MILLISECONDS,
  POLL_LAZY,
} from "@rodrigo-barraza/utilities-library";
import IrisService from "../../../services/IrisService";
import UsersTableComponent from "../../../components/UsersTableComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import {
  LoadingMessage,
  ErrorMessage,
} from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import { buildDateRangeParams } from "../../../utils/utilities";
import { getErrorMessage } from "../../../utils/errorMessage";
import type { IrisUserStat } from "../../../types/types";
import styles from "./page.module.css";

export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const { setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const [users, setUsers] = useState<IrisUserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectFilter = searchParams.get("project") || null;
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const workspaceFilter = searchParams.get("workspace") || null;

  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  const loadUsers = useCallback(async () => {
    try {
      const filterParams: Record<string, string> = { ...dateParams };
      if (projectFilter) filterParams.project = projectFilter;
      if (agentFilter) filterParams.agent = agentFilter;
      if (providerFilter) filterParams.provider = providerFilter;
      if (modelFilter) filterParams.model = modelFilter;
      if (workspaceFilter) filterParams.workspace = workspaceFilter;

      const userStats = await IrisService.getUserStats(filterParams);
      setUsers(userStats || []);
    } catch (fetchError: unknown) {
      setError(getErrorMessage(fetchError));
    } finally {
      setIsLoading(false);
    }
  }, [dateParams, projectFilter, agentFilter, providerFilter, modelFilter, workspaceFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setIsLoading(true);
    setError(null);
    setUsers([]);

    loadUsers();

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadUsers();
      }, FEEDBACK_STANDARD_MILLISECONDS);
    };

    const eventSource = IrisService.subscribeCollectionChanges({
      onStatus: (data) => {
        if (!data.changeStreams) {
          if (!pollInterval) {
            pollInterval = setInterval(loadUsers, POLL_LAZY);
          }
        }
      },
      onChange: (event) => {
        if (event.collection === "requests") {
          debouncedReload();
        }
      },
    });

    return () => {
      eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadUsers]);

  useEffect(() => {
    if (!isLoading) {
      setTitleBadge(users.length);
    }
  }, [setTitleBadge, users.length, isLoading]);

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div className={styles['page']}>
      <section className={styles["page-header-section"]}>
        <h2 className={styles["page-title"]}>User Analytics</h2>
        <p className={styles["page-subtitle"]}>
          Aggregated usage statistics per user across all requests, filtered by project, provider, model, and time range.
        </p>
      </section>
      <AdminFiltersCardComponent />
      <ErrorMessage message={error} />
      {isLoading && <LoadingMessage message="Loading user data..." />}
      {!isLoading && (
        <UsersTableComponent
          users={users}
          emptyText="No users found"
        />
      )}
    </div>
  );
}
