"use client";

import styles from "./AboutPageComponent.module.css";

interface ResearchPaper {
  title: string;
  authors: string;
  year: number | null;
  arxivUrl: string | null;
  description: string;
  implementationFile: string;
  categoryLabel: string;
  badgeClass: string;
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
          "Monte Carlo Tree Search adapted for LLM agents. Uses UCB1 selection, expansion, simulation, and backpropagation to systematically explore the solution space across multiple sub-agents.",
        implementationFile: "MCTSRouter.ts",
        categoryLabel: "Tree Search",
        badgeClass: "badge-tree-search",
      },
      {
        title: "Divide and Conquer: Task Decomposition for Multi-Agent Systems",
        authors: "Decomposition Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Hierarchical task decomposition where a coordinator breaks a complex task into independent sub-tasks, dispatches each to a specialized sub-agent, then reassembles the results.",
        implementationFile: "DivideAndConquerRouter.ts",
        categoryLabel: "Task Decomposition",
        badgeClass: "badge-task-decomposition",
      },
      {
        title: "Actor-Critic: Iterative Refinement via Critic Feedback",
        authors: "Refinement Pattern",
        year: null,
        arxivUrl: null,
        description:
          "An actor sub-agent produces work, then a critic evaluates it and provides structured feedback. The loop repeats until the critic approves or a maximum iteration count is reached.",
        implementationFile: "CriticLoopRouter.ts",
        categoryLabel: "Iterative Refinement",
        badgeClass: "badge-iterative-refinement",
      },
      {
        title: "Tournament Selection: Best-of-N with Judge Pass",
        authors: "Selection Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Multiple sub-agents solve the same task independently in parallel. A judge agent then evaluates all outputs on correctness, completeness, and quality, selecting the single best result verbatim.",
        implementationFile: "TournamentRouter.ts",
        categoryLabel: "Selection",
        badgeClass: "badge-selection",
      },
      {
        title: "Hierarchical Aggregation: GoT-Style Multi-Agent Synthesis",
        authors: "Synthesis Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Parallel execution followed by a synthesis pass that merges outputs from multiple sub-agents into a single unified result — identifying agreements, conflicts, and complementary information.",
        implementationFile: "HierarchicalAggregationRouter.ts",
        categoryLabel: "Synthesis",
        badgeClass: "badge-synthesis",
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

export default function AboutPageComponent() {
  let globalCardIndex = 0;

  return (
    <div className={styles["about-page-container"]}>
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
    </div>
  );
}

function PaperCard({
  paper,
  entranceDelayMilliseconds,
}: {
  paper: ResearchPaper;
  entranceDelayMilliseconds: number;
}) {
  return (
    <article
      className={styles["paper-card"]}
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
      <div className={styles["implementation-badge"]}>
        <span className={styles["implementation-icon"]}>📄</span>
        {paper.implementationFile}
      </div>
    </article>
  );
}
