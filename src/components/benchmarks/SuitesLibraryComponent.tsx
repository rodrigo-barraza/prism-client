"use client";

/**
 * The suite library: Prism's built-in suites, public benchmarks imported
 * from Hugging Face, and your own. Import, create, duplicate, run.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FlaskConical, Lock, Play, Plus, Trash2 } from "lucide-react";
import { BadgeComponent, ButtonComponent, IconButtonComponent, LoadingStateComponent, ModalComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import type { CatalogEntry, SuiteSummary } from "../../types/benchmarks";
import { compact } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import styles from "./Benchmarks.module.css";

const GROUPS: Array<{ kind: SuiteSummary["source"]["kind"]; title: string; hint: string }> = [
  { kind: "builtin", title: "Built-in", hint: "Original Prism suites — no model has trained on them. Read-only; duplicate one to edit it." },
  { kind: "import", title: "Imported benchmarks", hint: "Public benchmarks sampled from Hugging Face with a seed, graded the way their authors grade them." },
  { kind: "custom", title: "Your suites", hint: "Cases you wrote or pasted in." },
];

function SuiteCard({ suite, onChanged }: { suite: SuiteSummary; onChanged: () => void }) {
  const router = useRouter();
  const readOnly = suite.source.kind === "builtin";
  const duplicate = async () => {
    const copy = await BenchmarkApi.duplicateSuite(suite.id);
    router.push(`/benchmarks/suites/${copy.id}`);
  };
  const remove = async () => {
    if (!window.confirm(`Delete the suite "${suite.name}"? Runs that used it keep their copy.`)) return;
    await BenchmarkApi.deleteSuite(suite.id);
    onChanged();
  };
  return (
    <div className={styles["card"]} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={styles["row"]} style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ flex: 1, minInlineSize: 0 }}>
          <button type="button" className={styles["link-button"]} style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--text-primary)" }} onClick={() => router.push(`/benchmarks/suites/${encodeURIComponent(suite.id)}`)}>
            {suite.name}
          </button>
          <div className={`${styles["small"]} ${styles["muted"]}`}>
            {suite.caseCount} case{suite.caseCount === 1 ? "" : "s"}
            {suite.source.totalRows && suite.source.totalRows > suite.caseCount ? ` of ${compact(suite.source.totalRows)}` : ""}
            {suite.source.license ? ` · ${suite.source.license}` : ""}
          </div>
        </div>
        {readOnly && <Lock size={13} aria-label="read-only" className={styles["muted"]} />}
      </div>
      {suite.description && (
        <p className={styles["section-hint"]} style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {suite.description}
        </p>
      )}
      <div className={styles["row"]}>
        {suite.tags.slice(0, 4).map((tag) => (
          <span key={tag} className={styles["chip"]}>
            {tag}
          </span>
        ))}
        {suite.tools.mode !== "none" && <span className={styles["chip"]}>{suite.tools.mode === "list" ? `${suite.tools.tools.length} tools` : "agent tools"}</span>}
        {suite.workspace && <span className={styles["chip"]}>workspace</span>}
      </div>
      <div className={styles["row"]} style={{ marginBlockStart: "auto" }}>
        <ButtonComponent variant="primary" size="small" icon={Play} onClick={() => router.push(`/benchmarks/new?suites=${encodeURIComponent(suite.id)}`)}>
          Run
        </ButtonComponent>
        <span className={styles["spacer"]} />
        <IconButtonComponent icon={<Copy size={14} />} tooltip="Duplicate to edit" onClick={() => void duplicate()} />
        {!readOnly && <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Delete" variant="destructive" onClick={() => void remove()} />}
      </div>
    </div>
  );
}

function CatalogImportModal({ onClose, onImported }: { onClose: () => void; onImported: (suite: SuiteSummary) => void }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [limit, setLimit] = useState("");
  const [seed, setSeed] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    BenchmarkApi.catalog()
      .then(setEntries)
      .catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  const pick = (entry: CatalogEntry) => {
    setSelected(entry);
    setLimit(String(entry.suggestedSample));
    setError(null);
  };

  const importSelected = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const suite = await BenchmarkApi.importSuite(selected.id, { limit: Number(limit) || null, seed: Number(seed) || 1 });
      onImported(suite);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const categories = useMemo(() => [...new Set((entries ?? []).map((entry) => entry.category))], [entries]);

  return (
    <ModalComponent
      title="Import a public benchmark"
      onClose={onClose}
      size="lg"
      footer={
        <div className={styles["row"]} style={{ inlineSize: "100%" }}>
          {error && <span className={styles["error-text"]}>{error}</span>}
          <span className={styles["spacer"]} />
          <ButtonComponent variant="secondary" onClick={onClose}>
            Cancel
          </ButtonComponent>
          <ButtonComponent variant="primary" icon={Download} loading={busy} disabled={!selected || (selected.gated && selected.available === false)} onClick={() => void importSelected()}>
            Import {selected ? selected.name : ""}
          </ButtonComponent>
        </div>
      }
    >
      {!entries ? (
        <LoadingStateComponent message="Loading the catalog…" />
      ) : (
        <div className={styles["section"]}>
          <p className={styles["section-hint"]}>
            Rows are read from the Hugging Face datasets server and sampled with the seed, so the same seed always gives the same cases. A sample of the suggested size is enough to separate
            contestants that differ by roughly 10–15 points; take more to see smaller gaps.
          </p>
          {categories.map((category) => (
            <div key={category} className={styles["section"]}>
              <h3 className={styles["section-title"]} style={{ fontSize: "var(--font-size-sm)" }}>
                {category}
              </h3>
              <div className={styles["card-grid"]}>
                {entries
                  .filter((entry) => entry.category === category)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={styles["card"]}
                      onClick={() => pick(entry)}
                      aria-pressed={selected?.id === entry.id}
                      style={{
                        textAlign: "start",
                        cursor: "pointer",
                        font: "inherit",
                        borderColor: selected?.id === entry.id ? "var(--accent-primary)" : undefined,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span className={styles["row"]}>
                        <strong style={{ color: "var(--text-primary)" }}>{entry.name}</strong>
                        {entry.judged && <BadgeComponent variant="warning" mini>judged</BadgeComponent>}
                        {entry.gated && <BadgeComponent variant={entry.available ? "info" : "error"} mini>{entry.available ? "gated" : "needs HF token"}</BadgeComponent>}
                      </span>
                      <span className={styles["section-hint"]}>{entry.description}</span>
                      <span className={`${styles["small"]} ${styles["muted"]}`}>
                        {entry.totalRows ? `${compact(entry.totalRows)} rows` : ""} · {entry.license}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {selected && (
            <div className={styles["card"]}>
              <div className={styles["field-grid"]}>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Cases to sample</span>
                  <input className={styles["native-input"]} type="number" min={1} max={selected.totalRows ?? undefined} value={limit} onChange={(event) => setLimit(event.target.value)} />
                  <span className={styles["field-hint"]}>
                    Suggested {selected.suggestedSample}
                    {selected.totalRows ? ` of ${compact(selected.totalRows)}` : ""}.
                  </span>
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Seed</span>
                  <input className={styles["native-input"]} type="number" min={0} value={seed} onChange={(event) => setSeed(event.target.value)} />
                  <span className={styles["field-hint"]}>Same seed, same cases.</span>
                </label>
              </div>
              {selected.gated && selected.available === false && (
                <p className={styles["error-text"]} style={{ marginBlockEnd: 0 }}>
                  {selected.name} is gated: accept its terms on Hugging Face and set HUGGINGFACE_TOKEN for prism-service.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </ModalComponent>
  );
}

export default function SuitesLibraryComponent() {
  const router = useRouter();
  const [suites, setSuites] = useState<SuiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    BenchmarkApi.suites()
      .then(setSuites)
      .catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className={styles["error-text"]}>Could not load suites: {error}</p>;
  if (!suites) return <LoadingStateComponent message="Loading suites…" />;

  return (
    <div className={styles["section"]}>
      <div className={styles["toolbar"]}>
        <ButtonComponent variant="primary" icon={Download} onClick={() => setImporting(true)}>
          Import a public benchmark
        </ButtonComponent>
        <ButtonComponent variant="secondary" icon={Plus} onClick={() => router.push("/benchmarks/suites/new")}>
          New suite
        </ButtonComponent>
      </div>
      {GROUPS.map((group) => {
        const members = suites.filter((suite) => suite.source.kind === group.kind);
        if (members.length === 0 && group.kind !== "custom") return null;
        return (
          <div key={group.kind} className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>
                {group.kind === "builtin" && <FlaskConical size={15} style={{ verticalAlign: "-2px" }} />} {group.title}
              </h2>
              <p className={styles["section-hint"]}>{group.hint}</p>
            </div>
            {members.length === 0 ? (
              <div className={`${styles["card"]} ${styles["empty"]}`}>No suites of your own yet — create one, or duplicate a built-in suite to adapt it.</div>
            ) : (
              <div className={styles["card-grid"]}>
                {members.map((suite) => (
                  <SuiteCard key={suite.id} suite={suite} onChanged={load} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {importing && (
        <CatalogImportModal
          onClose={() => setImporting(false)}
          onImported={(suite) => {
            setImporting(false);
            load();
            router.push(`/benchmarks/suites/${encodeURIComponent(suite.id)}`);
          }}
        />
      )}
    </div>
  );
}
