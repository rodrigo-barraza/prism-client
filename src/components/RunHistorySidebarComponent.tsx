"use client";

import { useState, useMemo } from "react";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ListChecks,
  AlertTriangle,
  Cpu,
  Settings,
} from "lucide-react";
import AgentCardComponent from "./AgentCardComponent";
import ModelCardComponent from "./ModelCardComponent";
import {
  TabBarComponent,
  tabBarStyles,
} from "@rodrigo-barraza/components-library";
import ChatPreviewComponent from "./ChatPreviewComponent";

import BadgeComponent from "./BadgeComponent";

import BenchmarkBarComponent from "./BenchmarkBarComponent";
import SoundService from "@/services/SoundService";
import styles from "./RunHistorySidebarComponent.module.css";

/**
 * RunHistorySidebarComponent — left sidebar for the benchmark detail page.
 * Two tabs: General (models/assertions/prompt) and Run History.
 *
 * Props:
 *   benchmark          — the benchmark document
 *   runHistory         — array of past runs
 *   activeRunId        — currently viewed run's id
 *   onViewRun          — callback(run) to switch to a run
 *   running            — whether a run is currently in progress
 *   streamingCompleted — number of completed models in the current streaming run
 *   thinkingMap        — Map<instanceId, boolean> per-model thinking toggle state
 *   onToggleThinking   — callback(instanceId) to toggle thinking
 *   toolsMap           — Map<instanceId, boolean> per-model tools toggle state
 *   onToggleTools      — callback(instanceId) to toggle tools
 *   agentInstances     — array of agent instances
 *   onRemoveAgent      — callback(instanceId) to remove agent
 *   onChangeAgentModel — callback(instanceId, provider, modelName) to change agent's backing model
 *   allModels          — flat array of all model definitions
 */
import type {
  BenchmarkRun,
  BenchmarkRunResult,
  PrismConfig,
} from "../types/types";
import type { ModelInstance } from "./BenchmarkDetailPageComponent";

interface BenchmarkAssertion {
  expectedValue: string;
  matchMode: string;
}

interface AgentInstance {
  instanceId: string;
  agentId: string;
  name: string;
  description: string;
  provider?: string;
  modelName?: string;
}

interface ModelOptionWithProvider {
  provider: string;
  name: string;
  thinking?: boolean;
  tools?: string[];
  instanceId: string;
}

interface RunHistorySidebarComponentProps {
  benchmark: Record<string, unknown> | null;
  runHistory?: BenchmarkRun[];
  activeRunId?: string | null;
  onViewRun?: (run: BenchmarkRun) => void;
  running?: boolean;
  streamingCompleted?: number;
  selectedModels?: ModelOptionWithProvider[];
  onRemoveModel?: (instanceId: string) => void;
  onChangeModel?: (instanceId: string, provider: string, modelName: string) => void;
  onClearSelection?: () => void;
  thinkingMap?: Record<string, boolean>;
  onToggleThinking?: (instanceId: string) => void;
  toolsMap?: Record<string, boolean>;
  onToggleTools?: (instanceId: string) => void;
  agentInstances?: AgentInstance[];
  onRemoveAgent?: (instanceId: string) => void;
  onChangeAgentModel?: (instanceId: string, provider: string, modelName: string) => void;
  allModels?: ModelOptionWithProvider[];
  config?: PrismConfig | null;
}

export default function RunHistorySidebarComponent({
  benchmark,
  runHistory = [],
  activeRunId,
  onViewRun,
  running = false,
  streamingCompleted = 0,
  selectedModels = [],
  onRemoveModel,
  onChangeModel,
  onClearSelection,
  thinkingMap = {},
  onToggleThinking,
  toolsMap = {},
  onToggleTools,
  agentInstances = [],
  onRemoveAgent,
  onChangeAgentModel,
  allModels = [],
  config,
}: RunHistorySidebarComponentProps) {
  const [activeTab, setActiveTab] = useState("general");

  // Normalize assertions: fall back to single expectedValue/matchMode for older benchmarks
  const assertions: BenchmarkAssertion[] = useMemo(() => {
    const benchmarkData = benchmark as Record<string, unknown> | null;
    const existingAssertions = benchmarkData?.assertions as BenchmarkAssertion[] | undefined;
    if (existingAssertions && existingAssertions.length > 0) return existingAssertions;
    if (benchmarkData?.expectedValue) {
      return [
        {
          expectedValue: benchmarkData.expectedValue as string,
          matchMode: (benchmarkData.matchMode as string) || "contains",
        },
      ];
    }
    return [];
  }, [benchmark]);

  const operator = (benchmark as Record<string, unknown>)?.assertionOperator as string || "AND";

  if (!benchmark) return null;

  return (
    <div className={styles['container']}>
      {/* -- Tab Bar ---------------------------------------- */}
      <TabBarComponent
        tabs={[
          {
            key: "general",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>🛠︎</span>,
            tooltip: "General",
            badge: selectedModels.length + agentInstances.length,
            badgeDisabled: selectedModels.length + agentInstances.length === 0,
          },
          {
            key: "history",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>📜</span>,
            tooltip: "Run History",
            badge: runHistory.length,
            badgeDisabled: runHistory.length === 0,
          },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ════════════════════════════════════════════════════
          TAB: General — Models, Agents, Assertions, Prompt
          ════════════════════════════════════════════════════ */}
      {activeTab === "general" && (
        <div className={styles['tab-content']}>
          {/* -- Assertions -------------------------------- */}
          {assertions.length > 0 && (
            <div className={styles['assertions-section']}>
              <div className={styles['section-label']}>
                <ListChecks size={12} />
                Assertions
              </div>
              <div className={styles['assertions-list']}>
                {assertions.map((assertion: BenchmarkAssertion, assertionIndex: number) => (
                  <div key={assertionIndex} className={styles['assertion-row']}>
                    {assertionIndex > 0 && (
                      <BadgeComponent
                        variant={operator === "OR" ? "warning" : "info"}
                      >
                        {operator}
                      </BadgeComponent>
                    )}
                    <BadgeComponent variant="accent">
                      {assertion.matchMode || "contains"}
                    </BadgeComponent>
                    <span
                      className={styles['assertion-value']}
                      title={assertion.expectedValue}
                    >
                      {assertion.expectedValue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -- Prompt Preview ---------------------------- */}
          {((benchmark as Record<string, unknown>)?.prompt || (benchmark as Record<string, unknown>)?.systemPrompt) && (
            <div className={styles['prompt-section']}>
              <ChatPreviewComponent
                systemPrompt={(benchmark as Record<string, unknown>)?.systemPrompt as string | undefined}
                messages={[{ role: "user" as const, content: ((benchmark as Record<string, unknown>)?.prompt as string) || "" }]}
                mini
              />
            </div>
          )}

          {/* -- Model Selection --------------------------- */}
          <div className={styles['models-section']}>
            <div className={styles['section-label']}>
              <Cpu size={12} />
              Models
              <span className={styles['model-count-badge']}>
                {selectedModels.length}
              </span>
            </div>

            {/* Selected model cards */}
            {selectedModels.length > 0 ? (
              <div className={styles['model-cards']}>
                {selectedModels.map((modelInstance: ModelOptionWithProvider) => {
                  const isThinking = !!thinkingMap[modelInstance.instanceId];
                  const isTools = !!toolsMap[modelInstance.instanceId];
                  const supportsThinking = !!modelInstance.thinking;
                  const dupeCount = selectedModels.filter(
                    (otherModel: ModelOptionWithProvider) => otherModel.provider === modelInstance.provider && otherModel.name === modelInstance.name,
                  ).length;
                  return (
                    <ModelCardComponent
                      key={modelInstance.instanceId}
                      model={modelInstance}
                      dupeCount={dupeCount}
                      isThinking={isThinking}
                      supportsThinking={supportsThinking}
                      isTools={isTools}
                      config={config}
                      onRemove={onRemoveModel}
                      onChangeModel={onChangeModel}
                      onToggleThinking={onToggleThinking}
                      onToggleTools={onToggleTools}
                    />
                  );
                })}
              </div>
            ) : (
              <div className={styles['empty-models']}>
                Use the model picker above to select models
              </div>
            )}

            {/* Agent instance cards + Clear all */}
            {(selectedModels.length > 0 || agentInstances.length > 0) && (
              <>
                {agentInstances.length > 0 && (
                  <div className={styles['model-cards']}>
                    {agentInstances.map((agentInstance: AgentInstance) => {
                      const isThinking = !!thinkingMap[agentInstance.instanceId];
                      const currentModelDef = allModels.find(
                        (modelDef: ModelOptionWithProvider) =>
                          modelDef.provider === agentInstance.provider && modelDef.name === agentInstance.modelName,
                      );
                      const supportsThinking =
                        currentModelDef?.thinking ||
                        (currentModelDef?.tools || []).includes("Thinking");
                      return (
                        <AgentCardComponent
                          key={agentInstance.instanceId}
                          agent={agentInstance}
                          isThinking={isThinking}
                          supportsThinking={supportsThinking}
                          config={config}
                          onRemove={onRemoveAgent}
                          onChangeModel={onChangeAgentModel}
                          onToggleThinking={onToggleThinking}
                        />
                      );
                    })}
                  </div>
                )}
                <div className={styles['model-actions']}>
                  <button
                    className={styles['clear-models-button']}
                    onClick={onClearSelection}
                  >
                    Clear all
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: Run History
          ════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className={styles['tab-content']}>
          {/* -- Running Banner ---------------------------- */}
          {running && (
            <div className={styles['running-banner']}>
              <Loader2 size={14} className={styles['spin-icon']} />
              Running…{" "}
              {streamingCompleted > 0 ? `${streamingCompleted} done` : ""}
            </div>
          )}

          {/* -- Run History List -------------------------- */}
          <div className={styles['list']}>
            {runHistory.length === 0 ? (
              <div className={styles['empty']}>
                <Clock size={14} />
                No runs yet
              </div>
            ) : (
              runHistory.map((run: BenchmarkRun, index: number) => {
                const isActive = activeRunId === run.id;
                const totalCost =
                  run.summary?.totalCost ??
                  run.models?.reduce(
                    (sum: number, result: BenchmarkRunResult) => sum + (result.estimatedCost || 0),
                    0,
                  ) ??
                  0;

                return (
                  <div
                    key={run.id}
                    className={`${styles['run-item']} ${isActive ? styles['run-item-active'] : ""} ${run.aborted ? styles['run-item-aborted'] : ""}`}
                    {...(SoundService.interactive(() => onViewRun?.(run)) as Record<string, unknown>)}
                    data-panel-close
                  >
                    <div className={styles['run-item-header']}>
                      <BadgeComponent type="dateTime" date={run.completedAt} />
                      <BadgeComponent type="cost" cost={totalCost} mini />
                      <span className={styles['run-index']}>
                        #{runHistory.length - index}
                      </span>
                      {run.aborted && (
                        <AlertTriangle
                          size={11}
                          style={{
                            color: "var(--color-warning)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                    <div className={styles['run-stats']}>
                      <span className={styles['stat-passed']}>
                        <CheckCircle2 size={10} />
                        {run.summary?.passed ?? 0}
                      </span>
                      <span className={styles['stat-failed']}>
                        <XCircle size={10} />
                        {(run.summary?.failed ?? 0) + (run.summary?.errored ?? 0)}
                      </span>
                      <BenchmarkBarComponent
                        passed={run.summary?.passed ?? 0}
                        total={run.summary?.total ?? 0}
                        mini
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
