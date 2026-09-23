"use client";

/**
 * /benchmarks/suites/[id] (and /new) — a suite: its settings, default
 * scorers and cases. Built-in suites are read-only (duplicate to edit);
 * imported and custom ones are edited here and saved as a new version.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, Lock, Play, Plus, Save, Trash2 } from "lucide-react";
import { BadgeComponent, ButtonComponent, IconButtonComponent, LoadingStateComponent, ModalComponent, SwitchComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import type { BenchmarkSuite, CaseMessage, ScorerSpec, SuiteCase, SuiteToolPolicy } from "../../types/benchmarks";
import { scorerSummary } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import ScorerEditorComponent from "./ScorerEditorComponent";
import styles from "./Benchmarks.module.css";

type Draft = Pick<BenchmarkSuite, "name" | "description" | "tags" | "systemPrompt" | "tools" | "workspace" | "limits" | "scorers" | "cases">;

const EMPTY: Draft = { name: "", description: "", tags: [], systemPrompt: "", tools: { mode: "none" }, workspace: false, limits: null, scorers: [{ type: "exact" }], cases: [] };

const inputText = (input: SuiteCase["input"]) => (typeof input === "string" ? input : input.map((message) => `${message.role}: ${message.content}`).join("\n"));

/** Parse pasted JSONL (one case per line) or two-column CSV (input,target). */
export function parseCases(text: string): { cases: SuiteCase[]; errors: string[] } {
  const cases: SuiteCase[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const looksJson = lines.every((line) => line.trim().startsWith("{"));
  lines.forEach((line, index) => {
    if (looksJson) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const input = parsed.input ?? parsed.prompt ?? parsed.question ?? parsed.messages;
        if (typeof input !== "string" && !Array.isArray(input)) throw new Error("no input / prompt / question");
        cases.push({
          id: typeof parsed.id === "string" ? parsed.id : `case-${Date.now().toString(36)}-${index + 1}`,
          input: input as SuiteCase["input"],
          ...(parsed.target !== undefined || parsed.answer !== undefined ? { target: (parsed.target ?? parsed.answer) as SuiteCase["target"] } : {}),
          ...(Array.isArray(parsed.tags) ? { tags: parsed.tags as string[] } : {}),
          ...(typeof parsed.systemPrompt === "string" ? { systemPrompt: parsed.systemPrompt } : {}),
          ...(Array.isArray(parsed.scorers) ? { scorers: parsed.scorers as ScorerSpec[] } : {}),
          ...(parsed.metadata && typeof parsed.metadata === "object" ? { metadata: parsed.metadata as Record<string, unknown> } : {}),
        });
      } catch (error) {
        errors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    // CSV: input,target — a quoted field may hold commas.
    const fields = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"')).filter((_, position, all) => position < all.length - 1);
    if (!fields[0]?.trim()) {
      errors.push(`line ${index + 1}: empty input`);
      return;
    }
    cases.push({ id: `case-${Date.now().toString(36)}-${index + 1}`, input: fields[0], ...(fields[1]?.trim() ? { target: fields[1].trim() } : {}) });
  });
  return { cases, errors };
}

function CaseEditor({
  value,
  suiteScorers,
  onSave,
  onClose,
}: {
  value: SuiteCase;
  suiteScorers: ScorerSpec[];
  onSave: (value: SuiteCase) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SuiteCase>(value);
  const [conversation, setConversation] = useState(Array.isArray(value.input));
  const [json, setJson] = useState({
    files: value.files ? JSON.stringify(value.files, null, 2) : "",
    hiddenFiles: value.hiddenFiles ? JSON.stringify(value.hiddenFiles, null, 2) : "",
    metadata: value.metadata ? JSON.stringify(value.metadata, null, 2) : "",
    input: Array.isArray(value.input) ? JSON.stringify(value.input, null, 2) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const targets = draft.target === undefined || draft.target === null ? "" : Array.isArray(draft.target) ? draft.target.join("\n") : draft.target;

  const save = () => {
    try {
      const parseObject = (text: string, label: string) => {
        if (!text.trim()) return null;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
        return parsed;
      };
      const input = conversation ? (JSON.parse(json.input || "[]") as CaseMessage[]) : draft.input;
      onSave({
        ...draft,
        input,
        files: parseObject(json.files, "Files"),
        hiddenFiles: parseObject(json.hiddenFiles, "Hidden files"),
        metadata: parseObject(json.metadata, "Metadata"),
      });
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <ModalComponent
      title={value.id ? `Case ${value.id}` : "New case"}
      onClose={onClose}
      size="lg"
      footer={
        <div className={styles["row"]} style={{ inlineSize: "100%" }}>
          {error && <span className={styles["error-text"]}>{error}</span>}
          <span className={styles["spacer"]} />
          <ButtonComponent variant="secondary" onClick={onClose}>
            Cancel
          </ButtonComponent>
          <ButtonComponent variant="primary" onClick={save}>
            Done
          </ButtonComponent>
        </div>
      }
    >
      <div className={styles["section"]}>
        <div className={styles["field-grid"]}>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Id</span>
            <input className={styles["native-input"]} value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
          </label>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Tags (comma-separated)</span>
            <input
              className={styles["native-input"]}
              value={(draft.tags ?? []).join(", ")}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
            />
          </label>
        </div>
        <SwitchComponent checked={conversation} onChange={setConversation} label="A conversation (several turns) instead of one prompt" />
        {conversation ? (
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Messages (JSON: [{"{"}&quot;role&quot;: &quot;user&quot;, &quot;content&quot;: &quot;…&quot;{"}"}, …] — ends on a user message)</span>
            <textarea className={`${styles["native-textarea"]} ${styles["mono"]}`} rows={8} value={json.input} onChange={(event) => setJson({ ...json, input: event.target.value })} />
          </label>
        ) : (
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Prompt</span>
            <textarea className={styles["native-textarea"]} rows={6} value={typeof draft.input === "string" ? draft.input : ""} onChange={(event) => setDraft({ ...draft, input: event.target.value })} />
          </label>
        )}
        <label className={styles["field"]}>
          <span className={styles["field-label"]}>Reference answer(s) — one per line; any matches</span>
          <textarea
            className={styles["native-textarea"]}
            rows={2}
            value={targets}
            onChange={(event) => {
              const lines = event.target.value.split("\n");
              setDraft({ ...draft, target: event.target.value === "" ? null : lines.length === 1 ? lines[0] : lines });
            }}
          />
        </label>
        <label className={styles["field"]}>
          <span className={styles["field-label"]}>System prompt (overrides the suite&apos;s)</span>
          <textarea className={styles["native-textarea"]} rows={2} value={draft.systemPrompt ?? ""} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value || null })} />
        </label>
        <SwitchComponent
          checked={!!draft.scorers}
          onChange={(checked) => setDraft({ ...draft, scorers: checked ? structuredClone(suiteScorers) : null })}
          label="This case has its own scorers (instead of the suite's)"
        />
        {draft.scorers && <ScorerEditorComponent scorers={draft.scorers} onChange={(scorers) => setDraft({ ...draft, scorers })} />}
        <details>
          <summary className={styles["field-label"]} style={{ cursor: "pointer" }}>
            Workspace files and metadata
          </summary>
          <div className={styles["section"]} style={{ marginBlockStart: 10 }}>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Seed files (JSON: {"{"}&quot;path&quot;: &quot;content&quot;{"}"}) — written before the run</span>
              <textarea className={`${styles["native-textarea"]} ${styles["mono"]}`} rows={4} value={json.files} onChange={(event) => setJson({ ...json, files: event.target.value })} />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Hidden files — written after the answer, before scoring (tests the contestant never sees)</span>
              <textarea className={`${styles["native-textarea"]} ${styles["mono"]}`} rows={4} value={json.hiddenFiles} onChange={(event) => setJson({ ...json, hiddenFiles: event.target.value })} />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Metadata (JSON) — e.g. ifeval instructions, testProgram, choices</span>
              <textarea className={`${styles["native-textarea"]} ${styles["mono"]}`} rows={4} value={json.metadata} onChange={(event) => setJson({ ...json, metadata: event.target.value })} />
            </label>
          </div>
        </details>
      </div>
    </ModalComponent>
  );
}

function ImportCasesModal({ onImport, onClose }: { onImport: (cases: SuiteCase[]) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseCases(text) : null), [text]);
  return (
    <ModalComponent
      title="Paste cases"
      onClose={onClose}
      size="lg"
      footer={
        <div className={styles["row"]} style={{ inlineSize: "100%" }}>
          {parsed && (
            <span className={parsed.errors.length > 0 ? styles["error-text"] : styles["small"]}>
              {parsed.cases.length} case{parsed.cases.length === 1 ? "" : "s"}
              {parsed.errors.length > 0 ? ` · ${parsed.errors.length} line(s) skipped: ${parsed.errors.slice(0, 2).join("; ")}` : ""}
            </span>
          )}
          <span className={styles["spacer"]} />
          <ButtonComponent variant="secondary" onClick={onClose}>
            Cancel
          </ButtonComponent>
          <ButtonComponent variant="primary" disabled={!parsed || parsed.cases.length === 0} onClick={() => parsed && onImport(parsed.cases)}>
            Add cases
          </ButtonComponent>
        </div>
      }
    >
      <p className={styles["section-hint"]}>
        One JSON object per line — <span className={styles["mono"]}>{'{"input": "…", "target": "…", "tags": ["…"]}'}</span> (also <span className={styles["mono"]}>prompt</span>/
        <span className={styles["mono"]}>question</span>, <span className={styles["mono"]}>answer</span>) — or CSV lines of <span className={styles["mono"]}>input,target</span>.
      </p>
      <textarea className={`${styles["native-textarea"]} ${styles["mono"]}`} rows={14} value={text} onChange={(event) => setText(event.target.value)} />
    </ModalComponent>
  );
}

export default function SuiteDetailComponent({ suiteId }: { suiteId: string }) {
  const router = useRouter();
  const isNew = suiteId === "new";
  const [suite, setSuite] = useState<BenchmarkSuite | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number; value: SuiteCase } | null>(null);
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    if (isNew) return;
    BenchmarkApi.suite(suiteId)
      .then((loaded) => {
        setSuite(loaded);
        setDraft({
          name: loaded.name,
          description: loaded.description ?? "",
          tags: loaded.tags,
          systemPrompt: loaded.systemPrompt ?? "",
          tools: loaded.tools,
          workspace: loaded.workspace,
          limits: loaded.limits ?? null,
          scorers: loaded.scorers,
          cases: loaded.cases,
        });
      })
      .catch((caught) => setError(getErrorMessage(caught)));
  }, [suiteId, isNew]);

  const readOnly = suite?.source.kind === "builtin";
  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...draft, description: draft.description || null, systemPrompt: draft.systemPrompt || null };
      if (isNew) {
        const created = await BenchmarkApi.createSuite(body);
        router.replace(`/benchmarks/suites/${encodeURIComponent(created.id)}`);
      } else {
        const updated = await BenchmarkApi.updateSuite(suiteId, body);
        setSuite(updated);
        setDirty(false);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    const copy = await BenchmarkApi.duplicateSuite(suiteId);
    router.push(`/benchmarks/suites/${encodeURIComponent(copy.id)}`);
  };

  if (error && !suite && !isNew) return <p className={styles["error-text"]}>{error}</p>;
  if (!isNew && !suite) return <LoadingStateComponent message="Loading the suite…" />;

  const toolsList = draft.tools.mode === "list" ? draft.tools.tools.join(", ") : "";

  return (
    <div className={`${styles["theme"]} ${styles["page"]}`}>
      <header className={styles["section"]} style={{ gap: 8 }}>
        <div className={styles["row"]} style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minInlineSize: 240 }}>
            {readOnly ? (
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>
                {draft.name} <Lock size={15} aria-label="read-only" />
              </h1>
            ) : (
              <input
                className={styles["native-input"]}
                style={{ fontSize: 20, fontWeight: 600 }}
                placeholder="Suite name"
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
                aria-label="Suite name"
              />
            )}
            {suite && (
              <div className={styles["row"]} style={{ marginBlockStart: 6 }}>
                <BadgeComponent variant={suite.source.kind === "builtin" ? "accent" : suite.source.kind === "import" ? "info" : "success"}>
                  {suite.source.kind === "builtin" ? "built-in" : suite.source.kind === "import" ? `imported · ${suite.source.ref}` : "custom"}
                </BadgeComponent>
                {suite.source.license && <span className={styles["chip"]}>{suite.source.license}</span>}
                {suite.source.seed !== undefined && suite.source.seed !== null && (
                  <span className={styles["chip"]}>
                    {suite.source.sampledRows} of {suite.source.totalRows} · seed {suite.source.seed}
                  </span>
                )}
                <span className={`${styles["small"]} ${styles["muted"]}`}>version {suite.version}</span>
                {suite.source.url && (
                  <a className={styles["link-button"]} href={suite.source.url} target="_blank" rel="noreferrer">
                    source ↗
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={styles["row"]}>
            {!isNew && (
              <ButtonComponent variant="secondary" icon={Play} disabled={dirty} onClick={() => router.push(`/benchmarks/new?suites=${encodeURIComponent(suiteId)}`)}>
                Run
              </ButtonComponent>
            )}
            {!isNew && (
              <ButtonComponent variant="secondary" icon={Copy} onClick={() => void duplicate()}>
                {readOnly ? "Duplicate to edit" : "Duplicate"}
              </ButtonComponent>
            )}
            {!readOnly && (
              <ButtonComponent variant="primary" icon={Save} loading={saving} disabled={(!dirty && !isNew) || !draft.name.trim() || draft.cases.length === 0} onClick={() => void save()}>
                {isNew ? "Create suite" : "Save"}
              </ButtonComponent>
            )}
          </div>
        </div>
        {error && <p className={styles["error-text"]}>{error}</p>}
      </header>

      <section className={styles["card"]}>
        <div className={styles["section"]}>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Description</span>
            {readOnly ? (
              <p className={styles["section-hint"]}>{draft.description}</p>
            ) : (
              <textarea className={styles["native-textarea"]} rows={2} value={draft.description ?? ""} onChange={(event) => change({ description: event.target.value })} />
            )}
          </label>
          <div className={styles["field-grid"]}>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Tools</span>
              <select
                className={styles["native-select"]}
                disabled={readOnly}
                value={draft.tools.mode}
                onChange={(event) => change({ tools: (event.target.value === "list" ? { mode: "list", tools: [] } : { mode: event.target.value }) as SuiteToolPolicy })}
              >
                <option value="none">None (agents keep their persona&apos;s)</option>
                <option value="agent">The agent&apos;s own</option>
                <option value="list">These tools, for everyone</option>
              </select>
            </label>
            {draft.tools.mode === "list" && (
              <label className={styles["field"]} style={{ gridColumn: "span 2" }}>
                <span className={styles["field-label"]}>Tool names (comma-separated)</span>
                <input
                  className={styles["native-input"]}
                  disabled={readOnly}
                  value={toolsList}
                  onChange={(event) => change({ tools: { mode: "list", tools: event.target.value.split(",").map((tool) => tool.trim()).filter(Boolean) } })}
                />
              </label>
            )}
            <div className={styles["field"]}>
              <span className={styles["field-label"]}>Workspace</span>
              <SwitchComponent checked={draft.workspace} onChange={(checked) => !readOnly && change({ workspace: checked })} label="Fresh scratch directory per sample" disabled={readOnly} />
            </div>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Tags</span>
              <input
                className={styles["native-input"]}
                disabled={readOnly}
                value={draft.tags.join(", ")}
                onChange={(event) => change({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
              />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Max agent iterations</span>
              <input
                className={styles["native-input"]}
                type="number"
                disabled={readOnly}
                placeholder="contestant's"
                value={draft.limits?.maxIterations ?? ""}
                onChange={(event) => change({ limits: { ...(draft.limits ?? {}), maxIterations: event.target.value ? Number(event.target.value) : null } })}
              />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Timeout per sample (s)</span>
              <input
                className={styles["native-input"]}
                type="number"
                disabled={readOnly}
                placeholder="run's"
                value={draft.limits?.timeoutSeconds ?? ""}
                onChange={(event) => change({ limits: { ...(draft.limits ?? {}), timeoutSeconds: event.target.value ? Number(event.target.value) : null } })}
              />
            </label>
          </div>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>System prompt for every case</span>
            {readOnly ? (
              draft.systemPrompt ? <pre className={styles["code-block"]}>{draft.systemPrompt}</pre> : <span className={styles["muted"]}>none</span>
            ) : (
              <textarea className={styles["native-textarea"]} rows={2} value={draft.systemPrompt ?? ""} onChange={(event) => change({ systemPrompt: event.target.value })} />
            )}
          </label>
        </div>
      </section>

      <section className={styles["section"]}>
        <h2 className={styles["section-title"]}>Default scorers</h2>
        {readOnly ? (
          <p className={styles["section-hint"]}>{draft.scorers.length > 0 ? draft.scorers.map(scorerSummary).join(" · ") : "Each case carries its own scorers."}</p>
        ) : (
          <ScorerEditorComponent scorers={draft.scorers} onChange={(scorers) => change({ scorers })} emptyHint="No default scorers: every case must carry its own." />
        )}
      </section>

      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <h2 className={styles["section-title"]}>Cases ({draft.cases.length})</h2>
          {!readOnly && (
            <div className={styles["toolbar"]}>
              <ButtonComponent variant="secondary" size="small" icon={Plus} onClick={() => setEditing({ index: -1, value: { id: `case-${draft.cases.length + 1}`, input: "" } })}>
                Add case
              </ButtonComponent>
              <ButtonComponent variant="secondary" size="small" icon={FileUp} onClick={() => setPasting(true)}>
                Paste JSONL / CSV
              </ButtonComponent>
            </div>
          )}
        </div>
        {draft.cases.length === 0 ? (
          <div className={`${styles["card"]} ${styles["empty"]}`}>No cases yet.</div>
        ) : (
          <div className={styles["table-scroll"]}>
            <table className={styles["table"]}>
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Input</th>
                  <th>Reference</th>
                  <th>Scorers</th>
                  <th>Tags</th>
                  {!readOnly && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {draft.cases.map((datasetCase, index) => (
                  <tr
                    key={`${datasetCase.id}-${index}`}
                    className={styles["clickable-row"]}
                    tabIndex={0}
                    onClick={() => setEditing({ index, value: datasetCase })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setEditing({ index, value: datasetCase });
                    }}
                  >
                    <td className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                      {datasetCase.id}
                    </td>
                    <td style={{ maxInlineSize: 480 }}>
                      <span className={styles["contestant-label"]} style={{ display: "block", maxInlineSize: 480 }} title={inputText(datasetCase.input)}>
                        {inputText(datasetCase.input)}
                      </span>
                    </td>
                    <td className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                      {datasetCase.target === undefined || datasetCase.target === null ? "—" : Array.isArray(datasetCase.target) ? datasetCase.target.join(" | ") : datasetCase.target}
                    </td>
                    <td className={styles["small"]}>{datasetCase.scorers ? datasetCase.scorers.map(scorerSummary).join(" · ") : <span className={styles["muted"]}>suite&apos;s</span>}</td>
                    <td className={styles["small"]}>{(datasetCase.tags ?? []).join(", ")}</td>
                    {!readOnly && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <IconButtonComponent
                          icon={<Trash2 size={13} />}
                          tooltip="Remove case"
                          variant="destructive"
                          onClick={() => change({ cases: draft.cases.filter((_, position) => position !== index) })}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing &&
        (readOnly ? (
          <ModalComponent title={`Case ${editing.value.id}`} onClose={() => setEditing(null)} size="lg">
            <pre className={styles["code-block"]}>{JSON.stringify(editing.value, null, 2)}</pre>
          </ModalComponent>
        ) : (
          <CaseEditor
            value={editing.value}
            suiteScorers={draft.scorers}
            onClose={() => setEditing(null)}
            onSave={(value) => {
              change({ cases: editing.index < 0 ? [...draft.cases, value] : draft.cases.map((entry, position) => (position === editing.index ? value : entry)) });
              setEditing(null);
            }}
          />
        ))}
      {pasting && (
        <ImportCasesModal
          onClose={() => setPasting(false)}
          onImport={(cases) => {
            change({ cases: [...draft.cases, ...cases] });
            setPasting(false);
          }}
        />
      )}
    </div>
  );
}
