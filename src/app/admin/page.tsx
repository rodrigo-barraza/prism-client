"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Zap,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Box,
  Layers,
  Server,
  ScrollText,
  FolderOpen,
  MessageSquare,
  Timer,
  Wrench,
  Bot,
  FolderKanban,
} from "lucide-react";
import {
  POLL_LAZY,
  FEEDBACK_STANDARD_MS,
} from "@rodrigo-barraza/utilities-library";
import IrisService from "../../services/IrisService";
import PrismService from "../../services/PrismService";
import {
  formatNumber,
  formatCost,
  formatLatency,
  formatTokensPerSec,
  formatElapsedTime,
  buildDateRangeParams,
} from "../../utils/utilities";
import {
  SelectComponent,
  StatsCardComponent as StatsCard,
} from "@rodrigo-barraza/components-library";

import TimelineChartComponent from "../../components/TimelineChartComponent";
import DistributionChartComponent from "../../components/DistributionChartComponent";
import ProjectsTableComponent from "../../components/ProjectsTableComponent";
import ProvidersTableComponent from "../../components/ProvidersTableComponent";
import ModelsTableComponent from "../../components/ModelsTableComponent";
import RequestsTableComponent from "../../components/RequestsTableComponent";
import ConversationsTableComponent from "../../components/ConversationsTableComponent";
import TracesTableComponent from "../../components/TracesTableComponent";

import { ErrorMessage } from "../../components/StateMessageComponent";
import { useAdminHeader } from "../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../hooks/useProjectFilter";
import ResourceCardComponent from "../../components/ResourceCardComponent";
import styles from "./page.module.css";

export default function DashboardPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, dateRange } = useAdminHeader();
  const [stats, setStats] = useState<unknown>(null);
  const [projectStats, setProjectStats] = useState<unknown[]>([]);
  const [modelStats, setModelStats] = useState<unknown[]>([]);
  const [configModels, setConfigModels] = useState<Record<string, unknown>>({});

  const [timeline, setTimeline] = useState<unknown[]>([]);
  const [recentRequests, setRecentRequests] = useState<unknown[]>([]);
  const [recentTraces, setRecentTraces] = useState<unknown[]>([]);
  const [recentConversations, setRecentConversations] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      const filterParams = { ...dateParams };
      if (projectFilter) (filterParams as unknown).project = projectFilter;

      const [
        statsData,
        projects,
        models,
        timelineData,
        requestsData,
        tracesData,
        conversationsData,
        prismConfig,
      ] = await Promise.all([
        IrisService.getStats(filterParams),
        IrisService.getProjectStats(filterParams),
        IrisService.getModelStats(filterParams),
        IrisService.getTimeline(timelineHours, filterParams),
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
        PrismService.getConfig().catch(() => null),
      ]);

      setStats(statsData);
      setProjectStats(projects);
      setModelStats(models);

      // Build model→tools lookup from Prism config
      if (prismConfig?.textToText?.models) {
        const buildLookup = (config) => {
          const lookup = {};
          for (const [provider, models] of Object.entries(
            config.textToText?.models || {},
          ) as [string, unknown[]][]) {
            for (const m of models) {
              const key = `${provider}:${m.name}`;
              if (m.tools?.length) (lookup as Record<string, unknown>)[key] = m.tools;
            }
          }
          return lookup;
        };
        setConfigModels(buildLookup(prismConfig));

        // Progressive loading: merge local provider model tools when they arrive
        if (prismConfig.localProviders?.length > 0) {
          PrismService.getLocalConfig()
            .then(({ models }: unknown) => {
              const merged = PrismService.mergeLocalModels(prismConfig, models);
              if (merged !== prismConfig) setConfigModels(buildLookup(merged));
            })
            .catch(() => {});
        }
      }

      setTimeline(timelineData.data || timelineData);
      setRecentRequests(requestsData.data || []);
      setRecentTraces(tracesData.data || []);
      setRecentConversations(conversationsData.data || []);
    } catch (error: unknown) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [dateParams, timelineHours, projectFilter]);

  // Live dashboard updates via Change Streams (debounced to 2s).
  // Falls back to 60s polling if Change Streams aren't available.
  useEffect(() => {
    // Immediately enter loading state and clear stale data when filters change
    setLoading(true);
    setError(null);
    setStats(null);
    setProjectStats([]);
    setModelStats([]);
    setTimeline([]);
    setRecentRequests([]);
    setRecentTraces([]);
    setRecentConversations([]);

    loadDashboard();

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: unknown = null;

    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadDashboard();
      }, FEEDBACK_STANDARD_MS);
    };

    const es = IrisService.subscribeCollectionChanges({
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
      es.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadDashboard]);

  // Inject project dropdown into AdminShell header
  useEffect(() => {
    setControls(
      <SelectComponent
        value={projectFilter || ""}
        options={projectOptions}
        onChange={handleProjectChange}
        placeholder="All Projects"
        icon={<Box size={15} />}
      />,
    );
  }, [setControls, projectFilter, projectOptions, handleProjectChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => setControls(null);
  }, [setControls]);

  // Build provider distribution from model stats
  const providerAgg = {};
  modelStats.forEach((m) => {
    if (!(providerAgg as Record<string, unknown>)[m.provider]) {
      (providerAgg as Record<string, unknown>)[m.provider] = {
        provider: m.provider,
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        latencySum: 0,
        tpsSum: 0,
        tpsCount: 0,
        modelCount: 0,
        models: [],
        conversationCount: 0,
        workflowCount: 0,
        sessionCount: 0,
      };
    }
    const p = (providerAgg as Record<string, unknown>)[m.provider];
    p.totalRequests += m.totalRequests;
    p.totalInputTokens += m.totalInputTokens || 0;
    p.totalOutputTokens += m.totalOutputTokens || 0;
    p.totalCost += m.totalCost || 0;
    p.latencySum += (m.avgLatency || 0) * m.totalRequests;
    p.modelCount += 1;
    if (m.model) p.models.push(m.model);
    p.conversationCount += m.conversationCount || 0;
    p.workflowCount += m.workflowCount || 0;
    p.sessionCount += m.sessionCount || 0;
    if (m.avgTokensPerSec) {
      p.tpsSum += m.avgTokensPerSec * m.totalRequests;
      p.tpsCount += m.totalRequests;
    }
  });
  const providerData = Object.values(providerAgg)
    .map((p) => ({
      ...p,
      avgLatency: p.totalRequests > 0 ? p.latencySum / p.totalRequests : 0,
      avgTokensPerSec: p.tpsCount > 0 ? p.tpsSum / p.tpsCount : null,
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests);
  const totalProviderRequests =
    providerData.reduce((s, p) => s + p.totalRequests, 0) || 1;
  const totalProviderCost =
    providerData.reduce((s, p) => s + p.totalCost, 0) || 1;

  // Top 10 models
  const topModels = [...modelStats].sort(
    (a, b) => b.totalRequests - a.totalRequests,
  );

  const totalModelRequests =
    modelStats.reduce((s, m) => s + m.totalRequests, 0) || 1;
  const totalModelCost =
    modelStats.reduce((s, m) => s + (m.totalCost || 0), 0) || 1;

  // Project totals for proportion bars
  const totalProjectRequests =
    projectStats.reduce((s, x) => s + x.totalRequests, 0) || 1;
  const totalProjectCost =
    projectStats.reduce((s, x) => s + (x.totalCost || 0), 0) || 1;

  // Recharts-friendly timeline data — convert UTC keys to local timezone labels
  const chartData = useMemo(() => {
    return timeline.map((t) => {
      let label = "";
      let tickLabel = "";
      if (t.hour) {
        const key = t.hour;
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
          // Key formats: "2026-04-02T22:05:31" (1s/5s/15s), "2026-04-02T22:05" (1min/5min), "2026-04-02T14" (hour/6h)
          const timePart = key.slice(11); // "22:05:31", "22:05", "14:0", "14", "06"
          const colonCount = (timePart.match(/:/g) || []).length;

          if (colonCount >= 2) {
            // Has seconds: 1s, 5s, or 15s bins — "22:05:31", "22:05:05"
            const [hh, mm, ss] = timePart
              .split(":")
              .map((s) => s.padStart(2, "0"));
            const date = new Date(`${key.slice(0, 10)}T${hh}:${mm}:${ss}Z`);
            const lH = String(date.getHours()).padStart(2, "0");
            const lM = String(date.getMinutes()).padStart(2, "0");
            const lS = String(date.getSeconds()).padStart(2, "0");
            label = `${lH}:${lM}:${lS}`;
            // Tick label every 30 seconds for readability at high density
            const secNum = parseInt(lS, 10);
            tickLabel = secNum % 30 === 0 ? `${lH}:${lM}:${lS}` : "";
          } else if (colonCount === 1) {
            // Has minutes: 1min or 5min bins — "22:05", "14:0"
            const [, mm] = timePart.split(":");
            const paddedKey = key.slice(0, 14) + (mm || "0").padStart(2, "0");
            const date = new Date(paddedKey + ":00Z");
            const lH = String(date.getHours()).padStart(2, "0");
            const lM = String(date.getMinutes()).padStart(2, "0");
            label = `${lH}:${lM}`;
            // Tick on hour marks or every 15 minutes
            const minNum = parseInt(lM, 10);
            tickLabel =
              minNum === 0 ? `${lH}h` : minNum % 15 === 0 ? `${lH}:${lM}` : "";
          } else {
            // Hourly or 6-hour bin: "14", "06"
            const hourStr = timePart.padStart(2, "0");
            const date = new Date(`${key.slice(0, 10)}T${hourStr}:00:00Z`);
            const lH = String(date.getHours()).padStart(2, "0");
            const dayLabel = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            label = `${lH}h`;
            // For 6h bins across multi-day spans, show day at midnight
            tickLabel = lH === "00" ? dayLabel : `${lH}h`;
          }
        }
      }
      return { ...t, label, tickLabel };
    });
  }, [timeline]);

  // Derived stats for extra cards
  const avgCostPerRequest =
    (stats as Record<string, unknown>).totalRequests > 0
      ? stats.totalCost / stats.totalRequests
      : 0;

  return (
    <div className={styles.page}>
      <ErrorMessage message={error} />

      {/* -- Resource Navigation -- */}
      <div className={styles.resourceNav}>
        <ResourceCardComponent
          href="#"
          icon={Box}
          count={loading ? "—" : formatNumber(projectStats.length)}
          label="Projects"
          onClick={(e: React.MouseEvent) => {
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
          href="/admin/traces"
          icon={FolderOpen}
          count={loading ? "—" : formatNumber((stats as Record<string, unknown>).sessionCount)}
          label="Sessions"
        />
        <ResourceCardComponent
          href="/admin/conversations"
          icon={MessageSquare}
          count={
            loading ? "—" : formatNumber((stats as Record<string, unknown>).conversationCount)
          }
          label="Conversations"
        />
        <ResourceCardComponent
          href="/admin/requests"
          icon={ScrollText}
          count={loading ? "—" : formatNumber((stats as Record<string, unknown>).totalRequests)}
          label="Requests"
        />
        <ResourceCardComponent
          href="/admin/agent-sessions"
          icon={Bot}
          count={loading ? "—" : formatNumber((stats as Record<string, unknown>).agentCount)}
          label="Agents"
        />
        <ResourceCardComponent
          href="#"
          icon={FolderKanban}
          count={loading ? "—" : formatNumber((stats as Record<string, unknown>).workspaceCount)}
          label="Workspaces"
        />
      </div>

      {/* Stats Row */}
      <div className={styles.statsGrid}>
        <StatsCard
          label="Total Tokens"
          value={
            loading
              ? "..."
              : formatNumber(
                  ((stats as Record<string, unknown>).totalInputTokens || 0) +
                    ((stats as Record<string, unknown>).totalOutputTokens || 0),
                )
          }
          subtitle={
            loading
              ? ""
              : `${formatNumber((stats as Record<string, unknown>).totalInputTokens)} in / ${formatNumber((stats as Record<string, unknown>).totalOutputTokens)} out`
          }
          icon={Zap}
          variant="info"
          loading={loading}
        />
        <StatsCard
          label="Total Cost"
          value={loading ? "..." : formatCost((stats as Record<string, unknown>).totalCost)}
          subtitle="Estimated spend"
          icon={DollarSign}
          variant="warning"
          loading={loading}
        />
        <StatsCard
          label="Total Duration"
          value={
            loading ? "..." : formatElapsedTime((stats as Record<string, unknown>).totalDuration)
          }
          subtitle="Cumulative request time"
          icon={Timer}
          variant="info"
          loading={loading}
        />
        <StatsCard
          label="Avg Latency"
          value={loading ? "..." : formatLatency((stats as Record<string, unknown>).avgLatency)}
          subtitle={
            loading
              ? ""
              : `${formatTokensPerSec((stats as Record<string, unknown>).avgTokensPerSec)} tok/s`
          }
          icon={Clock}
          variant="success"
          loading={loading}
        />
        <StatsCard
          label="Tool Calls"
          value={loading ? "..." : formatNumber((stats as Record<string, unknown>).totalToolCalls)}
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
              : `${(stats as Record<string, unknown>).totalRequests ? (((stats as Record<string, unknown>).successCount / (stats as Record<string, unknown>).totalRequests) * 100).toFixed(1) : 0}%`
          }
          subtitle={loading ? "" : `${(stats as Record<string, unknown>).errorCount || 0} errors`}
          icon={(stats as Record<string, unknown>).errorCount > 0 ? AlertCircle : CheckCircle}
          variant={(stats as Record<string, unknown>).errorCount > 0 ? "danger" : "success"}
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
      <div className={styles.chartsRow}>
        {/* Requests Timeline — Tabbed Chart */}
        <div className={styles.chartCard}>
          <TimelineChartComponent
            data={chartData}
            loading={loading}
            height={220}
          />
        </div>

        {/* Distribution — Tabbed Pie Chart */}
        <div className={styles.chartCard}>
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
      <div id="projects-table">
        <ProjectsTableComponent
          projects={projectStats}
          totalRequests={totalProjectRequests}
          totalCost={totalProjectCost}
          emptyText={loading ? "Loading..." : "No projects yet"}
        />
      </div>

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
            <Link href="/admin/traces" className={styles.sectionAction}>
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
            <Link href="/admin/conversations" className={styles.sectionAction}>
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
            <Link href="/admin/requests" className={styles.sectionAction}>
              View all →
            </Link>
          </span>
        }
        emptyText={loading ? "Loading..." : "No requests yet"}
      />
    </div>
  );
}
