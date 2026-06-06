"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, AlertCircle, Users } from "lucide-react";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import BadgeComponent, { cleanModelName } from "./BadgeComponent";
import IrisService from "../services/IrisService";
import { getErrorMessage } from "../utils/errorMessage";
import { formatCost } from "@rodrigo-barraza/utilities-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./SessionRequestsListComponent.module.css";

/**
 * SessionRequestsListComponent — displays all requests for an agent session
 * and its associated worker sessions as a flat chronological timeline (newest first).
 */
export default function SessionRequestsListComponent({
  conversationId,
  refreshKey = 0,
}: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await IrisService.getSessionRequests(conversationId);
      setData(result);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      // 404 = no requests yet, don't show error
      if (!errorMessage.includes("404")) {
        setError(errorMessage);
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, refreshKey]);

  if (!conversationId || loading || error || !(data as any)?.requests?.length) {
    if (error) {
      return (
        <div className={styles.container}>
          <div className={styles['empty-state']}>
            <div className={styles['empty-icon']}>
              <AlertCircle size={24} />
            </div>
            <div className={styles['empty-title']}>Failed to load requests</div>
            <div className={styles['empty-subtitle']}>{error}</div>
          </div>
        </div>
      );
    }
    if (loading) {
      return (
        <div className={styles.container}>
          <PanelLoadingSpinner />
        </div>
      );
    }
    return (
      <div className={styles.container}>
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <Activity size={24} />
          </div>
          <div className={styles['empty-title']}>No requests</div>
          <div className={styles['empty-subtitle']}>
            No requests have been made in this session yet.
          </div>
        </div>
      </div>
    );
  }

  // Flat list, newest first — each request tagged with isWorker
  const rootSessionId = (data as any).rootSessionId;
  const requests = [...((data as any).requests || [])]
    .sort(
      (firstRequest, secondRequest) =>
        new Date(secondRequest.timestamp).getTime() - new Date(firstRequest.timestamp).getTime(),
    )
    .map((request) => {
      const isWorker = !!request.agentSessionId && request.agentSessionId !== rootSessionId;
      return {
        ...request,
        isWorker,
        workerShortId:
          isWorker && typeof request.agentSessionId === "string"
            ? request.agentSessionId.slice(0, 8)
            : null,
      };
    });

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Activity size={12} />
          <span>Requests</span>
          <span className={styles['header-count']}>{(data as any).total}</span>
        </div>

        <div className={styles['request-list']}>
          {requests.map((request, index) => {
            const isError = !request.success;
            return (
              <div
                key={`${request.requestId || "request"}-${index}`}
                className={`${styles['request-row']} ${isError ? styles['request-error'] : ""} ${request.isWorker ? styles['request-worker'] : ""}`}
              >
                <div className={styles['request-meta']}>
                  {request.isWorker && (
                    <span
                      className={styles['worker-tag']}
                      title={`Worker ${request.workerShortId}`}
                    >
                      <Users size={8} />
                    </span>
                  )}
                  <ProviderLogo provider={request.provider} size={12} />
                  <span className={styles['request-provider']}>
                    {resolveProviderLabel(request.provider)}
                  </span>
                  <span className={styles.divider}>•</span>
                  <span className={styles['request-model']} title={request.model}>
                    {request.model ? cleanModelName(request.model) : "—"}
                  </span>
                  {request.operation && (
                    <span className={styles['request-operation']}>
                      {request.operation}
                    </span>
                  )}
                </div>
                <div className={styles['request-stats']}>
                  {request.inputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={request.inputTokens}
                      label="in"
                      mini
                    />
                  )}
                  {request.outputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={request.outputTokens}
                      label="out"
                      mini
                    />
                  )}
                  {request.cacheReadInputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={request.cacheReadInputTokens}
                      label="cached"
                      mini
                    />
                  )}
                  {request.reasoningOutputTokens > 0 && (
                    <BadgeComponent
                      type="tokens"
                      value={request.reasoningOutputTokens}
                      label="reasoning"
                      mini
                    />
                  )}
                  {request.totalTime > 0 && (
                    <BadgeComponent type="stopwatch" seconds={request.totalTime} />
                  )}
                  <span className={styles['request-cost']} title="Cost">
                    {formatCost(request.estimatedCost ?? 0)}
                  </span>
                  <BadgeComponent type="dateTime" date={request.timestamp} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
