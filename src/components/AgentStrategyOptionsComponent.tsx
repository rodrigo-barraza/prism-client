"use client";

import TopologyGraphComponent from "./TopologyGraphComponent";
import styles from "./AgentStrategyOptionsComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   AgentStrategyOptionsComponent — Shared select options for topology
   and reasoning strategy, with rich tooltips and topology graphs.

   Used by both SettingsPageComponent (full settings) and
   SettingsPanelComponent (sidebar/panel overlay).
   ═══════════════════════════════════════════════════════════════════ */

interface StrategySelectOption {
  value: string;
  label: string;
  tooltipRich: boolean;
  tooltip: React.ReactNode;
}

export function buildTopologyOptions(): StrategySelectOption[] {
  return [
    {
      value: "sequential",
      label: "Sequential Pipeline (CoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Sequential Pipeline (CoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute one at a time. Each receives the
            previous agent&apos;s output as context, forming a chain.
          </p>
          <TopologyGraphComponent topologyId="sequential" />
        </div>
      ),
    },
    {
      value: "hierarchical",
      label: "Hierarchical Parallel (ToT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Hierarchical Parallel (ToT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute in parallel. The orchestrator
            selects the best result. Branches never merge.
          </p>
          <TopologyGraphComponent topologyId="hierarchical" />
        </div>
      ),
    },
    {
      value: "hierarchical_aggregation",
      label: "Hierarchical Aggregation (GoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Hierarchical Aggregation (GoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute in parallel, then a synthesis pass
            merges all outputs into a unified result.
          </p>
          <TopologyGraphComponent topologyId="hierarchical_aggregation" />
        </div>
      ),
    },
    {
      value: "peer_to_peer",
      label: "Peer-to-Peer Mesh (GoT DAG)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Peer-to-Peer Mesh (GoT DAG)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Agents communicate laterally in a turn-based
            discussion. Each agent sees all prior messages from
            every other agent.
          </p>
          <TopologyGraphComponent topologyId="peer_to_peer" />
        </div>
      ),
    },
  ];
}

export function buildReasoningStrategyOptions(): StrategySelectOption[] {
  return [
    {
      value: "chain_of_thought",
      label: "Chain of Thought (CoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Chain of Thought (CoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Single-pass sequential reasoning. The agent reasons,
            acts, observes results, and iterates — one step at a
            time. Default and most efficient strategy.
          </p>
          <TopologyGraphComponent topologyId="chain_of_thought" />
        </div>
      ),
    },
    {
      value: "tree_of_thoughts",
      label: "Tree of Thoughts (ToT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Tree of Thoughts (ToT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Generates N parallel reasoning branches per iteration,
            scores each on correctness/risk/efficiency/completeness,
            selects the best, and backtracks with reflexion on
            validation failure.
          </p>
          <TopologyGraphComponent topologyId="tree_of_thoughts" />
        </div>
      ),
    },
  ];
}
