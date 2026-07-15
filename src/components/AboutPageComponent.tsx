"use client";

import Link from "next/link";
import { ExternalLink, FileCode, FlaskConical } from "lucide-react";
import {
  PageHeroComponent,
  TooltipComponent,
} from "@rodrigo-barraza/components-library";
import AlignmentStatusIndicatorComponent from "./AlignmentStatusIndicatorComponent";
import {
  ACADEMIC_PAPER_COUNT,
  CATEGORY_COUNT,
  PAPER_CATEGORIES,
  TOTAL_PAPER_COUNT,
  type AlignmentEntry,
  type ResearchPaper,
} from "./AboutPageComponent.content";
import { TIMING } from "../constants";
import styles from "./AboutPageComponent.module.css";

const INLINE_ICON_SIZE = 13;
const CATEGORY_ICON_SIZE = 18;
const TOOLTIP_ENTER_DELAY_MILLISECONDS = 200;

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
            <AlignmentStatusIndicatorComponent
              status={entry.status}
              className={styles["alignment-entry-indicator"]}
            />
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
      <PageHeroComponent
        variant="display"
        icon={FlaskConical}
        title="Research Implementations"
        subtitle={
          <>
            Prism implements state-of-the-art research across agentic AI — from single-agent
            thought structures and multi-agent topologies to the harness-lifecycle, memory,
            and safety machinery that keeps long-running loops reliable. For detailed sub-agent
            topology documentation, see the{" "}
            <Link href="/topologies" className={styles["hero-cross-reference-link"]}>Topologies</Link> page.
          </>
        }
        stats={[
          { value: TOTAL_PAPER_COUNT, label: "implementations" },
          { value: ACADEMIC_PAPER_COUNT, label: "academic papers" },
          { value: CATEGORY_COUNT, label: "categories" },
        ]}
        className={styles["hero-section"]}
      />

      {/* ── Category Sections ─────────────────────────────────── */}
      {PAPER_CATEGORIES.map((category) => {
        const CategoryIcon = category.icon;
        return (
          <section key={category.title} className={styles["category-section"]}>
            <div className={styles["category-header"]}>
              <div className={styles["category-icon"]}>
                <CategoryIcon size={CATEGORY_ICON_SIZE} />
              </div>
              <h2 className={styles["category-title"]}>{category.title}</h2>
              <span className={styles["category-count"]}>{category.papers.length}</span>
            </div>
            <div className={styles["category-divider"]} />
            <div className={styles["paper-card-grid"]}>
              {category.papers.map((paper) => {
                const cardIndex = globalCardIndex++;
                const staggerIndex = Math.min(cardIndex, TIMING.ENTRANCE_STAGGER_MAX_INDEX);
                return (
                  <PaperCard
                    key={paper.implementationFile + paper.title}
                    paper={paper}
                    entranceDelayMilliseconds={staggerIndex * TIMING.ENTRANCE_STAGGER_MILLISECONDS}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
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
              <ExternalLink className={styles["external-link-icon"]} size={INLINE_ICON_SIZE} />
            </a>
          ) : (
            paper.title
          )}
        </h3>
        <span
          className={`${styles["category-badge"]} ${styles[`badge-tone-${paper.badgeTone}`]}`}
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
          <FileCode className={styles["implementation-icon"]} size={INLINE_ICON_SIZE} />
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
      enterDelay={TOOLTIP_ENTER_DELAY_MILLISECONDS}
      className={styles["card-tooltip-anchor"]}
      title="Paper ↔ Implementation Alignment"
      content={<AlignmentTooltipContent alignment={paper.alignment!} />}
    >
      {cardContent}
    </TooltipComponent>
  );
}
