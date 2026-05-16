"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import PrismService from "../services/PrismService";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import BenchmarkPreviewSidebarComponent from "./BenchmarkPreviewSidebarComponent";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import BenchmarkFormComponent from "./BenchmarkFormComponent";
import styles from "./BenchmarkPageComponent.module.css";

const MATCH_MODES = [
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact" },
  { value: "startsWith", label: "Starts With" },
  { value: "regex", label: "Regex" },
];

const INITIAL_FORM = {
  name: "",
  prompt: "",
  systemPrompt: "",
  benchmarkMode: "model",
  assertions: [{ expectedValue: "", matchMode: "contains" }],
  assertionOperator: "AND",
  agentAssertions: [],
  agentAssertionOperator: "AND",
};

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function BenchmarkPageComponent({ navSidebar: any, rightSidebar: any }) {
  const router = useRouter();

  // -- State --------------------------------------------------
  const [form, setForm] = useState<any>(INITIAL_FORM);
  const [saving, setSaving] = useState<any>(false);

  // -- Validation ---------------------------------------------
  const mode = form.benchmarkMode || "model";
  const hasModelAssertion = form.assertions?.some((a: any) => a.expectedValue);
  const hasAgentAssertion = form.agentAssertions?.length > 0;

  const isValid = (() => {
    if (!form.name || !form.prompt) return false;
    if (mode === "model") return hasModelAssertion;
    if (mode === "agent") return hasAgentAssertion;
    // Combined: at least one of either
    return hasModelAssertion || hasAgentAssertion;
  })();

  // -- Create -------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const { assertions, assertionOperator, agentAssertions, agentAssertionOperator, benchmarkMode, ...rest } = form;
      const payload = {
        ...rest,
        benchmarkMode,
        expectedValue: assertions[0]?.expectedValue || "",
        matchMode: assertions[0]?.matchMode || "contains",
        assertions,
        assertionOperator,
        agentAssertions: agentAssertions || [],
        agentAssertionOperator: agentAssertionOperator || "AND",
      };
      const created = await PrismService.createBenchmark(payload);
      setForm(INITIAL_FORM);
      if (created?.id) {
        router.push(`/benchmarks/${created.id}`);
      }
    } catch (error) {
      // @ts-ignore
      console.error("Failed to save benchmark:", err);
    } finally {
      setSaving(false);
    }
  }, [form, router]);

  // -- Render -------------------------------------------------
  return (
    <ThreePanelLayout
      // @ts-ignore
      navSidebar={navSidebar}
      leftPanel={<BenchmarkPreviewSidebarComponent form={form} />}
      leftTitle="Preview"
      // @ts-ignore
      rightPanel={rightSidebar}
      rightTitle="Benchmarks"
      headerTitle="New Benchmark"
      // @ts-ignore
      headerControls={
        <ButtonComponent
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={!isValid}
        >
          Create
        </ButtonComponent>
      }
    >
      <div className={styles.contentMain}>
        <div className={styles.createFormWrapper}>
          <div className={styles.createFormHeader}>
            <Target size={18} className={styles.createFormIcon} />
            <div>
              <div className={styles.createFormTitle}>New Benchmark</div>
              <div className={styles.createFormSubtitle}>
                Define a prompt, expected output, and match criteria to evaluate model accuracy.
              </div>
            </div>
          </div>

          <BenchmarkFormComponent
            form={form}
            onChange={setForm}
            matchModes={MATCH_MODES}
          />
        </div>
      </div>
    </ThreePanelLayout>
  );
}
