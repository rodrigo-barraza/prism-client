"use client";

import { useState, useEffect, useMemo } from "react";
import IrisService, {
  type RateLimitData,
  type ModelRateLimitData,
} from "../../../services/IrisService";
import type { IrisProviderStat } from "@/types/types";
import PrismService from "../../../services/PrismService";
import {
  SelectComponent,
  TableComponent,
} from "@rodrigo-barraza/components-library";
import { resolveProviderLabel } from "../../../components/ProviderLogosComponent";

import {
  LoadingMessage,
  ErrorMessage,
} from "../../../components/StateMessageComponent";
import { formatNumber, formatCost, formatLatency, formatTokensPerSec, formatCompact, timeAgo as formatTimeAgo } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../../utils/utilities";
import { PROVIDER_COLORS } from "../../../constants";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import styles from "./page.module.css";

interface ModelStat {
  provider: string;
  model: string;
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  avgLatency: number;
  avgTokensPerSec?: number;
}

interface ProviderStat {
  provider: string;
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  avgLatency: number;
  avgTokensPerSec?: number | null;
  models: ModelStat[];
}

export default function ProvidersPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const [modelStats, setModelStats] = useState<ModelStat[]>([]);
  // Provider-level rollups (true weighted averages) from the server's
  // /stats/costs `providers` facet — not re-derived from per-model averages.
  const [costProviders, setCostProviders] = useState<IrisProviderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [rateLimits, setRateLimits] = useState<Record<string, RateLimitData>>(
    {},
  );

  useEffect(() => {
    // Immediately enter loading state and clear stale data when filters change
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setLoading(true);
    setError(null);
    setModelStats([]);
    setCostProviders([]);

    async function load() {
      try {
        const params: Record<string, string | number | boolean> = {};
        if (projectFilter) params.project = projectFilter;
        if (agentFilter) params.agent = agentFilter;
        Object.assign(params, buildDateRangeParams(dateRange));
        const [models, costs, limits] = await Promise.all([
          IrisService.getModelStats(params),
          IrisService.getCostStats(params).catch(() => null),
          IrisService.getRateLimits().catch(() => ({})),
          // Side-effect: registers local provider nicknames
          PrismService.getConfig().catch(() => null),
        ]);
        setModelStats((models || []) as ModelStat[]);
        setCostProviders(costs?.providers ?? []);
        setRateLimits((limits || {}) as Record<string, RateLimitData>);
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dateRange, projectFilter, agentFilter]);

  // Provider rows come from the server's authoritative /stats/costs rollup
  // (true weighted avgLatency / avgTokensPerSec). We only join the per-model
  // list locally for the expandable drill-down.
  const providers = useMemo(() => {
    const modelsByProvider: Record<string, ModelStat[]> = {};
    for (const model of modelStats) {
      (modelsByProvider[model.provider] ??= []).push(model);
    }

    return costProviders
      .map((providerRollup): ProviderStat => ({
        provider: providerRollup.provider,
        totalRequests: providerRollup.totalRequests || 0,
        totalCost: providerRollup.totalCost || 0,
        totalTokens:
          (providerRollup.totalInputTokens || 0) +
          (providerRollup.totalOutputTokens || 0),
        avgLatency: providerRollup.avgLatency || 0,
        avgTokensPerSec: providerRollup.avgTokensPerSec ?? null,
        models: (modelsByProvider[providerRollup.provider] || []).sort(
          (modelA, modelB) => modelB.totalRequests - modelA.totalRequests,
        ),
      }))
      .sort((providerA, providerB) => providerB.totalRequests - providerA.totalRequests);
  }, [costProviders, modelStats]);

  const totalRequests =
    providers.reduce((sum: number, provider) => sum + provider.totalRequests, 0) || 1;

  const modelColumns = useMemo(
    () => [
      {
        key: "model",
        label: "Model",
        render: (model: ModelStat) => (
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
            {model.model}
          </span>
        ),
      },
      {
        key: "totalRequests",
        label: "Requests",
        render: (model: ModelStat) => formatNumber(model.totalRequests),
        align: "right" as const,
      },
      {
        key: "totalTokens",
        label: "Tokens",
        render: (model: ModelStat) => formatNumber(model.totalTokens),
        align: "right" as const,
      },
      {
        key: "avgTokensPerSec",
        label: "Tok/s",
        render: (model: ModelStat) => formatTokensPerSec(model.avgTokensPerSec),
        align: "right" as const,
      },
      {
        key: "totalCost",
        label: "Cost",
        render: (model: ModelStat) => formatCost(model.totalCost),
        align: "right" as const,
      },
      {
        key: "avgLatency",
        label: "Avg Latency",
        render: (model: ModelStat) => formatLatency(model.avgLatency),
        align: "right" as const,
      },
    ],
    [],
  );

  useEffect(() => {
    setControls(
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
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with provider count
  useEffect(() => {
    setTitleBadge(providers.length);
  }, [setTitleBadge, providers.length]);

  return (
    <div className={styles['page']}>
      {loading && <LoadingMessage message="Loading provider data..." />}

      <div className={styles['provider-list']}>
        {providers.map((provider, providerIndex: number) => {
          const color = PROVIDER_COLORS[providerIndex % PROVIDER_COLORS.length];
          const share = ((provider.totalRequests / totalRequests) * 100).toFixed(1);
          const isExpanded = expandedProvider === provider.provider;
          const providerLimits = rateLimits[provider.provider];

          return (
            <div key={provider.provider} className={styles['provider-card']}>
              <button
                className={styles['provider-header']}
                onClick={() =>
                  setExpandedProvider(isExpanded ? null : provider.provider)
                }
              >
                <div className={styles['provider-name']}>
                  <span
                    className={styles['provider-dot']}
                    style={{ background: color }}
                  />
                  <span>{resolveProviderLabel(provider.provider)}</span>
                  <span className={styles['model-count']}>
                    {provider.models.length} models
                  </span>
                  {providerLimits && (
                    <span className={styles['rate-limit-badge']}>
                      {providerLimits.dynamic ? "⚡ Live" : "📋 Static"}
                    </span>
                  )}
                </div>
                <div className={styles['provider-stats']}>
                  <span className={styles['stat-item']}>
                    <span className={styles['stat-value']}>
                      {formatNumber(provider.totalRequests)}
                    </span>
                    <span className={styles['stat-label']}>requests</span>
                  </span>
                  <span className={styles['stat-item']}>
                    <span className={styles['stat-value']}>
                      {formatCost(provider.totalCost)}
                    </span>
                    <span className={styles['stat-label']}>cost</span>
                  </span>
                  <span className={styles['stat-item']}>
                    <span className={styles['stat-value']}>
                      {formatLatency(provider.avgLatency)}
                    </span>
                    <span className={styles['stat-label']}>avg latency</span>
                  </span>
                  <span className={styles['stat-item']}>
                    <span className={styles['stat-value']}>{share}%</span>
                    <span className={styles['stat-label']}>share</span>
                  </span>
                </div>
                <div className={styles['share-bar']}>
                  <div
                    className={styles['share-bar-fill']}
                    style={{ width: `${share}%`, background: color }}
                  />
                </div>
              </button>

              {/* Rate Limits Section */}
              {providerLimits && <RateLimitPanel data={providerLimits} />}

              {isExpanded && (
                <div className={styles['model-list']}>
                  <TableComponent
                    columns={modelColumns}
                    data={provider.models}
                    getRowKey={(model: ModelStat, modelIndex: number) =>
                      `${model.model}-${modelIndex}`
                    }
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

// Rate limit interfaces imported from IrisService

function RateLimitPanel({ data }: { data: RateLimitData }) {
  const { dynamic, models, note } = data;

  if (!models || Object.keys(models).length === 0) return null;

  return (
    <div className={styles['rate-limit-panel']}>
      <div className={styles['rate-limit-header']}>
        <span className={styles['rate-limit-title']}>Rate Limits</span>
        {note && <span className={styles['rate-limit-meta']}>{note}</span>}
      </div>
      <div className={styles['rate-limit-models']}>
        {Object.entries(models).map(
          ([modelName, modelData]: [string, ModelRateLimitData]) => (
            <ModelRateLimitCard
              key={modelName}
              modelName={modelName}
              modelData={modelData}
              dynamic={dynamic}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * A single model's rate-limit card.
 * - Dynamic (OpenAI/Anthropic): shows remaining/limit progress bars per window (RPM, TPM).
 * - Static (Google): shows fixed RPM/TPM/RPD values.
 */
function ModelRateLimitCard({
  modelName,
  modelData,
  dynamic,
}: {
  modelName: string;
  modelData: ModelRateLimitData;
  dynamic?: boolean;
}) {
  // Static model (Google) — simple metric display
  if (!dynamic) {
    return (
      <div className={styles['rate-limit-model-card']}>
        <span className={styles['rate-limit-model-name']}>{modelName}</span>
        <div className={styles['rate-limit-metrics']}>
          <RateLimitMetric label="RPM" value={modelData.rpm} />
          <RateLimitMetric label="TPM" value={modelData.tpm} />
          {modelData.rpd != null && (
            <RateLimitMetric label="RPD" value={modelData.rpd} />
          )}
        </div>
      </div>
    );
  }

  // Dynamic model (OpenAI/Anthropic) — progress bars
  const { rateLimits, updatedAt } = modelData;
  if (!rateLimits) return null;

  const timeAgo = updatedAt ? formatTimeAgo(updatedAt) : null;

  return (
    <div className={styles['rate-limit-model-card']}>
      <div className={styles['rate-limit-model-header']}>
        <span className={styles['rate-limit-model-name']}>{modelName}</span>
        {timeAgo && <span className={styles['rate-limit-meta']}>{timeAgo}</span>}
      </div>
      <div className={styles['rate-limit-metrics']}>
        {/* Requests per minute */}
        {rateLimits.requests?.limit != null && (
          <LimitBar
            label="RPM"
            remaining={rateLimits.requests.remaining ?? 0}
            limit={rateLimits.requests.limit}
            reset={rateLimits.requests.reset}
          />
        )}
        {/* Tokens per minute */}
        {rateLimits.tokens?.limit != null && (
          <LimitBar
            label="TPM"
            remaining={rateLimits.tokens.remaining ?? 0}
            limit={rateLimits.tokens.limit}
            reset={rateLimits.tokens.reset}
          />
        )}
        {/* Anthropic: Input tokens per minute */}
        {rateLimits.inputTokens?.limit != null && (
          <LimitBar
            label="ITPM"
            remaining={rateLimits.inputTokens.remaining ?? 0}
            limit={rateLimits.inputTokens.limit}
            reset={rateLimits.inputTokens.reset}
          />
        )}
        {/* Anthropic: Output tokens per minute */}
        {rateLimits.outputTokens?.limit != null && (
          <LimitBar
            label="OTPM"
            remaining={rateLimits.outputTokens.remaining ?? 0}
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
function LimitBar({
  label,
  remaining,
  limit,
  reset,
}: {
  label: string;
  remaining: number;
  limit: number;
  reset?: string;
}) {
  if (limit == null || limit === 0) return null;

  const rem = remaining ?? 0;
  const percentage = Math.max(0, Math.min(100, (rem / limit) * 100));
  // HSL gradient: green (>60%) → yellow (30-60%) → red (<30%)
  const hue = Math.round((percentage / 100) * 120);

  return (
    <div className={styles['limit-bar']}>
      <div className={styles['limit-bar-header']}>
        <span className={styles['limit-bar-label']}>{label}</span>
        <span className={styles['limit-bar-values']}>
          {formatCompact(rem)} / {formatCompact(limit)}
        </span>
      </div>
      <div className={styles['progress-bar-track']}>
        <div
          className={styles['progress-bar-fill']}
          style={{
            width: `${percentage}%`,
            background: `hsl(${hue}, 70%, 50%)`,
          }}
        />
      </div>
      {reset && <span className={styles['rate-limit-reset']}>resets {reset}</span>}
    </div>
  );
}

function RateLimitMetric({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <span className={styles['rate-limit-metric']}>
      <span className={styles['rate-limit-metric-value']}>
        {value != null ? formatCompact(value) : "∞"}
      </span>
      <span className={styles['rate-limit-metric-label']}>{label}</span>
    </span>
  );
}
