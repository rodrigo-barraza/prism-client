"use client";

import Link from "next/link";
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
    title: "Thought Structures",
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
        title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
        authors: "Wei et al.",
        year: 2022,
        arxivUrl: "https://arxiv.org/abs/2201.11903",
        description:
          "Single-pass sequential reasoning per iteration. The agent reasons, selects tool calls, observes results, and iterates — one step at a time. The default and most efficient thought structure, with each iteration's output feeding the next in a single sequential chain.",
        implementationFile: "ReActHarness.ts",
        categoryLabel: "Sequential Reasoning",
        badgeClass: "badge-sequential-reasoning",
        alignment: [
          { component: "Linear reasoning chain", status: "aligned", detail: "Each iteration produces one reasoning step that feeds the next — a sequential chain with no branching, matching CoT's linear decomposition" },
          { component: "Single-pass generation", status: "aligned", detail: "One LLM call per iteration — no branching or parallel exploration" },
          { component: "Execution pattern (ReAct)", status: "aligned", detail: "The tool-use loop follows the ReAct pattern (Yao et al. 2022): interleaved reasoning traces with actions and observations" },
          { component: "Few-shot exemplars (paper)", status: "simplified", detail: "Not implemented — the paper injects step-by-step exemplar chains into the prompt; this relies on the model's native reasoning" },
        ],
      },
      {
        title: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models",
        authors: "Yao et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.10601",
        description:
          "Parallel branching strategy that explores multiple reasoning paths simultaneously, scores each branch against evaluation criteria, then selects the highest-scoring trajectory to continue.",
        implementationFile: "TreeOfThoughtsStrategy.ts",
        categoryLabel: "Thought Structure",
        badgeClass: "badge-thought-structure",
        alignment: [
          { component: "Thought generation", status: "aligned", detail: "Generates N parallel branches with structured diversity descriptors — maps to the paper's thought generator G(pθ, s, k)" },
          { component: "Deliberate evaluation", status: "extended", detail: "Uses a fixed 4-criteria weighted rubric (correctness×0.4 + risk×0.25 + efficiency×0.15 + completeness×0.2) — paper uses categorical heuristics" },
          { component: "BFS search", status: "aligned", detail: "BFS generates N branches in parallel, retains top-b as frontier candidates — mirrors the paper's 'b best states' (Algorithm 1)" },
          { component: "DFS search", status: "aligned", detail: "DFS explores siblings sequentially with value-threshold pruning — mirrors the paper's depth-first pruning (Algorithm 2)" },
          { component: "Proactive backtracking", status: "aligned", detail: "Value-threshold pruning before tool execution — matches the paper's state evaluator V(s) pruning" },
          { component: "Reactive backtracking", status: "extended", detail: "Validation-triggered backtracking with Reflexion-style self-correction prompts (Shinn et al. 2023) — paper does not include post-execution validation" },
          { component: "Sandbox checkpointing", status: "extended", detail: "Git-based filesystem state capture and rollback on backtrack — novel engineering, not in paper" },
        ],
      },
      {
        title: "Graph of Thoughts: Solving Elaborate Problems with Large Language Models",
        authors: "Besta et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2308.09687",
        description:
          "Extends Tree of Thoughts into a directed acyclic graph where branches can merge, aggregate, and synthesize — enabling complex multi-path reasoning with GoT-style aggregation passes.",
        implementationFile: "GraphOfThoughtsStrategy.ts",
        categoryLabel: "Thought Structure",
        badgeClass: "badge-thought-structure",
        alignment: [
          { component: "Thought generation", status: "aligned", detail: "Generates N parallel branches with structured diversity descriptors — maps to the paper's Generate operation" },
          { component: "Aggregation / synthesis", status: "aligned", detail: "Synthesis pass merges best aspects of all branches — the core GoT differentiator, directly mapping to the paper's Aggregate operation" },
          { component: "Graph structure (DAG)", status: "simplified", detail: "Not implemented — paper defines thoughts as a DAG with typed transformations; implementation is branch → score → synthesize per iteration" },
          { component: "Typed operations (paper)", status: "simplified", detail: "Not implemented — paper defines Generate, Aggregate, Refine, Score as explicit graph operations; these are bundled implicitly in the loop" },
        ],
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
    icon: "🔀",
    papers: [
      {
        title: "Mixture-of-Agents Enhances Large Language Model Capabilities",
        authors: "Wang et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2406.04692",
        description:
          "Multi-layer Mixture-of-Agents architecture where proposer agents run in parallel, then an aggregator LLM synthesizes all outputs into a unified result. Supports configurable layer stacking for iterative refinement — each layer's synthesis feeds the next as context.",
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
        title: "Large Language Monkeys: Scaling Inference Compute with Repeated Sampling",
        authors: "Brown et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2407.21787",
        description:
          "Best-of-N selection where multiple sub-agents solve the same task independently in parallel, then an LLM judge evaluates all outputs and selects the single best result. Optionally runs automated verification (tsc, tests) on each candidate before judging.",
        implementationFile: "TournamentRouter.ts",
        categoryLabel: "Selection",
        badgeClass: "badge-selection",
        alignment: [
          { component: "Repeated sampling", status: "aligned", detail: "Fan-out N sub-agents in parallel" },
          { component: "Verification", status: "aligned", detail: "Automated verifiers (tsc, tests) run on each candidate when enabled; falls back to LLM judge" },
          { component: "Coverage scaling", status: "aligned", detail: "Theoretical finding — N/A for implementation" },
          { component: "Selection", status: "aligned", detail: "Judge selects best result verbatim, informed by verification outcomes" },
        ],
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        authors: "Madaan et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2303.17651",
        description:
          "Iterative actor→critic refinement loop where actor agent(s) produce output and critic agent(s) evaluate with structured improvement instructions. Supports solo, council, and jury critic modes with degeneration-of-thought detection and stateful session continuity.",
        implementationFile: "CriticLoopRouter.ts",
        categoryLabel: "Iterative Refinement",
        badgeClass: "badge-iterative-refinement",
        alignment: [
          { component: "Generate (initial output)", status: "aligned", detail: "Actor agent produces initial output" },
          { component: "Feedback (critic)", status: "extended", detail: "Separate critic agent(s), not same-LLM self-critique" },
          { component: "Refine (incorporate)", status: "aligned", detail: "Actor continues with aggregated critic feedback" },
          { component: "Iterative loop", status: "aligned", detail: "Loops until unanimous PASS or maxRounds" },
          { component: "Council / Jury modes", status: "extended", detail: "Original extensions beyond paper scope — multiple critics with consensus gating" },
        ],
      },
      {
        title: "Improving Factuality and Reasoning through Multi-Agent Debate",
        authors: "Du et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.14325",
        description:
          "Stateful peer-to-peer mesh where agents take turns on a shared discussion board. Each agent preserves session state across turns, seeing all prior messages from every other agent. Includes stall detection and git-based worktree merges for collaborative file editing.",
        implementationFile: "PeerToPeerRouter.ts",
        categoryLabel: "Multi-Agent Debate",
        badgeClass: "badge-multi-agent-debate",
        alignment: [
          { component: "Multiple agents", status: "aligned", detail: "Multiple agents with configurable models/prompts" },
          { component: "Multi-round debate", status: "aligned", detail: "Turn-based mesh with shared discussion thread" },
          { component: "Convergence", status: "aligned", detail: "Stall detection terminates early when agents stop contributing" },
          { component: "Symmetric design", status: "aligned", detail: "All agents are equal participants in the mesh" },
          { component: "Stateful sessions", status: "extended", detail: "Stateful session reuse via continueSubAgent — paper uses stateless agents" },
          { component: "Worktree merging", status: "extended", detail: "Agents can edit files and see each other's edits — novel engineering" },
        ],
      },
      {
        title: "Recursive Decomposition with Dependencies for Generic Divide-and-Conquer Reasoning",
        authors: "Boussioux et al.",
        year: 2025,
        arxivUrl: "https://arxiv.org/abs/2505.02576",
        description:
          "Recursive decompose→solve→merge framework where the LLM planner breaks complex tasks into subtasks with dependency ordering. Subtasks are grouped into execution tiers via topological sort — each tier runs in parallel, with a final synthesis merge.",
        implementationFile: "DivideAndConquerRouter.ts",
        categoryLabel: "Task Decomposition",
        badgeClass: "badge-task-decomposition",
        alignment: [
          { component: "Recursive decomposition", status: "aligned", detail: "LLM planner decomposes task into subtasks" },
          { component: "Dependency DAG", status: "aligned", detail: "Planner outputs dependsOn indices; topological sort groups into tiers" },
          { component: "Sub-task execution", status: "aligned", detail: "Each subtask dispatched to a sub-agent (tier-parallel)" },
          { component: "Recomposition", status: "aligned", detail: "Synthesis pass merges all subtask results" },
          { component: "Recursive depth", status: "aligned", detail: "Subtasks exceeding complexity threshold are recursively decomposed (configurable depth, max 3)" },
        ],
      },
      {
        title: "Language Agent Tree Search (LATS)",
        authors: "Zhou et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2310.04406",
        description:
          "True Monte Carlo Tree Search with UCB1-guided node selection. Each iteration selects the most promising unexpanded leaf via recursive UCB1 traversal, expands it into parallel branches, evaluates with an LLM judge, and backpropagates scores up the ancestor chain.",
        implementationFile: "MCTSRouter.ts",
        categoryLabel: "Tree Search",
        badgeClass: "badge-tree-search",
        alignment: [
          { component: "Selection (UCB1)", status: "aligned", detail: "Recursive UCB1 tree walk selects most promising unexpanded leaf" },
          { component: "Expansion", status: "aligned", detail: "Spawns branchFactor sub-agents in parallel from selected leaf" },
          { component: "Evaluation", status: "aligned", detail: "LLM judge scores branches on correctness/completeness/quality with per-branch feedback" },
          { component: "Simulation (rollout)", status: "aligned", detail: "LATS paper replaces classical rollouts with LLM value-function evaluation — implemented as specified" },
          { component: "Backpropagation", status: "aligned", detail: "Running-average V(s) update along parent chain after each expansion" },
          { component: "Tree structure", status: "aligned", detail: "Full tree maintained with UCB1-guided re-visitation of unexplored siblings" },
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
        title: "Memory Extraction: CC-Style 4-Type Taxonomy",
        authors: "Memory Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Post-conversation memory extraction using a 4-type taxonomy (user, feedback, project, reference) with explicit negative constraints preventing storage of code-derivable information. Includes mutual exclusion with explicit save_memory tool calls.",
        implementationFile: "MemoryExtractor.ts",
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
      {
        title: "Somatic State Engine: Plutchik's Wheel of Emotions",
        authors: "Affect Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Continuous emotional state machine based on Plutchik's 8 primary emotions with dyad detection, opposite suppression, personality-driven decay rates, emotional inertia, and baseline pull — enabling affective computing in agent interactions.",
        implementationFile: "EmotionalStateEngine.ts",
        categoryLabel: "Affect",
        badgeClass: "badge-affect",
      },
      {
        title: "Conversation Embedding: Cross-Session Semantic Search",
        authors: "Search Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Generates and persists summary embeddings on agent conversation documents by combining titles, compaction summaries, and linked memories — enabling cross-session semantic search with zero additional LLM cost.",
        implementationFile: "ConversationEmbeddingService.ts",
        categoryLabel: "Semantic Search",
        badgeClass: "badge-semantic-search",
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
          and thought structures — from single-agent ReAct loops to multi-agent
          coordination patterns. For detailed sub-agent topology documentation, see the{" "}
          <Link href="/topologies" className={styles["hero-cross-reference-link"]}>Topologies</Link> page.
        </p>
      </section>

      {/* ── Category Sections ─────────────────────────────────── */}
      {PAPER_CATEGORIES.map((category) => (
        <section key={category.title} className={styles["category-section"]}>
          <div className={styles["category-header"]}>
            <div className={styles["category-icon"]}>{category.icon}</div>
            <h2 className={styles["category-title"]}>{category.title}</h2>
            <span className={styles["category-count"]}>{category.papers.length}</span>
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
