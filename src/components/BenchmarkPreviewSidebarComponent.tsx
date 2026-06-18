"use client";

import {
  ListChecks,
  FileText,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bot,
  Cpu,
  Layers,
} from "lucide-react";
import { BadgeComponent } from "@rodrigo-barraza/components-library";
import ChatPreviewComponent from "./ChatPreviewComponent";
import { AGENT_ASSERTION_TYPES, type AgentAssertion } from "./AgentAssertionsComponent";
import styles from "./BenchmarkPreviewSidebarComponent.module.css";

const ASSERTION_TYPE_MAP = Object.fromEntries(
  AGENT_ASSERTION_TYPES.map((assertionType) => [assertionType.value, assertionType]),
);

const MODE_ICONS: Record<string, React.ElementType> = {
  model: Cpu,
  agent: Bot,
  combined: Layers,
};

const MODE_LABELS: Record<string, string> = {
  model: "Model Benchmark",
  agent: "Agent Benchmark",
  combined: "Combined Benchmark",
};

/**
 * BenchmarkPreviewSidebarComponent — left sidebar for the benchmark create page.
 * Dynamically reflects the form state as the user fills it out: shows name,
 * assertions summary, prompt preview, and validation checklist.
 *
 * Props:
 *   form — { name, systemPrompt, prompt, benchmarkMode, assertions, assertionOperator, agentAssertions, agentAssertionOperator }
 */
interface ModelAssertion {
  expectedValue?: string;
  matchMode?: string;
}

interface BenchmarkFormState {
  name?: string;
  systemPrompt?: string;
  prompt?: string;
  benchmarkMode?: string;
  assertions?: ModelAssertion[];
  assertionOperator?: string;
  agentAssertions?: AgentAssertion[];
  agentAssertionOperator?: string;
}

export default function BenchmarkPreviewSidebarComponent({ form }: { form: BenchmarkFormState }) {
  const assertions = form.assertions || [];
  const agentAssertions = form.agentAssertions || [];
  const operator = form.assertionOperator || "AND";
  const agentOperator = form.agentAssertionOperator || "AND";
  const mode = form.benchmarkMode || "model";
  const hasName = !!form.name?.trim();
  const hasPrompt = !!form.prompt?.trim();
  const hasModelAssertion = assertions.some((assertion: ModelAssertion) =>
    assertion.expectedValue?.trim(),
  );
  const hasAgentAssertion = agentAssertions.length > 0;

  const showModelAssertions = mode === "model" || mode === "combined";
  const showAgentAssertions = mode === "agent" || mode === "combined";

  // Mode-aware assertion validation
  const hasRequiredAssertion = (() => {
    if (mode === "model") return hasModelAssertion;
    if (mode === "agent") return hasAgentAssertion;
    return hasModelAssertion || hasAgentAssertion;
  })();

  const ModeIcon = (MODE_ICONS[mode] || Cpu) as React.ElementType;

  return (
    <div className={`benchmark-preview-sidebar-component ${styles['container']}`}>
      {/* -- Mode Badge ------------------------------------------ */}
      <div className={styles['mode-section']}>
        <ModeIcon size={12} />
        <span>{MODE_LABELS[mode] || "Benchmark"}</span>
      </div>

      {/* -- Name Preview --------------------------------------- */}
      <div className={styles['name-section']}>
        <div className={styles['name-label']}>
          {hasName ? form.name : "Untitled Benchmark"}
        </div>
      </div>

      {/* -- Validation Checklist -------------------------------- */}
      <div className={styles['checklist-section']}>
        <div className={styles['section-label']}>
          <FileText size={12} />
          Checklist
        </div>
        <div className={styles['checklist-items']}>
          <div
            className={`${styles['check-item']} ${hasName ? styles['check-done'] : ""}`}
          >
            {hasName ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>Name</span>
          </div>
          <div
            className={`${styles['check-item']} ${hasPrompt ? styles['check-done'] : ""}`}
          >
            {hasPrompt ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>Prompt</span>
          </div>
          <div
            className={`${styles['check-item']} ${hasRequiredAssertion ? styles['check-done'] : ""}`}
          >
            {hasRequiredAssertion ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertCircle size={12} />
            )}
            <span>At least one assertion</span>
          </div>
        </div>
      </div>

      {/* -- Model Assertions Preview --------------------------- */}
      {showModelAssertions &&
        assertions.length > 0 &&
        assertions.some((assertion: ModelAssertion) => assertion.expectedValue?.trim()) && (
          <div className={styles['assertions-section']}>
            <div className={styles['section-label']}>
              <ListChecks size={12} />
              {mode === "combined" ? "Output Assertions" : "Assertions"}
              <span className={styles['count-badge']}>
                {assertions.filter((assertion: ModelAssertion) => assertion.expectedValue?.trim()).length}
              </span>
            </div>
            <div className={styles['assertions-list']}>
              {assertions.map((assertion: ModelAssertion, assertionIndex: number) => {
                if (!assertion.expectedValue?.trim()) return null;
                return (
                  <div key={assertionIndex} className={styles['assertion-layout-row']}>
                    {assertionIndex > 0 && (
                      <BadgeComponent
                        variant={operator === "OR" ? "warning" : "info"}
                        mini
                      >
                        {operator}
                      </BadgeComponent>
                    )}
                    <BadgeComponent variant="accent" mini>
                      {assertion.matchMode || "contains"}
                    </BadgeComponent>
                    <span
                      className={styles['assertion-value']}
                      title={assertion.expectedValue}
                    >
                      {assertion.expectedValue}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* -- Agent Assertions Preview --------------------------- */}
      {showAgentAssertions && agentAssertions.length > 0 && (
        <div className={styles['assertions-section']}>
          <div className={styles['section-label']}>
            <Bot size={12} />
            Agent Assertions
            <span className={styles['count-badge']}>{agentAssertions.length}</span>
          </div>
          <div className={styles['assertions-list']}>
            {agentAssertions.map((agentAssertion: AgentAssertion, assertionIndex: number) => {
              const typeDef = ASSERTION_TYPE_MAP[agentAssertion.type];
              if (!typeDef) return null;
              const Icon = typeDef.icon;
              return (
                <div key={`${agentAssertion.type}-${assertionIndex}`} className={styles['assertion-layout-row']}>
                  {assertionIndex > 0 && (
                    <BadgeComponent
                      variant={agentOperator === "OR" ? "warning" : "info"}
                      mini
                    >
                      {agentOperator}
                    </BadgeComponent>
                  )}
                  <BadgeComponent variant="accent" mini>
                    <Icon size={10} style={{ marginRight: 3 }} />
                    {typeDef.label}
                  </BadgeComponent>
                  {typeDef.hasOperand && agentAssertion.operand && (
                    <span className={styles['assertion-value']}>
                      {typeDef.operators?.find(
                        (operatorOption) => operatorOption.value === agentAssertion.operator,
                      )?.label || "≥"}{" "}
                      {agentAssertion.operand}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -- Prompt Preview -------------------------------------- */}
      {(hasPrompt || form.systemPrompt?.trim()) && (
        <div className={styles['prompt-section']}>
          <div className={styles['section-label']}>
            <MessageSquare size={12} />
            Preview
          </div>
          <ChatPreviewComponent
            systemPrompt={form.systemPrompt}
            messages={hasPrompt ? [{ role: "user" as const, content: form.prompt || "" }] : []}
            mini
          />
        </div>
      )}
    </div>
  );
}
