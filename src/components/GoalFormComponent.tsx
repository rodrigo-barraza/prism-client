"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus, X, Check } from "lucide-react";
import type {
  ConversationGoal,
  ConversationGoalBudget,
  ConversationGoalInput,
  ModelsMap,
} from "../types/types";
import styles from "./GoalFormComponent.module.css";

/** What the service accepts for `maxIterations`. */
export const GOAL_MAX_ITERATIONS_LIMIT = 20;
export const DEFAULT_GOAL_MAX_ITERATIONS = 3;

interface GoalFormComponentProps {
  /** Prefill: the goal being edited, or a proposal being edited before approval. */
  initial?: ConversationGoal | null;
  /** `edit` saves over the current goal (PATCH); `create` sets a new one (PUT). */
  mode: "create" | "edit";
  /** Text models for the verifier picker (`config.textToText.models`). */
  models?: ModelsMap | null;
  isBusy?: boolean;
  onSubmit: (_input: ConversationGoalInput) => unknown;
  onCancel: () => void;
}

interface CriterionRow {
  key: number;
  id?: string;
  criterion: string;
}

type FieldErrors = Partial<
  Record<"objective" | "rubric" | "maxCost" | "maxTurns" | "deadline" | "maxIterations", string>
>;

const VERIFIER_DEFAULT = "";
const VERIFIER_SEPARATOR = "::";

function toLocalDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialCriteria(goal: ConversationGoal | null | undefined): CriterionRow[] {
  const source = goal?.rubric?.length
    ? goal.rubric
    : goal?.completionCriteria
      ? [{ id: undefined, criterion: goal.completionCriteria }]
      : [];
  const rows = source.map((entry, index) => ({ key: index, id: entry.id, criterion: entry.criterion }));
  return rows.length > 0 ? rows : [{ key: 0, criterion: "" }];
}

/**
 * Validate the form. Returns the request body, or the errors to show —
 * never both.
 */
export function validateGoalForm(values: {
  objective: string;
  criteria: Array<{ id?: string; criterion: string }>;
  maxCost: string;
  maxTurns: string;
  deadline: string;
  verifier: string;
  maxIterations: string;
}): { input: ConversationGoalInput; errors: null } | { input: null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const objective = values.objective.trim();
  if (!objective) errors.objective = "Describe what done means.";

  const rubric = values.criteria
    .map((row) => ({ ...(row.id && { id: row.id }), criterion: row.criterion.trim() }))
    .filter((row) => row.criterion);
  if (rubric.length === 0) errors.rubric = "Add at least one criterion the verifier can check.";

  const budget: ConversationGoalBudget = {};
  if (values.maxCost.trim()) {
    const dollars = Number(values.maxCost);
    if (!Number.isFinite(dollars) || dollars <= 0) errors.maxCost = "A dollar budget must be a positive number.";
    else budget.maxCostDollars = dollars;
  }
  if (values.maxTurns.trim()) {
    const turns = Number(values.maxTurns);
    if (!Number.isInteger(turns) || turns < 1) errors.maxTurns = "Max turns must be a whole number of 1 or more.";
    else budget.maxTurns = turns;
  }
  if (values.deadline.trim()) {
    const time = Date.parse(values.deadline);
    if (Number.isNaN(time)) errors.deadline = "Enter a valid deadline.";
    else budget.deadline = new Date(time).toISOString();
  }

  const maxIterations = Number(values.maxIterations);
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > GOAL_MAX_ITERATIONS_LIMIT) {
    errors.maxIterations = `Max revisions must be a whole number from 1 to ${GOAL_MAX_ITERATIONS_LIMIT}.`;
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };

  const [provider, model] = values.verifier
    ? values.verifier.split(VERIFIER_SEPARATOR)
    : [undefined, undefined];
  return {
    input: {
      objective,
      rubric,
      verifier: provider && model ? { provider, model } : null,
      maxIterations,
      budget: Object.keys(budget).length > 0 ? budget : null,
    },
    errors: null,
  };
}

/**
 * The goal form: what "done" means (description + rubric criteria), the
 * budgets, the model that verifies it and how many revisions it may ask
 * for. Used to create a goal, to edit one in place, and to edit a
 * proposal before approving it.
 */
export default function GoalFormComponent({
  initial,
  mode,
  models,
  isBusy = false,
  onSubmit,
  onCancel,
}: GoalFormComponentProps) {
  const formId = useId();
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [criteria, setCriteria] = useState<CriterionRow[]>(() => initialCriteria(initial));
  const [nextKey, setNextKey] = useState(() => criteria.length);
  const [maxCost, setMaxCost] = useState(
    initial?.budget?.maxCostDollars !== undefined ? String(initial.budget.maxCostDollars) : "",
  );
  const [maxTurns, setMaxTurns] = useState(
    initial?.budget?.maxTurns !== undefined ? String(initial.budget.maxTurns) : "",
  );
  const [deadline, setDeadline] = useState(toLocalDateTime(initial?.budget?.deadline));
  const [verifier, setVerifier] = useState(
    initial?.verifier ? `${initial.verifier.provider}${VERIFIER_SEPARATOR}${initial.verifier.model}` : VERIFIER_DEFAULT,
  );
  const [maxIterations, setMaxIterations] = useState(
    String(initial?.maxIterations ?? DEFAULT_GOAL_MAX_ITERATIONS),
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const verifierGroups = useMemo(() => {
    const groups = Object.entries(models ?? {})
      .map(([provider, list]) => ({
        provider,
        options: (list ?? []).map((model) => ({
          value: `${provider}${VERIFIER_SEPARATOR}${model.name}`,
          label: model.label || model.display_name || model.name,
        })),
      }))
      .filter((group) => group.options.length > 0);
    // A verifier the catalog no longer lists stays selectable.
    if (verifier && !groups.some((group) => group.options.some((option) => option.value === verifier))) {
      const [provider, model] = verifier.split(VERIFIER_SEPARATOR);
      groups.unshift({ provider, options: [{ value: verifier, label: model }] });
    }
    return groups;
  }, [models, verifier]);

  const fieldId = (name: string) => `${formId}-${name}`;
  const errorId = (name: keyof FieldErrors) => (errors[name] ? `${formId}-${name}-error` : undefined);

  const addCriterion = () => {
    setCriteria((rows) => [...rows, { key: nextKey, criterion: "" }]);
    setNextKey((key) => key + 1);
  };
  const removeCriterion = (key: number) =>
    setCriteria((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  const editCriterion = (key: number, criterion: string) =>
    setCriteria((rows) => rows.map((row) => (row.key === key ? { ...row, criterion } : row)));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateGoalForm({ objective, criteria, maxCost, maxTurns, deadline, verifier, maxIterations });
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void onSubmit(result.input);
  };

  const errorText = (name: keyof FieldErrors) =>
    errors[name] ? (
      <div id={`${formId}-${name}-error`} className={styles["field-error"]} role="alert">
        {errors[name]}
      </div>
    ) : null;

  return (
    <form
      className={`goal-form-component ${styles["form"]}`}
      aria-label={mode === "edit" ? "Edit goal" : "New goal"}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className={styles["field"]}>
        <label className={styles["field-label"]} htmlFor={fieldId("objective")}>
          Goal
        </label>
        <textarea
          id={fieldId("objective")}
          className={styles["input"]}
          rows={2}
          value={objective}
          placeholder="What does done mean? e.g. Create report.md summarizing the workspace"
          onChange={(event) => setObjective(event.target.value)}
          aria-invalid={!!errors.objective}
          aria-describedby={errorId("objective")}
        />
        {errorText("objective")}
      </div>

      <fieldset className={styles["fieldset"]} aria-describedby={errorId("rubric")}>
        <legend className={styles["field-label"]}>Done when — every criterion holds</legend>
        <ol className={styles["criteria"]}>
          {criteria.map((row, index) => (
            <li key={row.key} className={styles["criterion-row"]}>
              <input
                className={styles["input"]}
                value={row.criterion}
                placeholder={index === 0 ? "e.g. report.md exists in the workspace" : "Another checkable criterion"}
                aria-label={`Criterion ${index + 1}`}
                onChange={(event) => editCriterion(row.key, event.target.value)}
              />
              <button
                type="button"
                className={styles["icon-button"]}
                onClick={() => removeCriterion(row.key)}
                disabled={criteria.length === 1}
                aria-label={`Remove criterion ${index + 1}`}
                title="Remove criterion"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={styles["add-button"]} onClick={addCriterion}>
          <Plus size={12} />
          Add criterion
        </button>
        {errorText("rubric")}
      </fieldset>

      <div className={styles["grid"]}>
        <div className={styles["field"]}>
          <label className={styles["field-label"]} htmlFor={fieldId("max-cost")}>
            Max spend ($)
          </label>
          <input
            id={fieldId("max-cost")}
            className={styles["input"]}
            inputMode="decimal"
            value={maxCost}
            placeholder="No limit"
            onChange={(event) => setMaxCost(event.target.value)}
            aria-invalid={!!errors.maxCost}
            aria-describedby={errorId("maxCost")}
          />
          {errorText("maxCost")}
        </div>
        <div className={styles["field"]}>
          <label className={styles["field-label"]} htmlFor={fieldId("max-turns")}>
            Max turns
          </label>
          <input
            id={fieldId("max-turns")}
            className={styles["input"]}
            inputMode="numeric"
            value={maxTurns}
            placeholder="No limit"
            onChange={(event) => setMaxTurns(event.target.value)}
            aria-invalid={!!errors.maxTurns}
            aria-describedby={errorId("maxTurns")}
          />
          {errorText("maxTurns")}
        </div>
        <div className={styles["field"]}>
          <label className={styles["field-label"]} htmlFor={fieldId("deadline")}>
            Deadline
          </label>
          <input
            id={fieldId("deadline")}
            className={styles["input"]}
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            aria-invalid={!!errors.deadline}
            aria-describedby={errorId("deadline")}
          />
          {errorText("deadline")}
        </div>
        <div className={styles["field"]}>
          <label className={styles["field-label"]} htmlFor={fieldId("max-iterations")}>
            Max revisions
          </label>
          <input
            id={fieldId("max-iterations")}
            className={styles["input"]}
            inputMode="numeric"
            value={maxIterations}
            onChange={(event) => setMaxIterations(event.target.value)}
            aria-invalid={!!errors.maxIterations}
            aria-describedby={errorId("maxIterations")}
          />
          {errorText("maxIterations")}
        </div>
      </div>

      <div className={styles["field"]}>
        <label className={styles["field-label"]} htmlFor={fieldId("verifier")}>
          Verifier
        </label>
        <select
          id={fieldId("verifier")}
          className={styles["input"]}
          value={verifier}
          onChange={(event) => setVerifier(event.target.value)}
        >
          <option value={VERIFIER_DEFAULT}>Default — a model on another provider</option>
          {verifierGroups.map((group) => (
            <optgroup key={group.provider} label={group.provider}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className={styles["form-actions"]}>
        <button type="button" className={styles["secondary-button"]} onClick={onCancel} disabled={isBusy}>
          Cancel
        </button>
        <button type="submit" className={styles["primary-button"]} disabled={isBusy}>
          <Check size={12} />
          {mode === "edit" ? "Save goal" : "Set goal"}
        </button>
      </div>
    </form>
  );
}
