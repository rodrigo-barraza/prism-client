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
          and reasoning strategies — from single-agent ReAct loops to multi-agent
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
