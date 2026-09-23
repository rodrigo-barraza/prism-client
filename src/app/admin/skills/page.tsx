"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import IrisService, { type IrisSkillUsageReport } from "../../../services/IrisService";
import SkillUsageTableComponent from "../../../components/SkillUsageTableComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import {
  LoadingMessage,
  ErrorMessage,
} from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import { getErrorMessage } from "../../../utils/errorMessage";
import styles from "./page.module.css";

export default function AdminSkillsPage() {
  const searchParams = useSearchParams();
  const { setTitleBadge } = useAdminHeader();
  const [report, setReport] = useState<IrisSkillUsageReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectFilter = searchParams.get("project") || null;

  const loadReport = useCallback(async () => {
    try {
      setReport(
        await IrisService.getSkillUsage(projectFilter ? { project: projectFilter } : {}),
      );
    } catch (fetchError: unknown) {
      setError(getErrorMessage(fetchError));
    } finally {
      setIsLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setIsLoading(true);
    setError(null);
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!isLoading) setTitleBadge(report?.skills.length ?? 0);
  }, [setTitleBadge, report, isLoading]);

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div className={styles["page"]}>
      <section className={styles["page-header-section"]}>
        <h2 className={styles["page-title"]}>Skill Usage</h2>
        <p className={styles["page-subtitle"]}>
          Every skill with its invocations and last use over the last 30 days, what its catalog line costs in every
          prompt, and what its body costs when loaded. Skills never invoked in 30 days pay their catalog line for
          nothing.
        </p>
      </section>
      <AdminFiltersCardComponent
        show={{ provider: false, model: false, agent: false, workspace: false, date: false }}
      />
      <ErrorMessage message={error} />
      {isLoading && <LoadingMessage message="Loading skill usage..." />}
      {!isLoading && report && <SkillUsageTableComponent report={report} />}
    </div>
  );
}
