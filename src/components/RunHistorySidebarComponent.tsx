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
import { BadgeComponent, TabBarComponent, DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";
import ChatPreviewComponent from "./ChatPreviewComponent";

import CostBadgeComponent from "./CostBadgeComponent";

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
export default function RunHistorySidebarComponent({
  // @ts-ignore
  // @ts-ignore
  benchmark: any,
  runHistory = [],
  // @ts-ignore
  // @ts-ignore
  activeRunId: any,
  // @ts-ignore
  // @ts-ignore
  onViewRun: any,
  running = false,
  streamingCompleted = 0,
  // Model selection props
  selectedModels = [],
  // @ts-ignore
  // @ts-ignore
  onRemoveModel: any,
  // @ts-ignore
  // @ts-ignore
  onChangeModel: any,
  // @ts-ignore
  // @ts-ignore
  onClearSelection: any,
  // Thinking toggle props
  thinkingMap = {},
  // @ts-ignore
  // @ts-ignore
  onToggleThinking: any,
  // Tools toggle props
  toolsMap = {},
  // @ts-ignore
  // @ts-ignore
  onToggleTools: any,
  // Agent instance props
  agentInstances = [],
  // @ts-ignore
  // @ts-ignore
  onRemoveAgent: any,
  // @ts-ignore
  // @ts-ignore
  onChangeAgentModel: any,
  allModels = [],
  // Config for ModelPickerPopoverComponent inside AgentCardComponent
  // @ts-ignore
  // @ts-ignore
  config: any,
}) {
  const [activeTab, setActiveTab] = useState<any>("general");

  // Normalize assertions: fall back to single expectedValue/matchMode for older benchmarks
  const assertions = useMemo<any>(() => {
    // @ts-ignore
    // @ts-ignore
    if (benchmark?.assertions?.length > 0) return benchmark.assertions;
    // @ts-ignore
    if (benchmark?.expectedValue) {
      // @ts-ignore
      // @ts-ignore
      return [{ expectedValue: benchmark.expectedValue, matchMode: benchmark.matchMode || "contains" }];
    }
    return [];
  // @ts-ignore
  }, [benchmark]);

  // @ts-ignore
  const operator = benchmark?.assertionOperator || "AND";

  // @ts-ignore
  if (!benchmark) return null;

  return (
    <div className={styles.container}>
      {/* -- Tab Bar ---------------------------------------- */}
      <TabBarComponent
        tabs={[
          {
            key: "general",
            icon: <Settings size={14} />,
            tooltip: "General",
            badge: selectedModels.length + agentInstances.length,
            badgeDisabled: (selectedModels.length + agentInstances.length) === 0,
          },
          {
            key: "history",
            icon: <History size={14} />,
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
        <div className={styles.tabContent}>
          {/* -- Assertions -------------------------------- */}
          {assertions.length > 0 && (
            <div className={styles.assertionsSection}>
              <div className={styles.sectionLabel}>
                <ListChecks size={12} />
                Assertions
              </div>
              <div className={styles.assertionsList}>
                {assertions.map((a: any, i: any) => (
                  <div key={i} className={styles.assertionRow}>
                    {i > 0 && (
                      <BadgeComponent
                        variant={operator === "OR" ? "warning" : "info"}
                      >
                        {operator}
                      </BadgeComponent>
                    )}
                    <BadgeComponent variant="accent">
                      {a.matchMode || "contains"}
                    </BadgeComponent>
                    <span className={styles.assertionValue} title={a.expectedValue}>
                      {a.expectedValue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -- Prompt Preview ---------------------------- */}
          // @ts-ignore
          {/* @ts-ignore */}
          {(benchmark.prompt || benchmark.systemPrompt) && (
            <div className={styles.promptSection}>
              {/* @ts-ignore */}
              <ChatPreviewComponent
                // @ts-ignore
                systemPrompt={benchmark.systemPrompt}
                messages={[
                  // @ts-ignore
                  { role: "user", content: benchmark.prompt },
                ]}
                mini
              />
            </div>
          )}

          {/* -- Model Selection --------------------------- */}
          <div className={styles.modelsSection}>
            <div className={styles.sectionLabel}>
              <Cpu size={12} />
              Models
              <span className={styles.modelCountBadge}>
                {selectedModels.length}
              </span>
            </div>

            {/* Selected model cards */}
            {selectedModels.length > 0 ? (
              <div className={styles.modelCards}>
                {selectedModels.map((m) => {
                  // @ts-ignore
                  // @ts-ignore
                  const isThinking = !!thinkingMap[m.instanceId];
                  // @ts-ignore
                  // @ts-ignore
                  const isTools = !!toolsMap[m.instanceId];
                  // @ts-ignore
                  const supportsThinking = !!m.thinking;
                  const dupeCount = selectedModels.filter(
                    // @ts-ignore
                    // @ts-ignore
                    // @ts-ignore
                    // @ts-ignore
                    (s) => s.provider === m.provider && s.name === m.name
                  ).length;
                  return (
                    <ModelCardComponent
                      // @ts-ignore
                      key={m.instanceId}
                      model={m}
                      dupeCount={dupeCount}
                      isThinking={isThinking}
                      supportsThinking={supportsThinking}
                      isTools={isTools}
                      // @ts-ignore
                      config={config}
                      // @ts-ignore
                      onRemove={onRemoveModel}
                      // @ts-ignore
                      onChangeModel={onChangeModel}
                      // @ts-ignore
                      onToggleThinking={onToggleThinking}
                      // @ts-ignore
                      onToggleTools={onToggleTools}
                    />
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyModels}>
                Use the model picker above to select models
              </div>
            )}

            {/* Agent instance cards + Clear all */}
            {(selectedModels.length > 0 || agentInstances.length > 0) && (
              <>
                {agentInstances.length > 0 && (
                  <div className={styles.modelCards}>
                    {agentInstances.map((a) => {
                      // @ts-ignore
                      // @ts-ignore
                      const isThinking = !!thinkingMap[a.instanceId];
                      const currentModelDef = allModels.find(
                        // @ts-ignore
                        // @ts-ignore
                        // @ts-ignore
                        // @ts-ignore
                        (m) => m.provider === a.provider && m.name === a.modelName
                      );
                      // @ts-ignore
                      // @ts-ignore
                      const supportsThinking = currentModelDef?.thinking || (currentModelDef?.tools || []).includes("Thinking");
                      return (
                        <AgentCardComponent
                          // @ts-ignore
                          key={a.instanceId}
                          agent={a}
                          isThinking={isThinking}
                          supportsThinking={supportsThinking}
                          // @ts-ignore
                          config={config}
                          // @ts-ignore
                          onRemove={onRemoveAgent}
                          // @ts-ignore
                          onChangeModel={onChangeAgentModel}
                          // @ts-ignore
                          onToggleThinking={onToggleThinking}
                        />
                      );
                    })}
                  </div>
                )}
                <div className={styles.modelActions}>
                  <button
                    className={styles.clearModelsBtn}
                    // @ts-ignore
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
        <div className={styles.tabContent}>
          {/* -- Running Banner ---------------------------- */}
          {running && (
            <div className={styles.runningBanner}>
              <Loader2 size={14} className={styles.spinIcon} />
              Running… {streamingCompleted > 0 ? `${streamingCompleted} done` : ""}
            </div>
          )}

          {/* -- Run History List -------------------------- */}
          <div className={styles.list}>
            {runHistory.length === 0 ? (
              <div className={styles.empty}>
                <Clock size={14} />
                No runs yet
              </div>
            ) : (
              runHistory.map((run, idx) => {
                // @ts-ignore
                // @ts-ignore
                const isActive = activeRunId === run.id;
                const totalCost =
                  // @ts-ignore
                  run.summary.totalCost ??
                  // @ts-ignore
                  run.models?.reduce((s: any, r: any) => s + (r.estimatedCost || 0), 0) ??
                  0;

                return (
                  <div
                    // @ts-ignore
                    key={run.id}
                    // @ts-ignore
                    className={`${styles.runItem} ${isActive ? styles.runItemActive : ""} ${run.aborted ? styles.runItemAborted : ""}`}
                    // @ts-ignore
                    // @ts-ignore
                    {...SoundService.interactive(() => onViewRun(run))}
                    data-panel-close
                  >
                    <div className={styles.runItemHeader}>
                      {/* @ts-ignore */}
                      <DateTimeBadgeComponent date={run.completedAt} mini />
                      <CostBadgeComponent cost={totalCost} mini />
                      <span className={styles.runIndex}>#{runHistory.length - idx}</span>
                      {/* @ts-ignore */}
                      {run.aborted && (
                        <AlertTriangle size={11} style={{ color: "var(--warning)", flexShrink: 0 }} />
                      )}
                    </div>
                    <div className={styles.runStats}>
                      <span className={styles.statPassed}>
                        <CheckCircle2 size={10} />
                        {/* @ts-ignore */}
                        {run.summary.passed}
                      </span>
                      <span className={styles.statFailed}>
                        <XCircle size={10} />
                        // @ts-ignore
                        {/* @ts-ignore */}
                        {run.summary.failed + (run.summary.errored || 0)}
                      </span>
                      {/* @ts-ignore */}
                      <BenchmarkBarComponent
                        // @ts-ignore
                        passed={run.summary.passed}
                        // @ts-ignore
                        total={run.summary.total}
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
