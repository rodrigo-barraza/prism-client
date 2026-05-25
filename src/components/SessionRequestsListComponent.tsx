"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, AlertCircle, Users } from "lucide-react";
import { DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import BadgeComponent, { cleanModelName } from "./BadgeComponent";
import IrisService from "../services/IrisService";
import { getErrorMessage } from "../utils/errorMessage";
import { formatCost } from "../utils/utilities";
import styles from "./SessionRequestsListComponent.module.css";

/**
 * SessionRequestsListComponent — displays all requests for an agent session
 * and its associated worker sessions as a flat chronological timeline (newest first).
 */
export default function SessionRequestsListComponent({
  agentSessionId,
  refreshKey = 0,
}: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!agentSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await IrisService.getSessionRequests(agentSessionId);
      setData(result);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      // 404 = no requests yet, don't show error
      if (!msg.includes("404")) {
        setError(msg);
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [agentSessionId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, refreshKey]);

  if (!agentSessionId || loading || error || !(data as any)?.requests?.length) {
    if (error) {
      return (
        <div className={styles.container}>
          <div className={styles.emptyState}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Activity size={14} />
          <span>{loading ? "Loading requests…" : "No requests yet"}</span>
        </div>
      </div>
    );
  }

  // Flat list, newest first — each request tagged with isWorker
  const rootSessionId = (data as any).rootSessionId;
  const requests = [...((data as any).requests || [])]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .map((req) => ({
      ...req,
      isWorker: req.agentSessionId !== rootSessionId,
      workerShortId:
        req.agentSessionId !== rootSessionId
          ? req.agentSessionId.slice(0, 8)
          : null,
    }));

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Activity size={12} />
          <span>Requests</span>
          <span className={styles.headerCount}>{(data as any).total}</span>
        </div>

        <div className={styles.requestList}>
          {requests.map((req, i) => {
            const isError = !req.success;
            return (
              <div
                key={`${req.requestId || "req"}-${i}`}
                className={`${styles.requestRow} ${isError ? styles.requestError : ""} ${req.isWorker ? styles.requestWorker : ""}`}
              >
                <div className={styles.requestMeta}>
                  {req.isWorker && (
                    <span
                      className={styles.workerTag}
                      title={`Worker ${req.workerShortId}`}
                    >
                      <Users size={8} />
                    </span>
                  )}
                  <ProviderLogo provider={req.provider} size={12} />
                  <span className={styles.requestProvider}>
                    {resolveProviderLabel(req.provider)}
                  </span>
                  <span className={styles.divider}>•</span>
                  <span className={styles.requestModel} title={req.model}>
                    {req.model ? cleanModelName(req.model) : "—"}
                  </span>
                  {req.operation && (
                    <span className={styles.requestOperation}>
                      {req.operation}
                    </span>
                  )}
                </div>
                <div className={styles.requestStats}>
                  {req.inputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={req.inputTokens}
                      label="in"
                      mini
                    />
                  )}
                  {req.outputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={req.outputTokens}
                      label="out"
                      mini
                    />
                  )}
                  {req.cacheReadInputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={req.cacheReadInputTokens}
                      label="cached"
                      mini
                    />
                  )}
                  {req.reasoningOutputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={req.reasoningOutputTokens}
                      label="reasoning"
                      mini
                    />
                  )}
                  {req.totalTime > 0 && (
                    <BadgeComponent type="stopwatch" seconds={req.totalTime} />
                  )}
                  <span className={styles.requestCost} title="Cost">
                    {formatCost(req.estimatedCost ?? 0)}
                  </span>
                  <DateTimeBadgeComponent date={req.timestamp} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
