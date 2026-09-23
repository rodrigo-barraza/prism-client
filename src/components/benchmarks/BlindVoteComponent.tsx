"use client";

/**
 * Blind review of a run: two contestants' answers to the same case, names
 * hidden, sides random. Vote, see who was who, next. The server picks
 * the pair of contestants with the fewest votes so far.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Equal, ThumbsDown } from "lucide-react";
import { ButtonComponent, LoadingStateComponent, MarkdownContentComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi, { type BlindPair } from "../../services/BenchmarkApi";
import type { BattleWinner } from "../../types/benchmarks";
import { getErrorMessage } from "../../utils/errorMessage";
import styles from "./Benchmarks.module.css";
import arena from "./Arena.module.css";

export default function BlindVoteComponent({ runId, onVoted }: { runId: string; onVoted?: () => void }) {
  const [pair, setPair] = useState<BlindPair | null | undefined>(undefined);
  const [reveal, setReveal] = useState<{ a: string; b: string; winner: BattleWinner } | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState(0);

  const fetchPair = useCallback(
    () =>
      BenchmarkApi.nextBlindPair(runId)
        .then(setPair)
        .catch((caught) => setError(getErrorMessage(caught))),
    [runId],
  );

  useEffect(() => {
    void fetchPair();
  }, [fetchPair]);

  const next = () => {
    setReveal(null);
    setError(null);
    void fetchPair();
  };

  const vote = async (winner: BattleWinner) => {
    if (!pair) return;
    setVoting(true);
    try {
      const result = await BenchmarkApi.voteBlind(runId, { aSampleId: pair.a.sampleId, bSampleId: pair.b.sampleId, winner });
      setReveal({ ...result.reveal, winner });
      setVotes((count) => count + 1);
      onVoted?.();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setVoting(false);
    }
  };

  if (error) return <p className={styles["error-text"]}>{error}</p>;
  if (pair === undefined) return <LoadingStateComponent message="Finding a pair…" />;
  if (pair === null) {
    return (
      <div className={`${styles["card"]} ${styles["empty"]}`}>
        {votes > 0 ? `Done — ${votes} vote${votes === 1 ? "" : "s"} this session. ` : ""}Every pair of answers in this run has a vote.
      </div>
    );
  }

  const winnerText = (side: "a" | "b") =>
    reveal ? (reveal.winner === side ? "preferred" : reveal.winner === "tie" ? "tie" : reveal.winner === "both_bad" ? "both bad" : "") : "";

  return (
    <div className={styles["section"]}>
      <div className={styles["card"]}>
        <div className={`${styles["small"]} ${styles["muted"]}`}>
          Case {pair.caseId}
          {pair.epoch > 1 ? ` · epoch ${pair.epoch}` : ""} · {pair.remaining} pair{pair.remaining === 1 ? "" : "s"} left
        </div>
        {pair.systemPrompt && <pre className={styles["code-block"]} style={{ marginBlockStart: 8 }}>{pair.systemPrompt}</pre>}
        <div style={{ marginBlockStart: 8 }}>
          <MarkdownContentComponent content={pair.prompt} />
        </div>
      </div>
      <div className={arena["sides"]}>
        {(["a", "b"] as const).map((side) => (
          <div key={side} className={`${styles["card"]} ${arena["side"]}`}>
            <div className={arena["side-header"]}>
              <strong>{reveal ? reveal[side] : `Answer ${side.toUpperCase()}`}</strong>
              {reveal && <span className={styles["chip"]}>{winnerText(side) || "—"}</span>}
            </div>
            <div className={arena["side-body"]}>
              <MarkdownContentComponent content={pair[side].output || "_(empty answer)_"} />
            </div>
          </div>
        ))}
      </div>
      {reveal ? (
        <div className={styles["row"]} style={{ justifyContent: "center" }}>
          <ButtonComponent variant="primary" icon={ArrowRight} onClick={next}>
            Next pair
          </ButtonComponent>
        </div>
      ) : (
        <div className={arena["vote-row"]}>
          <ButtonComponent variant="secondary" disabled={voting} onClick={() => void vote("a")}>
            A is better
          </ButtonComponent>
          <ButtonComponent variant="secondary" icon={Equal} disabled={voting} onClick={() => void vote("tie")}>
            Tie
          </ButtonComponent>
          <ButtonComponent variant="secondary" icon={ThumbsDown} disabled={voting} onClick={() => void vote("both_bad")}>
            Both bad
          </ButtonComponent>
          <ButtonComponent variant="secondary" disabled={voting} onClick={() => void vote("b")}>
            B is better
          </ButtonComponent>
        </div>
      )}
    </div>
  );
}
