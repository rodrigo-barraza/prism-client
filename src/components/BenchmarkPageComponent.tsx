"use client";

import { useState, useCallback, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Target, CheckCircle2, Plus } from "lucide-react";
import PrismService from "../services/PrismService";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import BenchmarkPreviewSidebarComponent from "./BenchmarkPreviewSidebarComponent";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import BenchmarkFormComponent, {
  BenchmarkFormState,
  INITIAL_BENCHMARK_FORM,
} from "./BenchmarkFormComponent";
import { buildBenchmarkPayload, isBenchmarkFormValid } from "../utils/benchmarkForm";
import styles from "./BenchmarkPageComponent.module.css";

interface BenchmarkPageComponentProps {
  navSidebar: ReactNode;
  rightSidebar: ReactNode;
}

export default function BenchmarkPageComponent({
  navSidebar,
  rightSidebar,
}: BenchmarkPageComponentProps) {
  const router = useRouter();

  // -- State --------------------------------------------------
  const [form, setForm] = useState<BenchmarkFormState>(INITIAL_BENCHMARK_FORM);
  const [saving, setSaving] = useState(false);

  const isValid = isBenchmarkFormValid(form);

  // What's still needed before the benchmark can be created — drives the
  // footer hint so the user is never left guessing why Create is disabled.
  const missingHint = useMemo(() => {
    if (isValid) return null;
    const missing: string[] = [];
    if (!form.name?.trim()) missing.push("a name");
    if (!form.prompt?.trim()) missing.push("a prompt");
    const hasTextAssertion = (form.assertions || []).some(
      (assertion) =>
        assertion.expectedValue?.trim() || assertion.matchMode === "jsonValid",
    );
    if (!hasTextAssertion && (form.agentAssertions || []).length === 0) {
      missing.push("at least one assertion");
    }
    if (missing.length === 0) {
      return "Complete the required fields on your behavior assertions";
    }
    if (missing.length === 1) return `Add ${missing[0]} to create`;
    return `Add ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]} to create`;
  }, [form, isValid]);

  // -- Create -------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const created = await PrismService.createBenchmark(
        buildBenchmarkPayload(form),
      );
      setForm(INITIAL_BENCHMARK_FORM);
      if (created?.id) {
        router.push(`/benchmarks/${created.id}`);
      }
    } catch (error) {
      console.error("Failed to save benchmark:", error);
    } finally {
      setSaving(false);
    }
  }, [form, router]);

  // -- Render -------------------------------------------------
  return (
    <ThreePanelLayout
      className="benchmark-page-component"
      navSidebar={navSidebar}
      title="New Benchmark"
      leftPanel={<BenchmarkPreviewSidebarComponent form={form} />}
      leftTitle="Preview"
      rightPanel={rightSidebar}
      rightTitle="Benchmarks"
    >
      <div className={styles["content-main"]}>
        <div className={styles["create-column"]}>
          {/* -- Page hero ------------------------------------- */}
          <div className={styles["create-hero"]}>
            <div className={styles["create-hero-icon"]}>
              <Target size={22} />
            </div>
            <div className={styles["create-hero-text"]}>
              <h1 className={styles["create-hero-title"]}>New Benchmark</h1>
              <p className={styles["create-hero-subtitle"]}>
                Define a prompt, then assert on the output, tool usage, or
                judged quality — and run it against any set of models and
                agents.
              </p>
            </div>
          </div>

          {/* -- Form card ------------------------------------- */}
          <div className={styles["create-form-wrapper"]}>
            <BenchmarkFormComponent form={form} onChange={setForm} />

            {/* -- Sticky action footer: the primary Create affordance -- */}
            <div className={styles["create-form-footer"]}>
              {isValid ? (
                <span className={styles["footer-ready"]}>
                  <CheckCircle2 size={13} />
                  Ready to create
                </span>
              ) : (
                <span className={styles["footer-hint"]}>{missingHint}</span>
              )}
              <ButtonComponent
                variant="primary"
                icon={Plus}
                onClick={handleSave}
                loading={saving}
                disabled={!isValid}
              >
                Create Benchmark
              </ButtonComponent>
            </div>
          </div>
        </div>
      </div>
    </ThreePanelLayout>
  );
}
