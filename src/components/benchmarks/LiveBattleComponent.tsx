"use client";

/**
 * A live battle: your prompt, two contestants answering side by side in
 * real time with their names hidden (the server shuffles them onto the
 * sides), then your vote — and only then who was who.
 */
import { useRef, useState } from "react";
import { Equal, Shuffle, Swords, ThumbsDown } from "lucide-react";
import { ButtonComponent, MarkdownContentComponent, StreamingCursorComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi, { type LiveBattleEvent } from "../../services/BenchmarkApi";
import type { BattleWinner, ContestantSpec } from "../../types/benchmarks";
import type { PrismConfig } from "../../types/types";
import { duration, money } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import ContestantEditorComponent, { type AgentOption } from "./ContestantEditorComponent";
import styles from "./Benchmarks.module.css";
import arena from "./Arena.module.css";

interface SideState {
  text: string;
  thinking: string;
  tools: string[];
  done: boolean;
  latencyMs: number | null;
  cost: number | null;
  error: string | null;
}

const emptySide = (): SideState => ({ text: "", thinking: "", tools: [], done: false, latencyMs: null, cost: null, error: null });

export default function LiveBattleComponent({
  config,
  agents,
  initial,
  pool,
}: {
  config: PrismConfig | null;
  agents: AgentOption[];
  initial: [ContestantSpec, ContestantSpec];
  /** Contestants "Random pair" draws from (the leaderboard's). */
  pool: ContestantSpec[];
}) {
  const [contestants, setContestants] = useState<[ContestantSpec, ContestantSpec]>(initial);
  const [prompt, setPrompt] = useState("");
  const [sides, setSides] = useState<{ a: SideState; b: SideState } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ a: string; b: string; winner: BattleWinner } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSides({ a: emptySide(), b: emptySide() });
    setToken(null);
    setReveal(null);
    setError(null);
    setRunning(true);
    const update = (side: "a" | "b", patch: (state: SideState) => Partial<SideState>) =>
      setSides((current) => (current ? { ...current, [side]: { ...current[side], ...patch(current[side]) } } : current));
    try {
      await BenchmarkApi.liveBattle(
        { prompt, contestants },
        (event: LiveBattleEvent) => {
          if (event.type === "side") update(event.side, (state) => (event.kind === "text" ? { text: state.text + event.content } : { thinking: state.thinking + event.content }));
          else if (event.type === "side_tool") update(event.side, (state) => ({ tools: state.tools.includes(event.name) ? state.tools : [...state.tools, event.name] }));
          else if (event.type === "side_done") update(event.side, () => ({ done: true, latencyMs: event.latencyMs, cost: event.cost, error: event.error }));
          else if (event.type === "ready") setToken(event.token);
          else if (event.type === "error") setError(event.message);
        },
        controller.signal,
      );
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      setRunning(false);
    }
  };

  const vote = async (winner: BattleWinner) => {
    if (!token) return;
    try {
      const result = await BenchmarkApi.voteLive(token, winner);
      setReveal({ ...result.reveal, winner });
      setToken(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const randomPair = () => {
    if (pool.length < 2) return;
    const first = Math.floor(Math.random() * pool.length);
    let second = Math.floor(Math.random() * (pool.length - 1));
    if (second >= first) second++;
    setContestants([pool[first], pool[second]]);
  };

  return (
    <div className={styles["section"]}>
      <div className={arena["sides"]}>
        {([0, 1] as const).map((index) => (
          <div key={index} className={styles["card"]}>
            <div className={`${styles["field-label"]}`} style={{ marginBlockEnd: 8 }}>
              Contestant {index + 1} <span className={styles["muted"]}>(hidden until you vote)</span>
            </div>
            <ContestantEditorComponent
              value={contestants[index]}
              onChange={(spec) => setContestants((current) => (index === 0 ? [spec, current[1]] : [current[0], spec]))}
              config={config}
              agents={agents}
              compact
            />
          </div>
        ))}
      </div>
      <label className={styles["field"]}>
        <span className={styles["field-label"]}>Your prompt</span>
        <textarea
          className={styles["native-textarea"]}
          value={prompt}
          placeholder="Ask anything — a question from your own work beats any public benchmark for telling you which one you'd rather use."
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && prompt.trim() && !running) void start();
          }}
        />
      </label>
      <div className={styles["row"]}>
        <ButtonComponent variant="primary" icon={Swords} loading={running} disabled={!prompt.trim() || running} onClick={() => void start()}>
          Battle
        </ButtonComponent>
        {pool.length >= 2 && (
          <ButtonComponent variant="secondary" icon={Shuffle} disabled={running} onClick={randomPair}>
            Random pair
          </ButtonComponent>
        )}
        {error && <span className={styles["error-text"]}>{error}</span>}
      </div>
      {sides && (
        <>
          <div className={arena["sides"]}>
            {(["a", "b"] as const).map((side) => {
              const state = sides[side];
              return (
                <div key={side} className={`${styles["card"]} ${arena["side"]}`}>
                  <div className={arena["side-header"]}>
                    <strong>{reveal ? reveal[side] : `Assistant ${side.toUpperCase()}`}</strong>
                    {reveal && (
                      <span className={styles["chip"]}>
                        {reveal.winner === side ? "preferred" : reveal.winner === "tie" ? "tie" : reveal.winner === "both_bad" ? "both bad" : "—"}
                      </span>
                    )}
                  </div>
                  {state.tools.length > 0 && <div className={arena["side-meta"]}>tools: {state.tools.join(", ")}</div>}
                  {state.thinking && !state.text && <div className={arena["thinking"]}>{state.thinking}</div>}
                  <div className={arena["side-body"]}>
                    {state.text ? <MarkdownContentComponent content={state.text} /> : !state.done && <StreamingCursorComponent active standalone />}
                    {state.error && <p className={styles["error-text"]}>{state.error}</p>}
                  </div>
                  {state.done && (
                    <div className={arena["side-meta"]}>
                      {duration(state.latencyMs)}
                      {reveal && state.cost !== null ? ` · ${money(state.cost)}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {token && !reveal && (
            <div className={arena["vote-row"]}>
              <ButtonComponent variant="secondary" onClick={() => void vote("a")}>
                A is better
              </ButtonComponent>
              <ButtonComponent variant="secondary" icon={Equal} onClick={() => void vote("tie")}>
                Tie
              </ButtonComponent>
              <ButtonComponent variant="secondary" icon={ThumbsDown} onClick={() => void vote("both_bad")}>
                Both bad
              </ButtonComponent>
              <ButtonComponent variant="secondary" onClick={() => void vote("b")}>
                B is better
              </ButtonComponent>
            </div>
          )}
        </>
      )}
    </div>
  );
}
