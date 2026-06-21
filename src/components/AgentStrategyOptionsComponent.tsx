"use client";

import TopologyGraphComponent from "./TopologyGraphComponent";
import styles from "./AgentStrategyOptionsComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   AgentStrategyOptionsComponent — Shared select options for topology
   and thought structure, with rich tooltips and topology graphs.

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
      label: "Sequential Pipeline (SP)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Sequential Pipeline (SP)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute one at a time. Each receives the
            previous agent&apos;s output as context, forming a chain.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [A] → [B] → [C] serial accumulation
          </code>
          <TopologyGraphComponent topologyId="sequential" />
        </div>
      ),
    },
    {
      value: "hierarchical",
      label: "Hierarchical Parallel (HP)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Hierarchical Parallel (HP)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute in parallel. The orchestrator
            selects the best result. Branches never merge.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [A] [B] [C] → return all
          </code>
          <TopologyGraphComponent topologyId="hierarchical" />
        </div>
      ),
    },
    {
      value: "hierarchical_aggregation",
      label: "Hierarchical Aggregation (MoA)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Hierarchical Aggregation (MoA)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute in parallel, then a synthesis pass
            merges all outputs into a unified result.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [A] [B] [C] → [Σ] merge
          </code>
          <TopologyGraphComponent topologyId="hierarchical_aggregation" />
        </div>
      ),
    },
    {
      value: "peer_to_peer",
      label: "Peer-to-Peer Mesh (MAD)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Peer-to-Peer Mesh (MAD)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Agents communicate laterally in a turn-based
            discussion. Each agent sees all prior messages from
            every other agent.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [A] ↔ [B] ↔ [C] round-robin shared board
          </code>
          <TopologyGraphComponent topologyId="peer_to_peer" />
        </div>
      ),
    },
    {
      value: "tournament",
      label: "Tournament (BoN)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Tournament (BoN)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Sub-agents execute in parallel, then a judge evaluates
            all outputs and selects the single best result.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [A] [B] [C] → [Judge] pick best
          </code>
          <TopologyGraphComponent topologyId="tournament" />
        </div>
      ),
    },
    {
      value: "critic_loop",
      label: "Critic Loop (MAR)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Critic Loop (MAR)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Actor produces output, critic evaluates and provides
            feedback. Iterates until the critic approves or max
            rounds reached.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [Actor] → [Critic] → [Actor] → … until pass
          </code>
          <TopologyGraphComponent topologyId="critic_loop" />
        </div>
      ),
    },
    {
      value: "divide_and_conquer",
      label: "Divide & Conquer (GoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Divide & Conquer (GoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            A planner decomposes the task into independent subtasks,
            each dispatched to a sub-agent in parallel, then
            synthesized into a unified result.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [Planner] → [T₁] [T₂] [T₃] → [Synth] → Result
          </code>
          <TopologyGraphComponent topologyId="divide_and_conquer" />
        </div>
      ),
    },
    {
      value: "mcts",
      label: "MCTS Search (LATS)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>MCTS-Guided Search (LATS)</span>
          <p className={styles["strategy-tooltip-description"]}>
            Monte Carlo Tree Search. Expands N branches in parallel,
            evaluates and scores each, selects the best, and refines
            iteratively until the solution is complete.
          </p>
          <code className={styles["strategy-tooltip-structure"]}>
            [B₁ B₂ B₃] → [Eval] → [Best] → [B₁&apos; B₂&apos;] → [Eval] → …
          </code>
          <TopologyGraphComponent topologyId="mcts" />
        </div>
      ),
    },
  ];
}

export function buildThoughtStructureOptions(): StrategySelectOption[] {
  return [
    {
      value: "chain_of_thought",
      label: "Chain of Thought (CoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Chain of Thought (CoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            A linear <strong>chain</strong> of reasoning steps — the agent
            reasons, acts, observes, and iterates one step at a time.
            Each iteration feeds the next sequentially, with no
            branching or parallel exploration. Default and most
            efficient strategy.
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
            A <strong>tree</strong> of reasoning branches — generates
            N parallel paths per iteration, scores each on multiple
            criteria, selects the best, and backtracks with
            self-correction on validation failure. Explores
            alternatives, then prunes to a single winner.
          </p>
          <TopologyGraphComponent topologyId="tree_of_thoughts" />
        </div>
      ),
    },
    {
      value: "graph_of_thoughts",
      label: "Graph of Thoughts (GoT)",
      tooltipRich: true,
      tooltip: (
        <div>
          <span className={styles["strategy-tooltip-title"]}>Graph of Thoughts (GoT)</span>
          <p className={styles["strategy-tooltip-description"]}>
            A <strong>graph</strong> of reasoning branches — generates
            N parallel paths, scores them, then synthesizes the
            best aspects of all branches into a single merged
            response. Unlike ToT which selects one winner, GoT
            merges complementary strengths from every branch.
          </p>
          <TopologyGraphComponent topologyId="graph_of_thoughts" />
        </div>
      ),
    },
  ];
}
