"use client";

import {
  ListChecks,
  FileText,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Activity,
  Wrench,
  Repeat,
} from "lucide-react";
import { BadgeComponent } from "@rodrigo-barraza/components-library";
import ChatPreviewComponent from "./ChatPreviewComponent";
import {
  ASSERTION_TYPE_MAP,
  describeAgentAssertion,
  describeTextAssertion,
} from "../utils/benchmarkAssertions";
import type {
  AgentBenchmarkAssertion,
  BenchmarkAssertion,
} from "../types/types";
import styles from "./BenchmarkPreviewSidebarComponent.module.css";

/**
 * BenchmarkPreviewSidebarComponent — left sidebar for the benchmark create
 * page. Live-mirrors the form: name, validation checklist, assertion chips
 * (output + behavior), tool scope, execution settings, and prompt preview.
 */
interface BenchmarkFormPreviewState {
  name?: string;
  systemPrompt?: string;
  prompt?: string;
  assertions?: BenchmarkAssertion[];
  assertionOperator?: string;
  agentAssertions?: AgentBenchmarkAssertion[];
  agentAssertionOperator?: string;
  enabledTools?: string[];
  trials?: number;
  temperature?: number;
}

export default function BenchmarkPreviewSidebarComponent({
  form,
}: {
  form: BenchmarkFormPreviewState;
}) {
  const textAssertions = (form.assertions || []).filter(
    (assertion) =>
      assertion.expectedValue?.trim() || assertion.matchMode === "jsonValid",
  );
  const agentAssertions = form.agentAssertions || [];
  const operator = form.assertionOperator || "AND";
  const agentOperator = form.agentAssertionOperator || "AND";
  const enabledTools = form.enabledTools || [];

  const hasName = !!form.name?.trim();
  const hasPrompt = !!form.prompt?.trim();
  const hasAnyAssertion = textAssertions.length > 0 || agentAssertions.length > 0;

  return (
    <div className={`benchmark-preview-sidebar-component ${styles["container"]}`}>
      {/* -- Name Preview --------------------------------------- */}
      <div className={styles["name-section"]}>
        <div className={styles["name-label"]}>
          {hasName ? form.name : "Untitled Benchmark"}
        </div>
      </div>

      {/* -- Validation Checklist -------------------------------- */}
      <div className={styles["checklist-section"]}>
        <div className={styles["section-label"]}>
          <FileText size={12} />
          Checklist
        </div>
        <div className={styles["checklist-items"]}>
          <div
            className={`${styles["check-item"]} ${hasName ? styles["check-done"] : ""}`}
          >
            {hasName ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>Name</span>
          </div>
          <div
            className={`${styles["check-item"]} ${hasPrompt ? styles["check-done"] : ""}`}
          >
            {hasPrompt ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>Prompt</span>
          </div>
          <div
            className={`${styles["check-item"]} ${hasAnyAssertion ? styles["check-done"] : ""}`}
          >
            {hasAnyAssertion ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertCircle size={12} />
            )}
            <span>At least one assertion</span>
          </div>
        </div>
      </div>

      {/* -- Output Assertions Preview --------------------------- */}
      {textAssertions.length > 0 && (
        <div className={styles["assertions-section"]}>
          <div className={styles["section-label"]}>
            <ListChecks size={12} />
            Output Assertions
            <span className={styles["count-badge"]}>{textAssertions.length}</span>
          </div>
          <div className={styles["assertions-list"]}>
            {textAssertions.map((assertion, assertionIndex) => (
              <div key={assertionIndex} className={styles["assertion-layout-row"]}>
                {assertionIndex > 0 && (
                  <BadgeComponent
                    variant={operator === "OR" ? "warning" : "info"}
                    mini
                  >
                    {operator}
                  </BadgeComponent>
                )}
                <span
                  className={styles["assertion-value"]}
                  title={assertion.expectedValue}
                >
                  {describeTextAssertion(assertion)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- Behavior Assertions Preview ------------------------- */}
      {agentAssertions.length > 0 && (
        <div className={styles["assertions-section"]}>
          <div className={styles["section-label"]}>
            <Activity size={12} />
            Behavior Assertions
            <span className={styles["count-badge"]}>{agentAssertions.length}</span>
          </div>
          <div className={styles["assertions-list"]}>
            {agentAssertions.map((agentAssertion, assertionIndex) => {
              const typeDef = ASSERTION_TYPE_MAP[agentAssertion.type || ""];
              const Icon = typeDef?.icon || Activity;
              return (
                <div
                  key={`${agentAssertion.type}-${assertionIndex}`}
                  className={styles["assertion-layout-row"]}
                >
                  {assertionIndex > 0 && (
                    <BadgeComponent
                      variant={agentOperator === "OR" ? "warning" : "info"}
                      mini
                    >
                      {agentOperator}
                    </BadgeComponent>
                  )}
                  <Icon size={10} className={styles["assertion-icon"]} />
                  <span
                    className={styles["assertion-value"]}
                    title={describeAgentAssertion(agentAssertion)}
                  >
                    {describeAgentAssertion(agentAssertion)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -- Tool Scope ------------------------------------------ */}
      {enabledTools.length > 0 && (
        <div className={styles["assertions-section"]}>
          <div className={styles["section-label"]}>
            <Wrench size={12} />
            Tools
            <span className={styles["count-badge"]}>{enabledTools.length}</span>
          </div>
          <div className={styles["tools-list"]}>
            {enabledTools.map((toolName) => (
              <span key={toolName} className={styles["tool-chip"]}>
                {toolName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* -- Execution Settings ---------------------------------- */}
      {(form.trials || 1) > 1 && (
        <div className={styles["assertions-section"]}>
          <div className={styles["section-label"]}>
            <Repeat size={12} />
            Trials
          </div>
          <span className={styles["assertion-value"]}>
            Each target runs {form.trials} times
          </span>
        </div>
      )}

      {/* -- Prompt Preview -------------------------------------- */}
      {(hasPrompt || form.systemPrompt?.trim()) && (
        <div className={styles["prompt-section"]}>
          <div className={styles["section-label"]}>
            <MessageSquare size={12} />
            Preview
          </div>
          <ChatPreviewComponent
            systemPrompt={form.systemPrompt}
            messages={
              hasPrompt
                ? [{ role: "user" as const, content: form.prompt || "" }]
                : []
            }
            mini
          />
        </div>
      )}
    </div>
  );
}
