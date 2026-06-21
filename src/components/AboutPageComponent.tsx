"use client";

import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./AboutPageComponent.module.css";

interface AlignmentEntry {
  component: string;
  status: "aligned" | "simplified" | "extended";
  detail: string;
}

interface ResearchPaper {
  title: string;
  authors: string;
  year: number | null;
  arxivUrl: string | null;
  description: string;
  implementationFile: string;
  categoryLabel: string;
  badgeClass: string;
  alignment?: AlignmentEntry[];
}

interface PaperCategory {
  title: string;
  icon: string;
  papers: ResearchPaper[];
}

const PAPER_CATEGORIES: PaperCategory[] = [
  {
    title: "Reasoning Strategies",
    icon: "🧠",
    papers: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        authors: "Yao et al.",
        year: 2022,
        arxivUrl: "https://arxiv.org/abs/2210.03629",
        description:
          "The foundational Reason→Act→Observe tool-use loop that powers the core agentic harness. Interleaves chain-of-thought reasoning with action execution and observation grounding.",
        implementationFile: "ReActHarness.ts",
        categoryLabel: "Core Harness",
        badgeClass: "badge-core-harness",
      },
      {
        title: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models",
        authors: "Yao et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.10601",
        description:
          "Parallel branching strategy that explores multiple reasoning paths simultaneously, scores each branch against evaluation criteria, then selects the highest-scoring trajectory to continue.",
        implementationFile: "TreeOfThoughtsStrategy.ts",
        categoryLabel: "Reasoning Strategy",
        badgeClass: "badge-reasoning-strategy",
      },
      {
        title: "Graph of Thoughts: Solving Elaborate Problems with Large Language Models",
        authors: "Besta et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2308.09687",
        description:
          "Extends Tree of Thoughts into a directed acyclic graph where branches can merge, aggregate, and synthesize — enabling complex multi-path reasoning with GoT-style aggregation passes.",
        implementationFile: "GraphOfThoughtsStrategy.ts",
        categoryLabel: "Reasoning Strategy",
        badgeClass: "badge-reasoning-strategy",
      },
      {
        title: "Reflexion: Language Agents with Verbal Reinforcement Learning",
        authors: "Shinn et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2303.11366",
        description:
          "Self-correction via verbal reflection. When a branch fails validation, the system restores a checkpoint and injects a reflexion prompt describing what went wrong for self-corrective retry.",
        implementationFile: "TreeOfThoughtsStrategy.ts",
        categoryLabel: "Self-Correction",
        badgeClass: "badge-self-correction",
      },
    ],
  },
  {
    title: "Multi-Agent Topologies",
    icon: "🔗",
    papers: [
      {
        title: "Language Agent Tree Search (LATS)",
        authors: "Zhou et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2310.04406",
        description:
          "Iterative expand-evaluate-refine search inspired by MCTS. Uses UCB1 selection to balance exploration vs exploitation, LLM evaluation with backpropagation, and evaluator feedback to refine the best branch at each depth level.",
        implementationFile: "MCTSRouter.ts",
        categoryLabel: "Tree Search",
        badgeClass: "badge-tree-search",
        alignment: [
          { component: "Selection (UCB1)", status: "aligned", detail: "UCT formula with configurable exploration weight" },
          { component: "Expansion", status: "aligned", detail: "Spawns branchFactor sub-agents in parallel" },
          { component: "Evaluation", status: "aligned", detail: "LLM judge scores branches on correctness/completeness/quality" },
          { component: "Simulation (rollout)", status: "simplified", detail: "Not implemented — evaluates immediately after expansion" },
          { component: "Backpropagation", status: "aligned", detail: "Running-average V(s) update along parent chain" },
          { component: "Reflection", status: "aligned", detail: "Evaluator feedback fed into next depth's refinement prompt" },
          { component: "Tree structure", status: "simplified", detail: "Linear depth chain, not a branching tree with UCT traversal" },
        ],
      },
      {
        title: "Recursive Decomposition with Dependencies for Generic Divide-and-Conquer Reasoning",
        authors: "Boussioux et al.",
        year: 2025,
        arxivUrl: "https://arxiv.org/abs/2505.02576",
        description:
          "A recursive decompose→solve→merge framework where the LLM planner breaks complex tasks into subtasks with optional dependency ordering. Subtasks are grouped into execution tiers via topological sort — each tier runs in parallel, with dependent subtasks receiving prerequisite outputs as context.",
        implementationFile: "DivideAndConquerRouter.ts",
        categoryLabel: "Task Decomposition",
        badgeClass: "badge-task-decomposition",
        alignment: [
          { component: "Recursive decomposition", status: "aligned", detail: "LLM planner decomposes task into subtasks" },
          { component: "Dependency DAG", status: "aligned", detail: "Planner outputs dependsOn indices; topological sort groups into tiers" },
          { component: "Sub-task execution", status: "aligned", detail: "Each subtask dispatched to a sub-agent (tier-parallel)" },
          { component: "Recomposition", status: "aligned", detail: "Synthesis pass merges all subtask results" },
          { component: "Recursive depth", status: "simplified", detail: "Single-level decomposition only — no recursive sub-decomposition" },
        ],
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        authors: "Madaan et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2303.17651",
        description:
          "An iterative generate→feedback→refine loop where a critic evaluates the actor's output and provides structured improvement instructions. Extended here to multi-agent: separate actor and critic agents with stateful session continuity, degeneration-of-thought detection, and unanimous consensus gating.",
        implementationFile: "CriticLoopRouter.ts",
        categoryLabel: "Iterative Refinement",
        badgeClass: "badge-iterative-refinement",
        alignment: [
          { component: "Generate (initial output)", status: "aligned", detail: "Actor agent produces initial output" },
          { component: "Feedback (critic)", status: "extended", detail: "Separate critic agent(s), not same-LLM self-critique" },
          { component: "Refine (incorporate)", status: "aligned", detail: "Actor continues with aggregated critic feedback" },
          { component: "Iterative loop", status: "aligned", detail: "Loops until unanimous PASS or maxRounds" },
          { component: "Single-LLM (paper)", status: "extended", detail: "Extended to multi-agent: separate actor + critic roles/models" },
          { component: "Council / Jury modes", status: "extended", detail: "Original extensions beyond paper scope" },
        ],
      },
      {
        title: "Large Language Monkeys: Scaling Inference Compute with Repeated Sampling",
        authors: "Brown et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2407.21787",
        description:
          "Best-of-N selection where multiple sub-agents solve the same task independently in parallel, then an LLM judge evaluates all outputs and selects the single best result verbatim. Coverage scales log-linearly with sample count.",
        implementationFile: "TournamentRouter.ts",
        categoryLabel: "Selection",
        badgeClass: "badge-selection",
        alignment: [
          { component: "Repeated sampling", status: "aligned", detail: "Fan-out N sub-agents in parallel" },
          { component: "Verification", status: "simplified", detail: "LLM judge instead of automatic verifiers (unit tests, proofs)" },
          { component: "Coverage scaling", status: "aligned", detail: "Theoretical finding — N/A for implementation" },
          { component: "Selection", status: "aligned", detail: "Judge selects best result verbatim" },
        ],
      },
      {
        title: "Mixture-of-Agents Enhances Large Language Model Capabilities",
        authors: "Wang et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2406.04692",
        description:
          "A multi-layer architecture where each agent takes all outputs from the previous layer as auxiliary information. Supports configurable layer stacking (layerCount) for iterative refinement. Warns when all proposers share the same model, per the paper's diversity findings.",
        implementationFile: "HierarchicalAggregationRouter.ts",
        categoryLabel: "Synthesis",
        badgeClass: "badge-synthesis",
        alignment: [
          { component: "Layered architecture", status: "aligned", detail: "Multi-layer stacking via layerCount config" },
          { component: "Proposer/Aggregator roles", status: "aligned", detail: "Members are proposers, synthesis LLM is the aggregator" },
          { component: "Collaborativeness", status: "aligned", detail: "Aggregator sees all proposer outputs as auxiliary information" },
          { component: "Model diversity", status: "aligned", detail: "Warning logged when all proposers share same model" },
          { component: "Iterative refinement", status: "aligned", detail: "Each layer's synthesis feeds into next layer as context" },
        ],
      },
      {
        title: "Improving Factuality and Reasoning through Multi-Agent Debate",
        authors: "Du et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.14325",
        description:
          "Stateful peer-to-peer mesh where agents take turns on a shared discussion thread. Each agent preserves its session state across turns, with worktree merges enabling collaborative file editing.",
        implementationFile: "PeerToPeerRouter.ts",
        categoryLabel: "Multi-Agent Debate",
        badgeClass: "badge-multi-agent-debate",
        alignment: [
          { component: "Multiple agents", status: "aligned", detail: "Multiple agents with configurable models/prompts" },
          { component: "Multi-round debate", status: "aligned", detail: "Turn-based mesh with shared discussion thread" },
          { component: "Convergence", status: "aligned", detail: "Stall detection terminates early when agents stop contributing" },
          { component: "Symmetric design", status: "aligned", detail: "All agents are equal participants in the mesh" },
          { component: "Stateless agents", status: "extended", detail: "Stateful session reuse via continueSubAgent" },
          { component: "Worktree merging", status: "extended", detail: "Agents can edit files and see each other's edits" },
        ],
      },
    ],
  },
  {
    title: "Infrastructure & Safety",
    icon: "🛡️",
    papers: [
      {
        title: "Critic Gate: Multi-Model Safety Review",
        authors: "Safety Pattern",
        year: null,
        arxivUrl: null,
        description:
          "A lightweight second-opinion gate that uses a fast model to review high-risk (DANGER tier) tool calls before execution — catching catastrophic commands like rm -rf or DROP TABLE.",
        implementationFile: "CriticGate.ts",
        categoryLabel: "Safety",
        badgeClass: "badge-safety",
      },
      {
        title: "Auto-Approval Engine: Tiered Tool Permission System",
        authors: "Safety Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Deterministic three-tier permission system — AUTO (read-only), WRITE (file mutations), DANGER (shell execution) — with declarative policy evaluation and full-auto override support.",
        implementationFile: "AutoApprovalEngine.ts",
        categoryLabel: "Safety",
        badgeClass: "badge-safety",
      },
      {
        title: "Memory Consolidation: Embedding-Based Clustering and Dedup",
        authors: "Memory Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Periodic batch consolidation of agent memories using cosine similarity clustering, stale memory detection, and LLM-powered merge/delete decisions — preserving source attribution chains.",
        implementationFile: "MemoryConsolidationService.ts",
        categoryLabel: "Memory",
        badgeClass: "badge-memory",
      },
      {
        title: "Context Pressure Management: Adaptive Compaction",
        authors: "Context Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Pressure-gated micro-compaction and auto-compaction of conversation context to stay within model context windows while preserving critical reasoning history and tool results.",
        implementationFile: "CompactionService.ts",
        categoryLabel: "Context Management",
        badgeClass: "badge-context-management",
      },
      {
        title: "DAG-Based Workflow Orchestration",
        authors: "Workflow Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Topologically-sorted execution of multi-node workflows. Nodes can be text, image, audio, embedding, or agent-mode, with typed edges routing outputs between nodes.",
        implementationFile: "WorkflowExecutionService.ts",
        categoryLabel: "Workflow",
        badgeClass: "badge-workflow",
      },
      {
        title: "Vision-Language Harness: Live Streaming VLM Loop",
        authors: "Multimodal Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Extended ReAct harness with real-time webcam/screen frame injection. Captures rolling buffer of live frames and attaches them to each iteration for continuous visual grounding.",
        implementationFile: "VisionLanguageHarness.ts",
        categoryLabel: "Multimodal",
        badgeClass: "badge-multimodal",
      },
    ],
  },
];

const TOTAL_PAPER_COUNT = PAPER_CATEGORIES.reduce(
  (sum, category) => sum + category.papers.length,
  0,
);

const ACADEMIC_PAPER_COUNT = PAPER_CATEGORIES.reduce(
  (sum, category) =>
    sum + category.papers.filter((paper) => paper.arxivUrl !== null).length,
  0,
);

const CATEGORY_COUNT = PAPER_CATEGORIES.length;

const STATUS_INDICATORS: Record<AlignmentEntry["status"], { icon: string; label: string }> = {
  aligned: { icon: "✅", label: "Aligned" },
  simplified: { icon: "⚠️", label: "Simplified" },
  extended: { icon: "🔧", label: "Extended" },
};

function AlignmentTooltipContent({ alignment }: { alignment: AlignmentEntry[] }) {
  const alignedCount = alignment.filter((entry) => entry.status === "aligned").length;
  const simplifiedCount = alignment.filter((entry) => entry.status === "simplified").length;
  const extendedCount = alignment.filter((entry) => entry.status === "extended").length;

  return (
    <span className={styles["alignment-tooltip-container"]}>
      <span className={styles["alignment-tooltip-summary"]}>
        <span className={styles["alignment-summary-stat"]}>
          <span className={styles["alignment-stat-count"]} data-status="aligned">{alignedCount}</span>
          <span className={styles["alignment-stat-label"]}>Aligned</span>
        </span>
        {simplifiedCount > 0 && (
          <span className={styles["alignment-summary-stat"]}>
            <span className={styles["alignment-stat-count"]} data-status="simplified">{simplifiedCount}</span>
            <span className={styles["alignment-stat-label"]}>Simplified</span>
          </span>
        )}
        {extendedCount > 0 && (
          <span className={styles["alignment-summary-stat"]}>
            <span className={styles["alignment-stat-count"]} data-status="extended">{extendedCount}</span>
            <span className={styles["alignment-stat-label"]}>Extended</span>
          </span>
        )}
      </span>
      <span className={styles["alignment-tooltip-divider"]} />
      <span className={styles["alignment-tooltip-list"]}>
        {alignment.map((entry) => (
          <span
            key={entry.component}
            className={styles["alignment-tooltip-entry"]}
          >
            <span className={styles["alignment-entry-indicator"]}>
              {STATUS_INDICATORS[entry.status].icon}
            </span>
            <span className={styles["alignment-entry-body"]}>
              <span className={styles["alignment-entry-component"]}>
                {entry.component}
              </span>
              <span className={styles["alignment-entry-detail"]}>
                {entry.detail}
              </span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

export default function AboutPageComponent() {
  let globalCardIndex = 0;

  return (
    <article className={styles["about-page-container"]}>
      {/* ── Hero Section ──────────────────────────────────────── */}
      <section className={styles["hero-section"]}>
        <h1 className={styles["hero-title"]}>Research Implementations</h1>
        <p className={styles["hero-subtitle"]}>
          Prism implements state-of-the-art research from agentic AI, multi-agent systems,
          and reasoning strategies — from single-agent ReAct loops to multi-agent MCTS
          topologies. Here is every paper and pattern powering the system.
        </p>
      </section>

      {/* ── Category Sections ─────────────────────────────────── */}
      {PAPER_CATEGORIES.map((category) => (
        <section key={category.title} className={styles["category-section"]}>
          <div className={styles["category-header"]}>
            <div className={styles["category-icon"]}>{category.icon}</div>
            <h2 className={styles["category-title"]}>{category.title}</h2>
          </div>
          <div className={styles["category-divider"]} />
          <div className={styles["paper-card-grid"]}>
            {category.papers.map((paper) => {
              const cardIndex = globalCardIndex++;
              return (
                <PaperCard
                  key={paper.implementationFile + paper.title}
                  paper={paper}
                  entranceDelayMilliseconds={cardIndex * 60}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* ── Footer Stats ──────────────────────────────────────── */}
      <footer className={styles["footer-stats-section"]}>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{TOTAL_PAPER_COUNT}</span>
          <span className={styles["stat-label"]}>Implementations</span>
        </div>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{ACADEMIC_PAPER_COUNT}</span>
          <span className={styles["stat-label"]}>Academic Papers</span>
        </div>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{CATEGORY_COUNT}</span>
          <span className={styles["stat-label"]}>Categories</span>
        </div>
      </footer>
    </article>
  );
}

function PaperCard({
  paper,
  entranceDelayMilliseconds,
}: {
  paper: ResearchPaper;
  entranceDelayMilliseconds: number;
}) {
  const hasAlignment = paper.alignment && paper.alignment.length > 0;

  const cardContent = (
    <article
      className={`${styles["paper-card"]} ${hasAlignment ? styles["paper-card-has-alignment"] : ""}`}
      style={
        { "--card-entrance-delay": `${entranceDelayMilliseconds}ms` } as React.CSSProperties
      }
    >
      <div className={styles["card-header-row"]}>
        <h3 className={styles["paper-title"]}>
          {paper.arxivUrl ? (
            <a
              href={paper.arxivUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles["paper-title-link"]}
            >
              {paper.title}
              <span className={styles["external-link-icon"]}>↗</span>
            </a>
          ) : (
            paper.title
          )}
        </h3>
        <span
          className={`${styles["category-badge"]} ${styles[paper.badgeClass]}`}
        >
          {paper.categoryLabel}
        </span>
      </div>
      <p className={styles["paper-authors"]}>
        {paper.authors}
        {paper.year !== null && (
          <>
            {" · "}
            <span className={styles["paper-year"]}>{paper.year}</span>
          </>
        )}
      </p>
      <p className={styles["paper-description"]}>{paper.description}</p>
      <div className={styles["implementation-badge-row"]}>
        <div className={styles["implementation-badge"]}>
          <span className={styles["implementation-icon"]}>📄</span>
          {paper.implementationFile}
        </div>
        {hasAlignment && (
          <span className={styles["alignment-hint-badge"]}>
            Paper Alignment
          </span>
        )}
      </div>
    </article>
  );

  if (!hasAlignment) {
    return cardContent;
  }

  return (
    <TooltipComponent
      rich
      position="top"
      enterDelay={200}
      title="Paper ↔ Implementation Alignment"
      content={<AlignmentTooltipContent alignment={paper.alignment!} />}
    >
      {cardContent}
    </TooltipComponent>
  );
}
