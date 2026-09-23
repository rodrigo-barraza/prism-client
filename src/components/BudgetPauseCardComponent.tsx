"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import styles from "./BudgetPauseCardComponent.module.css";
import {
  dollarPlaces,
  formatDollars,
  minimumCapDollars,
  suggestedCapDollars,
  type BudgetPause,
} from "../utils/budgetPause";

/**
 * The card of a turn paused at its cost cap (prism-service prompt 13,
 * Landing 3): what it spent against which cap, a new cap to raise it to,
 * and Stop. The turn resumes as soon as the server takes the raise. Keyed by
 * `pauseId` where it is mounted, so a new pause proposes its own cap.
 */
export interface BudgetPauseCardProps {
  pause: BudgetPause;
  isBusy?: boolean;
  error?: string | null;
  onRaise: (_maxCostDollars: number) => void;
  onStop: () => void;
}

export default function BudgetPauseCardComponent({
  pause,
  isBusy = false,
  error = null,
  onRaise,
  onStop,
}: BudgetPauseCardProps) {
  const isGoalBudget = pause.limitedBy === "goal" && pause.goalMaxCostDollars !== null;
  const minimum = minimumCapDollars(pause);
  const places = dollarPlaces(pause.spentDollars, pause.maxCostDollars, pause.goalMaxCostDollars, minimum);
  const dollars = (amount: number) => formatDollars(amount, places);
  const [amount, setAmount] = useState(() => suggestedCapDollars(pause).toFixed(2));
  const [inputError, setInputError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= minimum) {
      setInputError(`Enter more than ${dollars(minimum)} — the turn would stop at the cap again.`);
      return;
    }
    setInputError(null);
    onRaise(value);
  };

  const shownError = inputError ?? error;
  return (
    <div
      className={`budget-pause-card-component ${styles["card"]}`}
      role="group"
      aria-label="Budget reached"
      aria-busy={isBusy}
    >
      <div className={styles["header"]}>
        <Wallet size={16} className={styles["icon"]} aria-hidden="true" />
        <span className={styles["title"]}>Budget reached</span>
        <span className={styles["header-status"]}>
          <span className={styles["header-status-dot"]} />
          {isBusy ? "Sending…" : "Paused — waiting for you"}
        </span>
      </div>

      <p className={styles["summary"]}>
        {isGoalBudget ? (
          <>
            This turn spent <strong>{dollars(pause.spentDollars)}</strong> — all of the{" "}
            <strong>{dollars(pause.maxCostDollars)}</strong> left in the goal&apos;s{" "}
            {dollars(pause.goalMaxCostDollars!)} budget. Raise the goal&apos;s budget to let the agent continue.
          </>
        ) : (
          <>
            This turn spent <strong>{dollars(pause.spentDollars)}</strong> of its{" "}
            <strong>{dollars(pause.maxCostDollars)}</strong> cap. Raise the cap to let the agent continue.
          </>
        )}
      </p>

      {shownError && (
        <div className={styles["error"]} role="alert">
          {shownError}
        </div>
      )}

      <form
        className={styles["actions"]}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className={styles["amount"]}>
          <span className={styles["amount-label"]}>{isGoalBudget ? "Goal budget" : "New cap"} $</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            disabled={isBusy}
            aria-label={isGoalBudget ? "New goal budget in dollars" : "New cost cap in dollars"}
            onChange={(event) => setAmount(event.target.value)}
            className={styles["amount-input"]}
          />
        </label>
        <button type="submit" className={styles["raise-button"]} disabled={isBusy}>
          Raise budget
        </button>
        <button type="button" className={styles["stop-button"]} disabled={isBusy} onClick={onStop}>
          Stop
        </button>
      </form>
    </div>
  );
}
