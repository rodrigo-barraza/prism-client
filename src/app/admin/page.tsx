"use client";

import type {
  PrismConfig,
  ModelOption,
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
  POLL_STANDARD,
} from "@rodrigo-barraza/utilities-library";
import IrisService, {
  type IrisRequestEntry,
  type IrisDashboardResponse,
  type IrisTimelineResponse,
} from "../../services/IrisService";
import PrismService from "../../services/PrismService";
import { formatNumber, formatCost, formatLatency, formatTokensPerSec, formatElapsedTime } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../utils/utilities";
import { getErrorMessage } from "../../utils/errorMessage";
import { timelineBucketLabels } from "../../utils/timelineGranularity";
import { useCoalescedLoader } from "../../hooks/useCoalescedLoader";
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

/** Change events that move a dashboard number; attention pings do not. */
const STATS_COLLECTIONS = new Set([
  "requests",
  "model_conversations",
  "agent_conversations",
]);

interface SummaryState {
  /** The filters this was loaded for — a different key means "loading". */
  key: string;
  dashboard: IrisDashboardResponse | null;
  recentRequests: IrisRequestEntry[];
  recentTraces: IrisRequestEntry[];
  recentConversations: Conversation[];
  error: string | null;
}

interface TimelineState {
  key: string;
  response: IrisTimelineResponse;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Sum of a field over rows, never 0 (a proportion bar's denominator). */
function totalOf<T>(rows: T[], field: (row: T) => number | undefined): number {
  return rows.reduce((sum, row) => sum + (field(row) || 0), 0) || 1;
}

/** "model:provider" → the tools that model supports, from the Prism config. */
function toolsByModel(config: PrismConfig): Record<string, string[]> {
  const lookup: Record<string, string[]> = {};
  for (const [provider, models] of Object.entries(
    config.textToText?.models || {},
  ) as [string, ModelOption[]][]) {
    for (const modelOption of models) {
      if (modelOption.tools?.length) {
        lookup[`${provider}:${modelOption.name}`] = modelOption.tools;
      }
    }
  }
  return lookup;
}

function scrollToSection(sectionId: string) {
  return (event: React.SyntheticEvent) => {
    event.preventDefault();
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <span className={styles["section-title"]}>
      {title}
      <Link href={href} className={styles["section-action"]}>
        View all →
      </Link>
    </span>
  );
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project");
  const providerFilter = searchParams.get("provider");
  const modelFilter = searchParams.get("model");
  const workspaceFilter = searchParams.get("workspace");
  const { dateRange, dateRangeReady, agentFilter } = useAdminHeader();

  const filterParams = useMemo(() => {
    const params: Record<string, string> = buildDateRangeParams({
      from: dateRange.from,
      to: dateRange.to,
    });
    if (projectFilter) params.project = projectFilter;
    if (agentFilter) params.agent = agentFilter;
    if (providerFilter) params.provider = providerFilter;
    if (modelFilter) params.model = modelFilter;
    if (workspaceFilter) params.workspace = workspaceFilter;
    return params;
  }, [dateRange.from, dateRange.to, projectFilter, agentFilter, providerFilter, modelFilter, workspaceFilter]);
  const filterKey = useMemo(() => JSON.stringify(filterParams), [filterParams]);

  // A picked granularity belongs to the date range it was picked for: a new
  // range falls back to that range's default resolution.
  const rangeKey = `${dateRange.from}|${dateRange.to}`;
  const [granularityChoice, setGranularityChoice] = useState<{
    rangeKey: string;
    value: string;
  } | null>(null);
  const timelineGranularity =
    granularityChoice?.rangeKey === rangeKey ? granularityChoice.value : null;
  const handleGranularityChange = useCallback(
    (value: string | null) =>
      setGranularityChoice(value ? { rangeKey, value } : null),
    [rangeKey],
  );

  const [summaryState, setSummaryState] = useState<SummaryState | null>(null);
  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  const [configModels, setConfigModels] = useState<Record<string, string[]>>({});

  const loadSummary = useCallback(
    async (signal: AbortSignal) => {
      const [dashboardResult, requestsResult, tracesResult, conversationsResult] =
        await Promise.allSettled([
          IrisService.getDashboardStats(filterParams, signal),
          IrisService.getRequests(
            { limit: 10, sort: "createdAt", order: "desc", ...filterParams },
            signal,
          ),
          IrisService.getTraces(
            { page: 1, limit: 5, sort: "createdAt", order: "desc", ...filterParams },
            signal,
          ),
          IrisService.getConversations(
            { page: 1, limit: 10, sort: "updatedAt", order: "desc", ...filterParams },
            signal,
          ),
        ]);
      if (signal.aborted) return;
      setSummaryState((previous) => {
        // A failed refresh keeps what the same filters showed before.
        const kept = previous?.key === filterKey ? previous : null;
        const valueOr = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
          result.status === "fulfilled" ? result.value : fallback;
        return {
          key: filterKey,
          dashboard: valueOr(dashboardResult, kept?.dashboard ?? null),
          recentRequests:
            valueOr(requestsResult, null)?.data ?? kept?.recentRequests ?? [],
          recentTraces: valueOr(tracesResult, null)?.data ?? kept?.recentTraces ?? [],
          recentConversations:
            (valueOr(conversationsResult, null)?.data as Conversation[] | undefined) ??
            kept?.recentConversations ??
            [],
          error:
            dashboardResult.status === "rejected" && !isAbort(dashboardResult.reason)
              ? getErrorMessage(dashboardResult.reason)
              : null,
        };
      });
    },
    [filterParams, filterKey],
  );

  const loadTimeline = useCallback(
    async (signal: AbortSignal) => {
      try {
        // Without a date range the chart spans from the first request.
        const hours = filterParams.from || filterParams.to ? 720 : "all";
        const response = await IrisService.getTimeline(
          hours,
          filterParams,
          timelineGranularity || undefined,
          signal,
        );
        if (!signal.aborted) setTimelineState({ key: filterKey, response });
      } catch (error: unknown) {
        if (!isAbort(error) && !signal.aborted) {
          setTimelineState((previous) => (previous?.key === filterKey ? previous : null));
        }
      }
    },
    [filterParams, filterKey, timelineGranularity],
  );

  const reloadSummary = useCoalescedLoader(loadSummary, {
    enabled: dateRangeReady,
    minIntervalMs: POLL_STANDARD,
  });
  const reloadTimeline = useCoalescedLoader(loadTimeline, {
    enabled: dateRangeReady,
    minIntervalMs: POLL_STANDARD,
  });

  // Live updates: one subscription for the page's life, whatever the
  // filters. Without change streams, poll instead.
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const reloadAll = () => {
      reloadSummary();
      reloadTimeline();
    };
    const subscription = IrisService.subscribeCollectionChanges({
      onStatus: (data) => {
        if (!data.changeStreams && !pollInterval) {
          pollInterval = setInterval(reloadAll, POLL_LAZY);
        }
      },
      onChange: (event) => {
        if (event.collection && STATS_COLLECTIONS.has(event.collection)) reloadAll();
      },
    });
    return () => {
      subscription.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [reloadSummary, reloadTimeline]);

  // The model → tools lookup comes from the Prism config, which does not
  // change with the dashboard's data.
  useEffect(() => {
    let cancelled = false;
    PrismService.getConfig()
      .then((config) => {
        if (!cancelled && config?.textToText?.models) setConfigModels(toolsByModel(config));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = summaryState?.key === filterKey ? summaryState : null;
  const loading = !summary;
  const dashboard = summary?.dashboard ?? null;
  const stats = dashboard?.stats ?? null;
  const projectStats = useMemo(() => dashboard?.projects ?? [], [dashboard]);
  const providerStats = useMemo(() => dashboard?.providers ?? [], [dashboard]);
  const modelStats = useMemo(() => dashboard?.models ?? [], [dashboard]);
  const agentStats = useMemo(() => dashboard?.agents ?? [], [dashboard]);

  const timeline = timelineState?.key === filterKey ? timelineState.response : null;
  const chartData = useMemo(
    () =>
      (timeline?.data ?? []).map((entry) => ({
        ...entry,
        ...timelineBucketLabels(entry.hour),
      })),
    [timeline],
  );

  const totals = useMemo(
    () => ({
      projectRequests: totalOf(projectStats, (row) => row.totalRequests),
      projectCost: totalOf(projectStats, (row) => row.totalCost),
      providerRequests: totalOf(providerStats, (row) => row.totalRequests),
      providerCost: totalOf(providerStats, (row) => row.totalCost),
      modelRequests: totalOf(modelStats, (row) => row.totalRequests),
      modelCost: totalOf(modelStats, (row) => row.totalCost),
    }),
    [projectStats, providerStats, modelStats],
  );

  const count = (value: number | undefined) => (loading ? "—" : formatNumber(value || 0));
  const avgCostPerRequest =
    stats && stats.totalRequests > 0 ? stats.totalCost / stats.totalRequests : 0;
  const hasErrors = !!stats && stats.errorCount > 0;
  const emptyText = (text: string) => (loading ? "Loading..." : text);

  return (
    <main className={styles['page']}>
      <section id="dashboard-filters">
        <AdminFiltersCardComponent />
      </section>
      <ErrorMessage message={summary?.error ?? null} />
      {/* -- Resource Navigation -- */}
      <div className={styles['resource-navigation-bar']}>
        <ResourceCardComponent
          href="#projects-table"
          icon={Box}
          count={count(projectStats.length)}
          label="Projects"
          onClick={scrollToSection("projects-table")}
        />
        <ResourceCardComponent
          href="/admin/providers"
          icon={Layers}
          count={count(providerStats.length)}
          label="Providers"
        />
        <ResourceCardComponent
          href="/admin/models"
          icon={Server}
          count={count(modelStats.length)}
          label="Models"
        />
        <ResourceCardComponent
          href="#agents-table"
          icon={Bot}
          count={count(agentStats.length)}
          label="Agents"
          onClick={scrollToSection("agents-table")}
        />
        <ResourceCardComponent
          href="/admin/traces"
          icon={FolderOpen}
          count={count(stats?.traceCount)}
          label="Traces"
        />
        <ResourceCardComponent
          href="/admin/chat"
          icon={MessageSquare}
          count={count(stats?.conversationCount)}
          label="Chat"
        />
        <ResourceCardComponent
          href="/admin/requests"
          icon={ScrollText}
          count={count(stats?.totalRequests)}
          label="Requests"
        />
        {/* No workspaces page: workspaces are picked in the filters card. */}
        <ResourceCardComponent
          href="#dashboard-filters"
          icon={FolderKanban}
          count={count(stats?.workspaceCount)}
          label="Workspaces"
          onClick={scrollToSection("dashboard-filters")}
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
          icon={hasErrors ? AlertCircle : CheckCircle}
          variant={hasErrors ? "danger" : "success"}
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
        <div className={styles['chart-card']}>
          <TimelineChartComponent
            data={chartData}
            loading={!timeline}
            height={220}
            granularity={timelineGranularity}
            defaultGranularity={timeline?.defaultGranularity}
            validGranularities={timeline?.validGranularities ?? []}
            onGranularityChange={handleGranularityChange}
          />
        </div>

        <div className={styles['chart-card']}>
          <DistributionChartComponent
            projectStats={projectStats}
            providerStats={providerStats}
            modelStats={modelStats}
            stats={stats}
            loading={loading}
          />
        </div>
      </div>

      <section id="projects-table">
        <ProjectsTableComponent
          projects={projectStats}
          totalRequests={totals.projectRequests}
          totalCost={totals.projectCost}
          emptyText={emptyText("No projects yet")}
        />
      </section>

      <ProvidersTableComponent
        providers={providerStats}
        totalRequests={totals.providerRequests}
        totalCost={totals.providerCost}
        emptyText={emptyText("No data yet")}
      />

      <ModelsTableComponent
        mode="stats"
        models={modelStats}
        configModels={configModels}
        totalRequests={totals.modelRequests}
        totalCost={totals.modelCost}
        emptyText={emptyText("No data yet")}
      />

      <section id="agents-table">
        <AgentsTableComponent
          agents={agentStats}
          emptyText={emptyText("No agent data yet")}
        />
      </section>

      <TracesTableComponent
        traces={summary?.recentTraces ?? []}
        compact
        maxHeight={420}
        title={<SectionTitle title="Recent Traces" href="/admin/traces" />}
        emptyText={emptyText("No traces yet")}
      />

      <ConversationsTableComponent
        conversations={summary?.recentConversations ?? []}
        title={<SectionTitle title="Conversations" href="/admin/chat" />}
        emptyText={emptyText("No conversations yet")}
        compact
      />

      <RequestsTableComponent
        requests={summary?.recentRequests ?? []}
        title={<SectionTitle title="Recent Requests" href="/admin/requests" />}
        emptyText={emptyText("No requests yet")}
      />
    </main>
  );
}
