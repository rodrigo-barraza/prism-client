"use client";

import { useState, useEffect, useMemo } from "react";
import { LoadingStateComponent } from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import TopologyGraphComponent from "./TopologyGraphComponent";
import type {
  TopologyDefinition,
  TopologyAlignmentEntry,
  TopologyConfigOption,
} from "../types/types";
import styles from "./TopologiesPageComponent.module.css";

const STATUS_INDICATORS: Record<TopologyAlignmentEntry["status"], { icon: string; label: string }> = {
  aligned: { icon: "✅", label: "Aligned" },
  simplified: { icon: "⚠️", label: "Simplified" },
  extended: { icon: "🔧", label: "Extended" },
};

function TopologyAlignmentChecklist({ alignment }: { alignment: TopologyAlignmentEntry[] }) {
  return (
    <section className={styles["alignment-section"]}>
      <span className={styles["section-label"]}>Paper Alignment</span>
      <div className={styles["alignment-list"]}>
        {alignment.map((entry) => (
          <div
            key={entry.component}
            className={styles["alignment-entry"]}
          >
            <span className={styles["alignment-indicator"]}>
              {STATUS_INDICATORS[entry.status].icon}
            </span>
            <span className={styles["alignment-body"]}>
              <span className={styles["alignment-component-name"]}>
                {entry.component}
              </span>
              <span className={styles["alignment-detail-text"]}>
                {entry.detail}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopologyConfigTable({ configOptions }: { configOptions: TopologyConfigOption[] }) {
  return (
    <section className={styles["config-section"]}>
      <span className={styles["section-label"]}>Configuration Options</span>
      <div className={styles["config-table-wrapper"]}>
        <table className={styles["config-table"]}>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Type</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {configOptions.map((option) => (
              <tr key={option.name}>
                <td>
                  <span className={styles["config-name"]}>{option.name}</span>
                </td>
                <td>
                  <span className={styles["config-type-badge"]}>{option.type}</span>
                </td>
                <td>
                  <span className={styles["config-default"]}>{option.defaultValue}</span>
                </td>
                <td>{option.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopologyPhasesPipeline({ phases }: { phases: string[] }) {
  return (
    <section className={styles["phases-section"]}>
      <span className={styles["section-label"]}>Execution Phases</span>
      <div className={styles["phases-pipeline"]}>
        {phases.map((phase, phaseIndex) => (
          <span key={phase}>
            <span className={styles["phase-step"]}>{phase}</span>
            {phaseIndex < phases.length - 1 && (
              <span className={styles["phase-arrow"]}>→</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

function TopologyCard({
  topology,
  entranceDelayMilliseconds,
}: {
  topology: TopologyDefinition;
  entranceDelayMilliseconds: number;
}) {
  const hasAlignment = topology.alignment.length > 0;
  const hasConfigOptions = topology.configOptions.length > 0;
  const hasPhases = topology.phases.length > 0;
  const hasPaper = topology.paperTitle !== null;

  return (
    <article
      className={styles["topology-card"]}
      style={
        { "--card-entrance-delay": `${entranceDelayMilliseconds}ms` } as React.CSSProperties
      }
    >
      {/* Graph Column */}
      <div className={styles["topology-graph-column"]}>
        <div className={styles["topology-graph-wrapper"]}>
          <TopologyGraphComponent topologyId={topology.id} />
        </div>
        <code className={styles["flow-description-label"]}>
          {topology.flowDescription}
        </code>
      </div>

      {/* Content Column */}
      <div className={styles["topology-content-column"]}>
        {/* Header */}
        <div className={styles["topology-header-row"]}>
          <div className={styles["topology-title-group"]}>
            <h3 className={styles["topology-display-name"]}>
              {topology.displayName}
            </h3>
            <span className={styles["topology-abbreviation"]}>
              {topology.abbreviation}
            </span>
          </div>
          <div className={styles["topology-badge-group"]}>
            <span className={styles["category-badge"]}>
              {topology.categoryLabel}
            </span>
          </div>
        </div>

        {/* Paper Reference */}
        {hasPaper && (
          <div className={styles["paper-reference-row"]}>
            {topology.paperUrl ? (
              <a
                href={topology.paperUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles["paper-link"]}
              >
                {topology.paperTitle}
                <span className={styles["paper-external-icon"]}> ↗</span>
              </a>
            ) : (
              <span className={styles["paper-link"]}>{topology.paperTitle}</span>
            )}
            <span className={styles["paper-meta"]}>
              {topology.paperAuthors}
              {topology.paperYear !== null && (
                <>
                  {" · "}
                  <span className={styles["paper-year"]}>{topology.paperYear}</span>
                </>
              )}
            </span>
          </div>
        )}

        {/* Description */}
        <p className={styles["topology-description"]}>
          {topology.description}
        </p>

        {/* Phases */}
        {hasPhases && <TopologyPhasesPipeline phases={topology.phases} />}

        {/* Config Options */}
        {hasConfigOptions && <TopologyConfigTable configOptions={topology.configOptions} />}

        {/* Alignment */}
        {hasAlignment && <TopologyAlignmentChecklist alignment={topology.alignment} />}

        {/* Implementation File */}
        <div className={styles["implementation-badge"]}>
          <span className={styles["implementation-icon"]}>📄</span>
          {topology.implementationFile}
        </div>
      </div>
    </article>
  );
}

export default function TopologiesPageComponent() {
  const [topologies, setTopologies] = useState<TopologyDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    PrismService.getTopologies()
      .then((definitions) => {
        setTopologies(definitions);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to load topologies";
        setErrorMessage(message);
        setIsLoading(false);
      });
  }, []);

  const totalConfigOptions = useMemo(
    () => topologies.reduce((sum, topology) => sum + topology.configOptions.length, 0),
    [topologies],
  );

  const academicPaperCount = useMemo(
    () => topologies.filter((topology) => topology.paperUrl !== null).length,
    [topologies],
  );

  if (isLoading) {
    return (
      <article className={styles["topologies-page-container"]}>
        <div className={styles["loading-state-container"]}>
          <LoadingStateComponent message="Loading topologies…" />
        </div>
      </article>
    );
  }

  if (errorMessage) {
    return (
      <article className={styles["topologies-page-container"]}>
        <div className={styles["error-state-container"]}>
          <span>⚠️ {errorMessage}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={styles["topologies-page-container"]}>
      {/* Hero Section */}
      <section className={styles["hero-section"]}>
        <h1 className={styles["hero-title"]}>Sub-Agent Topologies</h1>
        <p className={styles["hero-subtitle"]}>
          Every multi-agent coordination topology available in the orchestrator.
          Each topology defines how sub-agents are spawned, communicate, and
          synthesize their results — from simple parallel fan-out to iterative
          MCTS-guided search.
        </p>
      </section>

      {/* Topology Cards */}
      <div className={styles["topology-card-list"]}>
        {topologies.map((topology, topologyIndex) => (
          <TopologyCard
            key={topology.id}
            topology={topology}
            entranceDelayMilliseconds={topologyIndex * 80}
          />
        ))}
      </div>

      {/* Footer Stats */}
      <footer className={styles["footer-stats-section"]}>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{topologies.length}</span>
          <span className={styles["stat-label"]}>Topologies</span>
        </div>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{academicPaperCount}</span>
          <span className={styles["stat-label"]}>Academic Papers</span>
        </div>
        <div className={styles["stat-item"]}>
          <span className={styles["stat-value"]}>{totalConfigOptions}</span>
          <span className={styles["stat-label"]}>Config Options</span>
        </div>
      </footer>
    </article>
  );
}
