"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Coins,
  Cpu,
  XCircle,
} from "lucide-react";
import PrismService from "../services/PrismService";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import SummaryBarComponent from "./SummaryBarComponent";
import ModelsTableComponent from "./ModelsTableComponent";

import {
  ButtonComponent,
  EmptyStateComponent,
} from "@rodrigo-barraza/components-library";
import { formatCost } from "@rodrigo-barraza/utilities-library";
import styles from "./BenchmarkDashboardComponent.module.css";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";

import type { PrismConfig, ModelOption, BenchmarkModelStats, BenchmarkModelStat, BenchmarkBreakdown } from "../types/types";
import type { RawModel, RowData } from "./ModelsTableComponent";

interface BenchmarkDashboardProps {
  navSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
}

interface BenchmarkTotals {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  cost: number;
}

interface BenchmarkModelRow {
  name: string;
  key: string;
  provider: string;
  display_name: string;
  _benchThinkingEnabled: boolean;
  _benchToolsEnabled: boolean;
  _benchAgent: string | null;
  _benchTotal: number;
  _benchPassed: number;
  _benchFailed: number;
  _benchErrored: number;
  _benchPassRate: number;
  _benchAvgLatency: number;
  _benchTotalCost: number;
  _benchStat: BenchmarkModelStat;
  benchmarks?: BenchmarkBreakdown[];
  model?: string;
  [key: string]: unknown;
}

interface TabCounts {
  all: number;
  models: number;
  agents: number;
  [key: string]: number;
}

/**
 * Build a Map<"provider:model", configModelObject> from the config.
 * Used to enrich benchmark stat rows with proper display_name, modalities,
 * model type, etc. that the stats endpoint doesn't carry.
 */
function buildConfigLookup(config: PrismConfig | null) {
  if (!config) return new Map<string, ModelOption & { provider: string }>();
  const map = new Map<string, ModelOption & { provider: string }>();
  const MODEL_SECTIONS = [
    "textToText",
    "textToImage",
    "textToSpeech",
    "imageToText",
    "audioToText",
    "embedding",
  ] as const;
  for (const section of MODEL_SECTIONS) {
    const providers = (config as unknown as Record<string, { models?: Record<string, ModelOption[]> }>)[section]?.models || {};
    for (const [provider, models] of Object.entries(providers)) {
      for (const modelOption of models as ModelOption[]) {
        const key = `${provider}:${modelOption.name}`;
        if (!map.has(key)) {
          map.set(key, { ...modelOption, provider });
        }
      }
    }
  }
  return map;
}

/**
 * Derive a clean display name from a raw model path/key when no
 * display_name exists in the config. Handles common patterns:
 *   "qwen/qwen3.5-9b"                      → "Qwen3.5 9B"
 *   "deepseek-r1-distill-qwen-32b@q4_1"    → "DeepSeek R1 Distill Qwen 32B"
 *   "mistralai/devstral-small-2507"         → "Devstral Small 2507"
 */
function humanizeModelPath(raw: string) {
  if (!raw) return raw;
  // Strip publisher/org prefix: "qwen/qwen3.5-9b" → "qwen3.5-9b"
  let name = (raw.includes("/") ? raw.split("/").pop() : raw) || "";
  // Strip @quant suffix: "qwen3-32b@q8_0" → "qwen3-32b"
  name = name.replace(/@[\w.]+$/, "");
  // Replace hyphens/underscores with spaces
  name = name.replace(/[-_]/g, " ");
  // Capitalize each word, preserving existing uppercase and numbers
  name = name.replace(/\b([a-z])/g, (_: string, config: string) => config.toUpperCase());
  // Uppercase common size suffixes: "32b" → "32B", "0.6b" → "0.6B"
  name = name.replace(
    /(\d+(?:\.\d+)?)\s*b\b/gi,
    (_: string, node: string) => `${node}B`,
  );
  return name.trim();
}

const TABS = [
  { key: "all", label: "All", icon: null },
  { key: "models", label: "Models", icon: Cpu },
  { key: "agents", label: "Agents", icon: Bot },
];

export default function BenchmarkDashboardComponent({
  navSidebar,
  rightSidebar,
}: BenchmarkDashboardProps) {
  const router = useRouter();
  const [stats, setStats] = useState<BenchmarkModelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<BenchmarkModelRow | null>(null);
  const [configLookup, setConfigLookup] = useState(new Map<string, ModelOption & { provider: string }>());
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const hasLoadedRef = useRef<boolean>(false);

  // -- Load stats + config + favorites -----------------------
  const loadData = useCallback(async () => {
    try {
      const [data, mergedConfig] = await Promise.all([
        PrismService.getBenchmarkStats(),
        PrismService.getConfigWithLocalModels().catch(() => null),
      ]);
      setStats(data);
      setConfigLookup(buildConfigLookup(mergedConfig));
      hasLoadedRef.current = true;
    } catch (error: unknown) {
      console.error("Failed to load benchmark stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((file) => file.key)),
      )
      .catch(() => {});
  }, [loadData]);

  // -- Favorites ----------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((prev) => prev.filter((k) => k !== key));
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((prev) => [...prev, key]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  // -- Aggregate totals --------------------------------------
  const totals = useMemo((): BenchmarkTotals | null => {
    if (!stats?.models) return null;
    return stats.models.reduce(
      (accumulator: BenchmarkTotals, modelStat: BenchmarkModelStat) => ({
        total: accumulator.total + modelStat.total,
        passed: accumulator.passed + modelStat.passed,
        failed: accumulator.failed + modelStat.failed,
        errored: accumulator.errored + modelStat.errored,
        cost: accumulator.cost + modelStat.totalCost,
      }),
      { total: 0, passed: 0, failed: 0, errored: 0, cost: 0 },
    );
  }, [stats]);

  // -- Transform stat rows → ModelsTableComponent-compatible shape --
  // Enriches each stat row with config data (display_name, modalities,
  // model type, etc.) so normalizeModel() produces clean names.
  const allModelRows = useMemo((): BenchmarkModelRow[] => {
    if (!stats?.models) return [];
    return stats.models.map((statEntry: BenchmarkModelStat) => {
      const configKey = `${statEntry.provider}:${statEntry.model}`;
      const configModel = configLookup.get(configKey);
      return {
        // Config fields first (provides display_name, modalities, tools, etc.)
        ...(configModel || {}),
        // Override with stat-specific identity fields
        name: statEntry.model,
        key: statEntry.model,
        provider: statEntry.provider,
        // Use config display_name if available, otherwise humanize the raw path
        display_name:
          configModel?.display_name || humanizeModelPath(statEntry.label || statEntry.model),
        // Benchmark config flags (thinking / tools / agent)
        _benchThinkingEnabled: statEntry.thinkingEnabled || false,
        _benchToolsEnabled: statEntry.toolsEnabled || false,
        _benchAgent: statEntry.agent || null,
        // Benchmark-specific data (read by benchmark columns via _raw)
        _benchTotal: statEntry.total,
        _benchPassed: statEntry.passed,
        _benchFailed: statEntry.failed,
        _benchErrored: statEntry.errored,
        _benchPassRate: statEntry.passRate,
        _benchAvgLatency: statEntry.avgLatency,
        _benchTotalCost: statEntry.totalCost,
        // Preserve the original stat object for row click / sidebar
        _benchStat: statEntry,
        benchmarks: statEntry.benchmarks,
      };
    });
  }, [stats, configLookup]);

  // -- Tab filtering ----------------------------------
  const modelRows = useMemo(() => {
    if (activeTab === "models")
      return allModelRows.filter((row: BenchmarkModelRow) => !row._benchAgent);
    if (activeTab === "agents")
      return allModelRows.filter((row: BenchmarkModelRow) => !!row._benchAgent);
    return allModelRows;
  }, [allModelRows, activeTab]);

  // -- Tab counts -------------------------------------
  const tabCounts = useMemo(
    (): TabCounts => ({
      all: allModelRows.length,
      models: allModelRows.filter((row: BenchmarkModelRow) => !row._benchAgent).length,
      agents: allModelRows.filter((row: BenchmarkModelRow) => !!row._benchAgent).length,
    }),
    [allModelRows],
  );

  // -- Composite stat identity (model + config flags) ---------
  const statId = (statEntry: BenchmarkModelRow | null) =>
    `${statEntry?.provider}:${statEntry?.model}:${statEntry?._benchThinkingEnabled || false}:${statEntry?._benchToolsEnabled || false}:${statEntry?._benchAgent || ""}`;

  // -- Row click → select model for sidebar detail -----------
  const handleRowClick = useCallback((statEntry: BenchmarkModelRow) => {
    setSelectedModel((previous: BenchmarkModelRow | null) =>
      statId(previous) === statId(statEntry) ? null : statEntry,
    );
  }, []);

  // -- Row class for selected highlight ----------------------
  const getRowClassName = useCallback(
    (statEntry: BenchmarkModelRow) => {
      if (selectedModel && statId(statEntry) === statId(selectedModel)) {
        return styles['selected-layout-row'];
      }
      return "";
    },
    [selectedModel],
  );

  // -- Detail cards for selected model (left sidebar) --------
  const sidebarDetail = useMemo(() => {
    if (!selectedModel?.benchmarks?.length) return null;
    return (
      <div className={styles['sidebar-detail-grid']}>
        {selectedModel.benchmarks.map((benchmark: BenchmarkBreakdown, benchmarkIndex: number) => {
          const benchmarkRate =
            benchmark.total > 0 ? Math.round((benchmark.passed / benchmark.total) * 100) : 0;
          return (
            <div
              key={benchmarkIndex}
              className={`${styles['detail-card']} ${
                benchmark.latestPassed
                  ? styles['detail-card-passed']
                  : benchmark.latestErrored
                    ? styles['detail-card-errored']
                    : styles['detail-card-failed']
              }`}
            >
              <div className={styles['detail-header']}>
                <div className={styles['detail-name']}>{benchmark.name}</div>
                <span
                  className={`${styles['detail-status']} ${
                    benchmark.latestPassed
                      ? styles['detail-status-passed']
                      : styles['detail-status-failed']
                  }`}
                >
                  {benchmark.latestPassed
                    ? "✓ Latest"
                    : benchmark.latestErrored
                      ? "⚠ Error"
                      : "✗ Latest"}
                </span>
              </div>
              <div className={styles['detail-stats']}>
                <span className={styles['detail-runs']}>
                  {benchmark.total} run{benchmark.total !== 1 ? "s" : ""}
                </span>
                <span className={styles['detail-passed']}>
                  <CheckCircle2 size={10} /> {benchmark.passed}
                </span>
                <span className={styles['detail-failed']}>
                  <XCircle size={10} /> {benchmark.failed + benchmark.errored}
                </span>
                <span
                  className={styles['detail-rate']}
                  style={{
                    color:
                      benchmarkRate >= 80
                        ? "var(--color-success)"
                        : benchmarkRate >= 50
                          ? "var(--color-warning)"
                          : "var(--color-danger)",
                  }}
                >
                  {benchmarkRate}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [selectedModel]);

  // -- Render ------------------------------------------------
  return (
    <ThreePanelLayout
      className="benchmark-dashboard-component"
      navSidebar={navSidebar}
      leftPanel={sidebarDetail}
      leftTitle={selectedModel?.model || ""}
      rightPanel={rightSidebar}
      rightTitle="Benchmarks"
      headerControls={
        <ButtonComponent
          variant="primary"
          onClick={() => router.push("/benchmarks/new")}
        >
          New Benchmark
        </ButtonComponent>
      }
    >
      <div className={styles['container']}>
        {loading ? (
          <div className={styles['is-loading-state']}>
            <PanelLoadingSpinner size="large" />
          </div>
        ) : !stats || stats.models.length === 0 ? (
          <EmptyStateComponent
            icon={<BarChart3 size={36} />}
            title="No Benchmark Data Yet"
            subtitle="Run benchmarks against your models to see performance stats here."
          >
            <ButtonComponent
              variant="primary"
              onClick={() => router.push("/benchmarks/new")}
            >
              Create Benchmark
            </ButtonComponent>
          </EmptyStateComponent>
        ) : (
          <>
            {/* -- Summary Bar (sticky) ------------- */}
            <div className={styles['sticky-bar']}>
              <SummaryBarComponent
                items={[
                  {
                    value: stats.totalModels,
                    label: "Configs Tested",
                  },
                  {
                    value: stats.totalBenchmarks,
                    label: "Benchmarks",
                  },
                  { value: totals!.total, label: "Total Tests" },
                  {
                    value: totals!.passed,
                    label: "Passed",
                    color: "var(--color-success)",
                  },
                  {
                    value: totals!.failed + totals!.errored,
                    label: "Failed",
                    color: "var(--color-danger)",
                  },
                  {
                    bar:
                      totals!.total > 0
                        ? (totals!.passed / totals!.total) * 100
                        : 0,
                    barPassed: totals!.passed,
                    barTotal: totals!.total,
                    label:
                      totals!.total > 0
                        ? `${Math.round((totals!.passed / totals!.total) * 100)}%`
                        : "—",
                  },
                  ...(totals!.cost > 0
                    ? [
                        {
                          value: formatCost(totals!.cost),
                          label: "Total Cost",
                          color: "var(--color-success)",
                          icon: <Coins size={14} />,
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            {/* -- Segmented Control (Models / Agents) -- */}
            <div className={styles['segmented']}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                const count = tabCounts[tab.key];
                return (
                  <button
                    key={tab.key}
                    className={`${styles['segmented-button']} ${isActive ? styles['segmented-button-element-is-active-state'] : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {Icon && <Icon size={13} />}
                    {tab.label}
                    <span className={styles['segmented-count']}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* -- Performance Table ------------ */}
            <ModelsTableComponent
              models={modelRows}
              mode="benchmark"
              onSelect={handleRowClick as unknown as (model: RawModel) => void}
              showSearch={true}
              showProviderFilter={true}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
              getRowClassName={getRowClassName as unknown as (row: RowData) => string}
              emptyText={
                activeTab === "agents"
                  ? "No agent benchmark data yet"
                  : activeTab === "models"
                    ? "No model benchmark data yet"
                    : "No benchmark data"
              }
            />
          </>
        )}
      </div>
    </ThreePanelLayout>
  );
}
