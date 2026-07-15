"use client";

import type {
  PrismConfig,
  ModelOption,
  IrisDashboardStats,
  IrisProjectStat,
  IrisModelStat,
  IrisAgentStat,
  IrisProviderStat,
  IrisTimelineEntry,
  Conversation,
} from "@/types/types";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Zap,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Box,
  Bot,
  Layers,
  Server,
  ScrollText,
  FolderOpen,
  MessageSquare,
  Timer,
  Wrench,
  FolderKanban,
} from "lucide-react";
import {
  POLL_LAZY,
  FEEDBACK_STANDARD_MILLISECONDS,
} from "@rodrigo-barraza/utilities-library";
import IrisService, {
  type IrisRequestEntry,
  type IrisCostBreakdownResponse,
} from "../../services/IrisService";
import PrismService from "../../services/PrismService";
import { formatNumber, formatCost, formatLatency, formatTokensPerSec, formatElapsedTime } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../utils/utilities";
import { getErrorMessage } from "../../utils/errorMessage";
import {
  StatsCardComponent as StatsCard,
} from "@rodrigo-barraza/components-library";

import TimelineChartComponent from "../../components/TimelineChartComponent";
import DistributionChartComponent from "../../components/DistributionChartComponent";
import ProjectsTableComponent from "../../components/ProjectsTableComponent";
import ProvidersTableComponent from "../../components/ProvidersTableComponent";
import ModelsTableComponent from "../../components/ModelsTableComponent";
import RequestsTableComponent from "../../components/RequestsTableComponent";
import ConversationsTableComponent from "../../components/ConversationsTableComponent";
import AgentsTableComponent from "../../components/AgentsTableComponent";
import TracesTableComponent from "../../components/TracesTableComponent";

import { ErrorMessage } from "../../components/StateMessageComponent";
import { useAdminHeader } from "../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../components/AdminFiltersCardComponent";
import ResourceCardComponent from "../../components/ResourceCardComponent";
import styles from "./page.module.css";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || null;
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const workspaceFilter = searchParams.get("workspace") || null;
  const { dateRange, agentFilter } = useAdminHeader();
  const [stats, setStats] = useState<IrisDashboardStats | null>(null);
  const [projectStats, setProjectStats] = useState<IrisProjectStat[]>([]);
  const [modelStats, setModelStats] = useState<IrisModelStat[]>([]);
  const [agentStats, setAgentStats] = useState<IrisAgentStat[]>([]);
  // Provider rollups come pre-aggregated from the server's /stats/costs
  // `providers` facet (true weighted averages) — the client no longer
  // re-groups per-model stats, which produced averages-of-averages drift.
  const [costProviders, setCostProviders] = useState<IrisProviderStat[]>([]);
  const [configModels, setConfigModels] = useState<Record<string, string[]>>(
    {},
  );

  const [timeline, setTimeline] = useState<IrisTimelineEntry[]>([]);
  const [timelineGranularity, setTimelineGranularity] = useState<string | null>(null);
  const [_activeGranularity, setActiveGranularity] = useState<string | undefined>(undefined);
  const [defaultGranularity, setDefaultGranularity] = useState<string | undefined>(undefined);
  const [validGranularities, setValidGranularities] = useState<string[]>([]);
  const [recentRequests, setRecentRequests] = useState<IrisRequestEntry[]>([]);
  const [recentTraces, setRecentTraces] = useState<IrisRequestEntry[]>([]);
  const [recentConversations, setRecentConversations] = useState<
    Conversation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  const timelineHours = useMemo(() => {
    if (dateRange.from || dateRange.to) return 720;
    return 8760; // 1 year default for "All Time"
  }, [dateRange]);

  const loadDashboard = useCallback(async () => {
    try {
      const filterParams: Record<string, string> = { ...dateParams };
      if (projectFilter) filterParams.project = projectFilter;
      if (agentFilter) filterParams.agent = agentFilter;
      if (providerFilter) filterParams.provider = providerFilter;
      if (modelFilter) filterParams.model = modelFilter;
      if (workspaceFilter) filterParams.workspace = workspaceFilter;

      const results = await Promise.allSettled([
        IrisService.getStats(filterParams),
        IrisService.getProjectStats(filterParams),
        IrisService.getModelStats(filterParams),
        IrisService.getAgentStats(filterParams),
        IrisService.getTimeline(timelineHours, filterParams, timelineGranularity || undefined),
        IrisService.getRequests({
          limit: 10,
          sort: "createdAt",
          order: "desc",
          ...filterParams,
        }),
        IrisService.getTraces({
          page: 1,
          limit: 5,
          sort: "createdAt",
          order: "desc",
          ...filterParams,
        }),
        IrisService.getConversations({
          page: 1,
          limit: 10,
          sort: "updatedAt",
          order: "desc",
          ...filterParams,
        }),
        IrisService.getCostStats(filterParams),
        PrismService.getConfig().catch(() => null),
      ]);

      const [
        statsResult,
        projectsResult,
        modelsResult,
        agentsResult,
        timelineResult,
        requestsResult,
        tracesResult,
        conversationsResult,
        costsResult,
        prismConfigResult,
      ] = results;

      const fulfilledCount = results.filter(
        (settledResult) => settledResult.status === "fulfilled",
      ).length;
      const rejectedResults = results.filter(
        (settledResult) => settledResult.status === "rejected",
      ) as PromiseRejectedResult[];

      // Only show error if ALL fetches failed (total outage)
      if (fulfilledCount === 0 && rejectedResults.length > 0) {
        setError(getErrorMessage(rejectedResults[0].reason));
      } else {
        setError(null);
      }

      // Apply fulfilled results with safe fallbacks for rejected ones
      setStats(
        statsResult.status === "fulfilled" ? statsResult.value : null,
      );
      setProjectStats(
        projectsResult.status === "fulfilled" ? projectsResult.value : [],
      );
      setModelStats(
        modelsResult.status === "fulfilled" ? modelsResult.value : [],
      );
      setAgentStats(
        agentsResult.status === "fulfilled" ? agentsResult.value : [],
      );
      setCostProviders(
        costsResult.status === "fulfilled"
          ? ((costsResult.value as IrisCostBreakdownResponse).providers ?? [])
          : [],
      );

      if (timelineResult.status === "fulfilled") {
        const timelineData = timelineResult.value;
        setTimeline(timelineData.data || timelineData);
        setActiveGranularity(timelineData.granularity || undefined);
        setDefaultGranularity(timelineData.defaultGranularity || undefined);
        setValidGranularities(timelineData.validGranularities || []);
      }

      setRecentRequests(
        requestsResult.status === "fulfilled"
          ? requestsResult.value.data || []
          : [],
      );
      setRecentTraces(
        tracesResult.status === "fulfilled"
          ? tracesResult.value.data || []
          : [],
      );
      setRecentConversations(
        conversationsResult.status === "fulfilled"
          ? ((conversationsResult.value.data || []) as Conversation[])
          : [],
      );

      // Build model→tools lookup from Prism config
      const prismConfig =
        prismConfigResult.status === "fulfilled"
          ? prismConfigResult.value
          : null;
      if (prismConfig?.textToText?.models) {
        const buildLookup = (config: PrismConfig) => {
          const lookup: Record<string, string[]> = {};
          for (const [provider, models] of Object.entries(
            config.textToText?.models || {},
          ) as [string, ModelOption[]][]) {
            for (const modelOption of models) {
              const key = `${provider}:${modelOption.name}`;
              if (modelOption.tools?.length) lookup[key] = modelOption.tools;
            }
          }
          return lookup;
        };
        setConfigModels(buildLookup(prismConfig));
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [dateParams, timelineHours, projectFilter, agentFilter, providerFilter, modelFilter, workspaceFilter, timelineGranularity]);

  // Live dashboard updates via Change Streams (debounced to 2s).
  // Falls back to 60s polling if Change Streams aren't available.
  useEffect(() => {
    // Immediately enter loading state and clear stale data when filters change
    setLoading(true);
    setError(null);
    setStats(null);
    setProjectStats([]);
    setModelStats([]);
    setAgentStats([]);
    setCostProviders([]);
    setTimeline([]);
    setRecentRequests([]);
    setRecentTraces([]);
    setRecentConversations([]);

    loadDashboard();

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadDashboard();
      }, FEEDBACK_STANDARD_MILLISECONDS);
    };

    const eventSource = IrisService.subscribeCollectionChanges({
      onStatus: (data) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to 60s polling
          if (!pollInterval) {
            pollInterval = setInterval(loadDashboard, POLL_LAZY);
          }
        }
      },
      onChange: debouncedReload,
    });

    return () => {
      eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadDashboard]);

  // Reset granularity override when date range changes so the new span
  // gets its appropriate default resolution instead of a stale override.
  useEffect(() => {
    setTimelineGranularity(null);
  }, [dateRange]);

  const handleGranularityChange = useCallback((value: string | null) => {
    setTimelineGranularity(value);
  }, []);

  // Provider rollups: consumed directly from the server's /stats/costs
  // `providers` facet (true weighted avgLatency / avgTokensPerSec over raw
  // request docs). Previously these were re-derived here by request-weighting
  // per-model averages, which is not arithmetically equal to a true aggregate.
  const { providerData, totalProviderRequests, totalProviderCost } = useMemo(() => {
    const providerDataList = costProviders;
    let providerRequestsSum = 0;
    let providerCostSum = 0;
    for (const provider of providerDataList) {
      providerRequestsSum += provider.totalRequests || 0;
      providerCostSum += provider.totalCost || 0;
    }
    return {
      providerData: providerDataList,
      totalProviderRequests: providerRequestsSum || 1,
      totalProviderCost: providerCostSum || 1,
    };
  }, [costProviders]);

  // Model totals + top-models list (still sourced from the per-model facet).
  const { topModels, totalModelRequests, totalModelCost } = useMemo(() => {
    let modelRequestsSum = 0;
    let modelCostSum = 0;
    for (const modelStat of modelStats) {
      modelRequestsSum += modelStat.totalRequests;
      modelCostSum += modelStat.totalCost || 0;
    }
    const topModelsList = [...modelStats].sort(
      (modelA, modelB) => modelB.totalRequests - modelA.totalRequests,
    );
    return {
      topModels: topModelsList,
      totalModelRequests: modelRequestsSum || 1,
      totalModelCost: modelCostSum || 1,
    };
  }, [modelStats]);

  // Project totals for proportion bars (Memoized & Single-pass)
  const { totalProjectRequests, totalProjectCost } = useMemo(() => {
    let requestsSum = 0;
    let costSum = 0;
    for (const project of projectStats) {
      requestsSum += project.totalRequests;
      costSum += project.totalCost || 0;
    }
    return {
      totalProjectRequests: requestsSum || 1,
      totalProjectCost: costSum || 1,
    };
  }, [projectStats]);

  // Recharts-friendly timeline data — convert UTC keys to local timezone labels
  const chartData = useMemo(() => {
    return timeline.map((timelineEntry) => {
      let label = "";
      let tickLabel = "";
      if (timelineEntry.hour) {
        const key = timelineEntry.hour;
        if (key.length <= 10) {
          // Daily bin: "2026-03-21"
          const date = new Date(key + "T00:00:00Z");
          label = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          tickLabel = label;
        } else {
          // All sub-day bins: parse as UTC
          // Key formats: "2026-04-02T22:05:31" (1s/5s/15s/30s), "2026-04-02T22:05" (1min/5min/15min), "2026-04-02T14" (1hr/4hr)
          const timePart = key.slice(11); // "22:05:31", "22:05", "14"
          const colonCount = (timePart.match(/:/g) || []).length;

          if (colonCount >= 2) {
            // Has seconds: 1s, 5s, 15s, or 30s bins — "22:05:31", "22:05:05"
            const [hoursString, minutesString, secondsString] = timePart
              .split(":")
              .map((part) => part.padStart(2, "0"));
            const date = new Date(`${key.slice(0, 10)}T${hoursString}:${minutesString}:${secondsString}Z`);
            label = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            });
            // Tick label every 30 seconds for readability at high density
            const secondsNumber = date.getSeconds();
            tickLabel = secondsNumber % 30 === 0 ? label : "";
          } else if (colonCount === 1) {
            // Has minutes: 1min, 5min, or 15min bins — "22:05"
            const [_hoursString, minutesString] = timePart.split(":");
            const paddedKey = key.slice(0, 14) + (minutesString || "0").padStart(2, "0");
            const date = new Date(paddedKey + ":00Z");
            label = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            // Tick on hour marks or every 15 minutes
            const minutesNumber = date.getMinutes();
            tickLabel =
              minutesNumber === 0 || minutesNumber % 15 === 0 ? label : "";
          } else {
            // Hourly or 4-hour bin: "14", "06"
            const hourString = timePart.padStart(2, "0");
            const date = new Date(`${key.slice(0, 10)}T${hourString}:00:00Z`);
            const dayLabel = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            label = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              hour12: true,
            });
            const localHours = date.getHours();
            // For 6h bins across multi-day spans, show day at midnight
            tickLabel = localHours === 0 ? dayLabel : label;
          }
        }
      }
      return { ...timelineEntry, label, tickLabel };
    });
  }, [timeline]);

  // Derived stats for extra cards
  const avgCostPerRequest =
    stats && stats.totalRequests > 0
      ? stats.totalCost / stats.totalRequests
      : 0;

  return (
    <main className={styles['page']}>
      <AdminFiltersCardComponent />
      <ErrorMessage message={error} />
      {/* -- Resource Navigation -- */}
      <div className={styles['resource-navigation-bar']}>
        <ResourceCardComponent
          href="#"
          icon={Box}
          count={loading ? "—" : formatNumber(projectStats.length)}
          label="Projects"
          onClick={(e: React.SyntheticEvent) => {
            e.preventDefault();
            document
              .getElementById("projects-table")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <ResourceCardComponent
          href="/admin/providers"
          icon={Layers}
          count={loading ? "—" : formatNumber(providerData.length)}
          label="Providers"
        />
        <ResourceCardComponent
          href="/admin/models"
          icon={Server}
          count={loading ? "—" : formatNumber(modelStats.length)}
          label="Models"
        />
        <ResourceCardComponent
          href="#"
          icon={Bot}
          count={loading ? "—" : formatNumber(agentStats.length)}
          label="Agents"
          onClick={(e: React.SyntheticEvent) => {
            e.preventDefault();
            document
              .getElementById("agents-table")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <ResourceCardComponent
          href="/admin/traces"
          icon={FolderOpen}
          count={loading ? "—" : formatNumber(stats?.agentConversationCount || 0)}
          label="Traces"
        />
        <ResourceCardComponent
          href="/admin/chat"
          icon={MessageSquare}
          count={loading ? "—" : formatNumber(stats?.conversationCount || 0)}
          label="Chat"
        />

        <ResourceCardComponent
          href="/admin/requests"
          icon={ScrollText}
          count={loading ? "—" : formatNumber(stats?.totalRequests || 0)}
          label="Requests"
        />
        <ResourceCardComponent
          href="#"
          icon={FolderKanban}
          count={loading ? "—" : formatNumber(stats?.workspaceCount || 0)}
          label="Workspaces"
        />
      </div>

      {/* Stats Row */}
      <div className={styles['stats-grid']}>
        <StatsCard
          label="Total Tokens"
          value={
            loading
              ? "..."
              : formatNumber(
                  (stats?.totalInputTokens || 0) +
                    (stats?.totalOutputTokens || 0),
                )
          }
          subtitle={
            loading
              ? ""
              : `${formatNumber(stats?.totalInputTokens || 0)} in / ${formatNumber(stats?.totalOutputTokens || 0)} out`
          }
          icon={Zap}
          variant="info"
          loading={loading}
        />
        <StatsCard
          label="Total Cost"
          value={loading ? "..." : formatCost(stats?.totalCost || 0)}
          subtitle="Estimated spend"
          icon={DollarSign}
          variant="warning"
          loading={loading}
        />
        <StatsCard
          label="Total Duration"
          value={loading ? "..." : formatElapsedTime(stats?.totalDuration || 0)}
          subtitle="Cumulative request time"
          icon={Timer}
          variant="info"
          loading={loading}
        />
        <StatsCard
          label="Avg Latency"
          value={loading ? "..." : formatLatency(stats?.avgLatency || 0)}
          subtitle={
            loading
              ? ""
              : `${formatTokensPerSec(stats?.avgTokensPerSec || 0)} tok/s`
          }
          icon={Clock}
          variant="success"
          loading={loading}
        />
        <StatsCard
          label="Tool Calls"
          value={loading ? "..." : formatNumber(stats?.totalToolCalls || 0)}
          subtitle="Total tool invocations"
          icon={Wrench}
          variant="info"
          loading={loading}
        />
        <StatsCard
          label="Success Rate"
          value={
            loading
              ? "..."
              : `${stats?.totalRequests ? ((stats.successCount / stats.totalRequests) * 100).toFixed(1) : 0}%`
          }
          subtitle={loading ? "" : `${stats?.errorCount || 0} errors`}
          icon={stats && stats.errorCount > 0 ? AlertCircle : CheckCircle}
          variant={stats && stats.errorCount > 0 ? "danger" : "success"}
          loading={loading}
        />
        <StatsCard
          label="Avg Cost / Request"
          value={loading ? "..." : formatCost(avgCostPerRequest)}
          subtitle="Per-request average"
          icon={TrendingUp}
          variant="info"
          loading={loading}
        />
      </div>

      {/* -- Charts Row -- */}
      <div className={styles['charts-layout-row']}>
        {/* Requests Timeline — Tabbed Chart */}
        <div className={styles['chart-card']}>
          <TimelineChartComponent
            data={chartData}
            loading={loading}
            height={220}
            granularity={timelineGranularity}
            defaultGranularity={defaultGranularity}
            validGranularities={validGranularities}
            onGranularityChange={handleGranularityChange}
          />
        </div>

        {/* Distribution — Tabbed Pie Chart */}
        <div className={styles['chart-card']}>
          <DistributionChartComponent
            projectStats={projectStats}
            providerStats={providerData}
            modelStats={modelStats}
            stats={stats}
            loading={loading}
          />
        </div>
      </div>

      {/* -- Projects -- */}
      <section id="projects-table">
        <ProjectsTableComponent
          projects={projectStats}
          totalRequests={totalProjectRequests}
          totalCost={totalProjectCost}
          emptyText={loading ? "Loading..." : "No projects yet"}
        />
      </section>

      {/* -- Providers -- */}
      <ProvidersTableComponent
        providers={providerData}
        totalRequests={totalProviderRequests}
        totalCost={totalProviderCost}
        emptyText={loading ? "Loading..." : "No data yet"}
      />

      {/* -- Models -- */}
      <ModelsTableComponent
        mode="stats"
        models={topModels}
        configModels={configModels}
        totalRequests={totalModelRequests}
        totalCost={totalModelCost}
        emptyText={loading ? "Loading..." : "No data yet"}
      />

      {/* -- Agents -- */}
      <section id="agents-table">
        <AgentsTableComponent
          agents={agentStats}
          emptyText={loading ? "Loading..." : "No agent data yet"}
        />
      </section>

      {/* -- Recent Traces -- */}
      <TracesTableComponent
        traces={recentTraces}
        compact
        maxHeight={420}
        title={
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            Recent Traces
            <Link href="/admin/traces" className={styles['section-action']}>
              View all →
            </Link>
          </span>
        }
        emptyText={loading ? "Loading..." : "No traces yet"}
      />

      {/* -- Recent Conversations -- */}
      <ConversationsTableComponent
        conversations={recentConversations}
        title={
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            Conversations
            <Link href="/admin/chat" className={styles['section-action']}>
              View all →
            </Link>
          </span>
        }
        emptyText={loading ? "Loading..." : "No conversations yet"}
        compact
      />

      {/* -- Recent Requests -- */}
      <RequestsTableComponent
        requests={recentRequests}
        title={
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            Recent Requests
            <Link href="/admin/requests" className={styles['section-action']}>
              View all →
            </Link>
          </span>
        }
        emptyText={loading ? "Loading..." : "No requests yet"}
      />
    </main>
  );
}
