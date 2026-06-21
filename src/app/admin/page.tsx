"use client";

import type {
  PrismConfig,
  ModelOption,
  IrisDashboardStats,
  IrisProjectStat,
  IrisModelStat,
  IrisAgentStat,
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
import IrisService, { type IrisRequestEntry } from "../../services/IrisService";
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

interface ProviderAggregation {
  provider: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  latencySum: number;
  tpsSum: number;
  tpsCount: number;
  modelCount: number;
  models: string[];
  conversationCount: number;
  workflowCount: number;
  agentConversationCount: number;
}

interface ProviderAggregationComputed extends ProviderAggregation {
  avgLatency: number;
  avgTokensPerSec: number | null;
}

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
  const [configModels, setConfigModels] = useState<Record<string, string[]>>(
    {},
  );

  const [timeline, setTimeline] = useState<IrisTimelineEntry[]>([]);
  const [timelineGranularity, setTimelineGranularity] = useState<string | null>(null);
  const [activeGranularity, setActiveGranularity] = useState<string | undefined>(undefined);
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

      const [
        statsData,
        projects,
        models,
        agents,
        timelineData,
        requestsData,
        tracesData,
        conversationsData,
        prismConfig,
      ] = await Promise.all([
        IrisService.getStats(filterParams),
        IrisService.getProjectStats(filterParams),
        IrisService.getModelStats(filterParams),
        IrisService.getAgentStats(filterParams),
        IrisService.getTimeline(timelineHours, filterParams, timelineGranularity || undefined),
        IrisService.getRequests({
          limit: 10,
          sort: "timestamp",
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
        PrismService.getConfigWithLocalModels().catch(() => null),
      ]);

      setStats(statsData);
      setProjectStats(projects);
      setModelStats(models);
      setAgentStats(agents);

      // Build model→tools lookup from Prism config
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

      setTimeline(timelineData.data || timelineData);
      setActiveGranularity(timelineData.granularity || undefined);
      setDefaultGranularity(timelineData.defaultGranularity || undefined);
      setValidGranularities(timelineData.validGranularities || []);
      setRecentRequests(requestsData.data || []);
      setRecentTraces(tracesData.data || []);
      setRecentConversations((conversationsData.data || []) as Conversation[]);
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

  // Build provider distribution from model stats
  const providerAgg: Record<string, ProviderAggregation> = {};
  modelStats.forEach((modelStat) => {
    if (!providerAgg[modelStat.provider]) {
      providerAgg[modelStat.provider] = {
        provider: modelStat.provider,
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        latencySum: 0,
        tpsSum: 0,
        tpsCount: 0,
        modelCount: 0,
        models: [] as string[],
        conversationCount: 0,
        workflowCount: 0,
        agentConversationCount: 0,
      };
    }
    const providerData = providerAgg[modelStat.provider];
    providerData.totalRequests += modelStat.totalRequests;
    providerData.totalInputTokens += modelStat.totalInputTokens || 0;
    providerData.totalOutputTokens += modelStat.totalOutputTokens || 0;
    providerData.totalCost += modelStat.totalCost || 0;
    providerData.latencySum += (modelStat.avgLatency || 0) * modelStat.totalRequests;
    providerData.modelCount += 1;
    if (modelStat.model) providerData.models.push(modelStat.model);
    providerData.conversationCount += modelStat.conversationCount || 0;
    providerData.workflowCount += modelStat.workflowCount || 0;
    providerData.agentConversationCount += modelStat.agentConversationCount || 0;
    if (modelStat.avgTokensPerSec) {
      providerData.tpsSum += modelStat.avgTokensPerSec * modelStat.totalRequests;
      providerData.tpsCount += modelStat.totalRequests;
    }
  });
  const providerData: ProviderAggregationComputed[] = Object.values(providerAgg)
    .map((providerAggItem) => ({
      ...providerAggItem,
      avgLatency: providerAggItem.totalRequests > 0 ? providerAggItem.latencySum / providerAggItem.totalRequests : 0,
      avgTokensPerSec: providerAggItem.tpsCount > 0 ? providerAggItem.tpsSum / providerAggItem.tpsCount : null,
    }))
    .sort((providerA, providerB) => providerB.totalRequests - providerA.totalRequests);
  const totalProviderRequests =
    providerData.reduce((sum, provider) => sum + provider.totalRequests, 0) || 1;
  const totalProviderCost =
    providerData.reduce((sum, provider) => sum + provider.totalCost, 0) || 1;

  // Top 10 models
  const topModels = [...modelStats].sort(
    (modelA, modelB) => modelB.totalRequests - modelA.totalRequests,
  );

  const totalModelRequests =
    modelStats.reduce((sum, model) => sum + model.totalRequests, 0) || 1;
  const totalModelCost =
    modelStats.reduce((sum, model) => sum + (model.totalCost || 0), 0) || 1;

  // Project totals for proportion bars
  const totalProjectRequests =
    projectStats.reduce((sum, project) => sum + project.totalRequests, 0) || 1;
  const totalProjectCost =
    projectStats.reduce((sum, project) => sum + (project.totalCost || 0), 0) || 1;

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
          const timePart = key.slice(11); // "22:05:31", "22:05", "14:0", "14", "06"
          const colonCount = (timePart.match(/:/g) || []).length;

          if (colonCount >= 2) {
            // Has seconds: 1s, 5s, 15s, or 30s bins — "22:05:31", "22:05:05"
            const [hoursString, minutesString, secondsString] = timePart
              .split(":")
              .map((part) => part.padStart(2, "0"));
            const date = new Date(`${key.slice(0, 10)}T${hoursString}:${minutesString}:${secondsString}Z`);
            const localHours = String(date.getHours()).padStart(2, "0");
            const localMinutes = String(date.getMinutes()).padStart(2, "0");
            const localSeconds = String(date.getSeconds()).padStart(2, "0");
            label = `${localHours}:${localMinutes}:${localSeconds}`;
            // Tick label every 30 seconds for readability at high density
            const secondsNumber = parseInt(localSeconds, 10);
            tickLabel = secondsNumber % 30 === 0 ? `${localHours}:${localMinutes}:${localSeconds}` : "";
          } else if (colonCount === 1) {
            // Has minutes: 1min, 5min, or 15min bins — "22:05", "14:0"
            const [, minutesString] = timePart.split(":");
            const paddedKey = key.slice(0, 14) + (minutesString || "0").padStart(2, "0");
            const date = new Date(paddedKey + ":00Z");
            const localHours = String(date.getHours()).padStart(2, "0");
            const localMinutes = String(date.getMinutes()).padStart(2, "0");
            label = `${localHours}:${localMinutes}`;
            // Tick on hour marks or every 15 minutes
            const minutesNumber = parseInt(localMinutes, 10);
            tickLabel =
              minutesNumber === 0 ? `${localHours}h` : minutesNumber % 15 === 0 ? `${localHours}:${localMinutes}` : "";
          } else {
            // Hourly or 4-hour bin: "14", "06"
            const hourString = timePart.padStart(2, "0");
            const date = new Date(`${key.slice(0, 10)}T${hourString}:00:00Z`);
            const localHours = String(date.getHours()).padStart(2, "0");
            const dayLabel = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            label = `${localHours}h`;
            // For 6h bins across multi-day spans, show day at midnight
            tickLabel = localHours === "00" ? dayLabel : `${localHours}h`;
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
