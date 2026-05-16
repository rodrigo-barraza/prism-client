"use client";

import { useState, useEffect, useMemo } from "react";
import IrisService from "../../../services/IrisService";
import PrismService from "../../../services/PrismService";
import { SelectComponent, TableComponent } from "@rodrigo-barraza/components-library";
import { resolveProviderLabel } from "../../../components/ProviderLogosComponent";


import {
  LoadingMessage,
  ErrorMessage,
} from "../../../components/StateMessageComponent";
import {
  formatNumber,
  formatCost,
  formatLatency,
  formatTokensPerSec,
  formatCompact,
  formatTimeAgo,
  buildDateRangeParams,
} from "../../../utils/utilities";
import { PROVIDER_COLORS } from "../../../constants";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import styles from "./page.module.css";




export default function ProvidersPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [modelStats, setModelStats] = useState<any>([]);
  const [loading, setLoading] = useState<any>(true);
  const [error, setError] = useState<any>(null);
  const [expandedProvider, setExpandedProvider] = useState<any>(null);
  const [rateLimits, setRateLimits] = useState<any>({});

  useEffect(() => {
    // Immediately enter loading state and clear stale data when filters change
    setLoading(true);
    setError(null);
    setModelStats([]);

    async function load() {
      try {
        const params = {};
        // @ts-ignore
        if (projectFilter) params.project = projectFilter;
        Object.assign(params, buildDateRangeParams(dateRange));
        const [models, limits] = await Promise.all([
          IrisService.getModelStats(params),
          IrisService.getRateLimits().catch(() => ({})),
          // Side-effect: registers local provider nicknames
          PrismService.getConfig().catch(() => null),
        ]);
        setModelStats(models);
        setRateLimits(limits);
      } catch (error) {
        // @ts-ignore
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dateRange, projectFilter]);

  // Aggregate by provider
  const providers = useMemo<any>(() => {
    const map = {};
    modelStats.forEach((m: any) => {
      // @ts-ignore
      if (!map[m.provider]) {
        // @ts-ignore
        map[m.provider] = {
          provider: m.provider,
          totalRequests: 0,
          totalCost: 0,
          totalTokens: 0,
          avgLatency: 0,
          models: [],
          _latencySum: 0,
          _latencyCount: 0,
        };
      }
      // @ts-ignore
      const p = map[m.provider];
      p.totalRequests += m.totalRequests;
      p.totalCost += m.totalCost;
      p.totalTokens += m.totalTokens;
      p._latencySum += (m.avgLatency || 0) * m.totalRequests;
      p._latencyCount += m.totalRequests;
      p.models.push(m);
    });

    return Object.values(map)
      .map((p) => ({
        // @ts-ignore
        ...p,
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        avgLatency: p._latencyCount ? p._latencySum / p._latencyCount : 0,
        // @ts-ignore
        models: p.models.sort((a: any, b: any) => b.totalRequests - a.totalRequests),
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests);
  }, [modelStats]);

  const totalRequests = providers.reduce((s: any, p: any) => s + p.totalRequests, 0) || 1;

  const modelColumns = useMemo<any>(
    () => [
      {
        key: "model",
        label: "Model",
        render: (m: any) => (
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
            {m.model}
          </span>
        ),
      },
      {
        key: "totalRequests",
        label: "Requests",
        render: (m: any) => formatNumber(m.totalRequests),
        align: "right",
      },
      {
        key: "totalTokens",
        label: "Tokens",
        render: (m: any) => formatNumber(m.totalTokens),
        align: "right",
      },
      {
        key: "avgTokensPerSec",
        label: "Tok/s",
        render: (m: any) => formatTokensPerSec(m.avgTokensPerSec),
        align: "right",
      },
      {
        key: "totalCost",
        label: "Cost",
        render: (m: any) => formatCost(m.totalCost),
        align: "right",
      },
      {
        key: "avgLatency",
        label: "Avg Latency",
        render: (m: any) => formatLatency(m.avgLatency),
        align: "right",
      },
    ],
    [],
  );



  useEffect(() => {
    setControls(
      // @ts-ignore
      <>
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
        />
        <ErrorMessage message={error} />
      </>,
    );
  }, [setControls, projectFilter, projectOptions, handleProjectChange, error]);

  useEffect(() => {
    return () => {
      // @ts-ignore
      setControls(null);
      // @ts-ignore
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with provider count
  useEffect(() => {
    // @ts-ignore
    setTitleBadge(providers.length);
  }, [setTitleBadge, providers.length]);

  return (
    <div className={styles.page}>

      {loading && <LoadingMessage message="Loading provider data..." />}

      <div className={styles.providerList}>
        {providers.map((p: any, i: any) => {
          const color = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
          const share = ((p.totalRequests / totalRequests) * 100).toFixed(1);
          const isExpanded = expandedProvider === p.provider;
          const providerLimits = rateLimits[p.provider];

          return (
            <div key={p.provider} className={styles.providerCard}>
              <button
                className={styles.providerHeader}
                onClick={() =>
                  setExpandedProvider(isExpanded ? null : p.provider)
                }
              >
                <div className={styles.providerName}>
                  <span
                    className={styles.providerDot}
                    style={{ background: color }}
                  />
                  <span>{resolveProviderLabel(p.provider)}</span>
                  <span className={styles.modelCount}>
                    {p.models.length} models
                  </span>
                  {providerLimits && (
                    <span className={styles.rateLimitBadge}>
                      {providerLimits.dynamic ? "⚡ Live" : "📋 Static"}
                    </span>
                  )}
                </div>
                <div className={styles.providerStats}>
                  <span className={styles.statItem}>
                    <span className={styles.statValue}>
                      {formatNumber(p.totalRequests)}
                    </span>
                    <span className={styles.statLabel}>requests</span>
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statValue}>
                      {formatCost(p.totalCost)}
                    </span>
                    <span className={styles.statLabel}>cost</span>
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statValue}>
                      {formatLatency(p.avgLatency)}
                    </span>
                    <span className={styles.statLabel}>avg latency</span>
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statValue}>{share}%</span>
                    <span className={styles.statLabel}>share</span>
                  </span>
                </div>
                <div className={styles.shareBar}>
                  <div
                    className={styles.shareBarFill}
                    style={{ width: `${share}%`, background: color }}
                  />
                </div>
              </button>

              {/* Rate Limits Section */}
              {providerLimits && (
                <RateLimitPanel data={providerLimits} />
              )}

              {isExpanded && (
                <div className={styles.modelList}>
                  <TableComponent
                    columns={modelColumns}
                    data={p.models}
                    getRowKey={(m: any, i: any) => `${m.model}-${i}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Rate Limit Panel ------------------------------------------

// @ts-ignore
function RateLimitPanel({ data: any }) {
  // @ts-ignore
  const { dynamic, models, note } = data;

  if (!models || Object.keys(models).length === 0) return null;

  return (
    <div className={styles.rateLimitPanel}>
      <div className={styles.rateLimitHeader}>
        <span className={styles.rateLimitTitle}>Rate Limits</span>
        {note && (
          <span className={styles.rateLimitMeta}>{note}</span>
        )}
      </div>
      <div className={styles.rateLimitModels}>
        {Object.entries(models).map(([modelName, modelData]) => (
          <ModelRateLimitCard
            key={modelName}
            modelName={modelName}
            modelData={modelData}
            dynamic={dynamic}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A single model's rate-limit card.
 * - Dynamic (OpenAI/Anthropic): shows remaining/limit progress bars per window (RPM, TPM).
 * - Static (Google): shows fixed RPM/TPM/RPD values.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function ModelRateLimitCard({ modelName: any, modelData: any, dynamic: any }) {
  // Static model (Google) — simple metric display
  // @ts-ignore
  if (!dynamic) {
    return (
      <div className={styles.rateLimitModelCard}>
        {/* @ts-ignore */}
        <span className={styles.rateLimitModelName}>{modelName}</span>
        <div className={styles.rateLimitMetrics}>
          {/* @ts-ignore */}
          <RateLimitMetric label="RPM" value={modelData.rpm} />
          {/* @ts-ignore */}
          <RateLimitMetric label="TPM" value={modelData.tpm} />
          // @ts-ignore
          {/* @ts-ignore */}
          {modelData.rpd != null && <RateLimitMetric label="RPD" value={modelData.rpd} />}
        </div>
      </div>
    );
  }

  // Dynamic model (OpenAI/Anthropic) — progress bars
  // @ts-ignore
  const { rateLimits, updatedAt } = modelData;
  if (!rateLimits) return null;

  const timeAgo = updatedAt ? formatTimeAgo(updatedAt) : null;

  return (
    <div className={styles.rateLimitModelCard}>
      <div className={styles.rateLimitModelHeader}>
        {/* @ts-ignore */}
        <span className={styles.rateLimitModelName}>{modelName}</span>
        {timeAgo && (
          <span className={styles.rateLimitMeta}>{timeAgo}</span>
        )}
      </div>
      <div className={styles.rateLimitMetrics}>
        {/* Requests per minute */}
        {rateLimits.requests?.limit != null && (
          <LimitBar
            label="RPM"
            remaining={rateLimits.requests.remaining}
            limit={rateLimits.requests.limit}
            reset={rateLimits.requests.reset}
          />
        )}
        {/* Tokens per minute */}
        {rateLimits.tokens?.limit != null && (
          <LimitBar
            label="TPM"
            remaining={rateLimits.tokens.remaining}
            limit={rateLimits.tokens.limit}
            reset={rateLimits.tokens.reset}
          />
        )}
        {/* Anthropic: Input tokens per minute */}
        {rateLimits.inputTokens?.limit != null && (
          <LimitBar
            label="ITPM"
            remaining={rateLimits.inputTokens.remaining}
            limit={rateLimits.inputTokens.limit}
            reset={rateLimits.inputTokens.reset}
          />
        )}
        {/* Anthropic: Output tokens per minute */}
        {rateLimits.outputTokens?.limit != null && (
          <LimitBar
            label="OTPM"
            remaining={rateLimits.outputTokens.remaining}
            limit={rateLimits.outputTokens.limit}
            reset={rateLimits.outputTokens.reset}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Compact progress bar with label, remaining/limit, and optional reset timer.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function LimitBar({ label: any, remaining: any, limit: any, reset: any }) {
  // @ts-ignore
  // @ts-ignore
  if (limit == null || limit === 0) return null;

  // @ts-ignore
  const rem = remaining ?? 0;
  // @ts-ignore
  const pct = Math.max(0, Math.min(100, (rem / limit) * 100));
  // HSL gradient: green (>60%) → yellow (30-60%) → red (<30%)
  const hue = Math.round((pct / 100) * 120);

  return (
    <div className={styles.limitBar}>
      <div className={styles.limitBarHeader}>
        {/* @ts-ignore */}
        <span className={styles.limitBarLabel}>{label}</span>
        <span className={styles.limitBarValues}>
          {/* @ts-ignore */}
          {formatCompact(rem)} / {formatCompact(limit)}
        </span>
      </div>
      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{
            width: `${pct}%`,
            background: `hsl(${hue}, 70%, 50%)`,
          }}
        />
      </div>
      {/* @ts-ignore */}
      {reset && (
        // @ts-ignore
        <span className={styles.rateLimitReset}>resets {reset}</span>
      )}
    </div>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function RateLimitMetric({ label: any, value: any }) {
  return (
    <span className={styles.rateLimitMetric}>
      <span className={styles.rateLimitMetricValue}>
        // @ts-ignore
        {/* @ts-ignore */}
        {value != null ? formatCompact(value) : "∞"}
      </span>
      {/* @ts-ignore */}
      <span className={styles.rateLimitMetricLabel}>{label}</span>
    </span>
  );
}


