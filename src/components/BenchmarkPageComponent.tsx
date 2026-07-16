"use client";

import { useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
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
      leftPanel={<BenchmarkPreviewSidebarComponent form={form} />}
      leftTitle="Preview"
      rightPanel={rightSidebar}
      rightTitle="Benchmarks"
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
      <div className={styles["content-main"]}>
        <div className={styles["create-form-wrapper"]}>
          <div className={styles["create-form-header"]}>
            <Target size={18} className={styles["create-form-icon"]} />
            <div>
              <div className={styles["create-form-title"]}>New Benchmark</div>
              <div className={styles["create-form-subtitle"]}>
                Define a prompt, then assert on the output, tool usage, or
                judged quality — and run it against any set of models and
                agents.
              </div>
            </div>
          </div>

          <BenchmarkFormComponent form={form} onChange={setForm} />
        </div>
      </div>
    </ThreePanelLayout>
  );
}
