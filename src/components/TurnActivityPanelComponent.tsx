"use client";

import { CheckSquare, Square, Loader, HelpCircle, Globe, Code2, ListChecks, NotebookPen } from "lucide-react";
import { MarkdownContentComponent as MarkdownContent } from "@rodrigo-barraza/components-library";
import { hasTurnActivity, type TodoItem, type TurnActivity } from "../utils/turnActivity";
import styles from "./TurnActivityPanelComponent.module.css";

const TODO_STATUS: Record<string, { label: string; Icon: typeof Square }> = {
  completed: { label: "Done", Icon: CheckSquare },
  in_progress: { label: "In progress", Icon: Loader },
  pending: { label: "To do", Icon: Square },
};

function TodoRow({ item }: { item: TodoItem }) {
  const { label, Icon } = TODO_STATUS[item.status] ?? TODO_STATUS.pending;
  return (
    <li className={`${styles['check-row']} ${item.status === "completed" ? styles['check-done'] : ""}`}>
      <Icon size={13} className={styles['check-icon']} aria-label={label} role="img" />
      <span>{item.content}</span>
    </li>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * A turn's side-channel output that has no message of its own: the agent's
 * checklist and brief, the web sources it searched, and provider code runs.
 */
export default function TurnActivityPanelComponent({ activity }: { activity: TurnActivity }) {
  if (!hasTurnActivity(activity)) return null;
  const { todos, brief, sources, codeRuns } = activity;
  const doneCount = todos?.filter((item) => item.status === "completed").length ?? 0;

  return (
    <section className={`turn-activity-panel-component ${styles['panel']}`} aria-label="Turn activity">
      {todos && todos.length > 0 && (
        <details open className={styles['section']}>
          <summary className={styles['summary']}>
            <ListChecks size={13} />
            Checklist
            <span className={styles['count']}>{doneCount}/{todos.length} done</span>
          </summary>
          <ul className={styles['checklist']} aria-label="Checklist">
            {todos.map((item, index) => (
              <TodoRow key={`${index}-${item.content}`} item={item} />
            ))}
          </ul>
        </details>
      )}

      {brief && (
        <details open className={styles['section']}>
          <summary className={styles['summary']}>
            <NotebookPen size={13} />
            Brief
          </summary>
          <p className={styles['brief-summary']}>{brief.summary}</p>
          {brief.keyFiles.length > 0 && (
            <ul className={styles['key-files']} aria-label="Key files">
              {brief.keyFiles.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          )}
          {brief.openQuestions.length > 0 && (
            <ul className={styles['checklist']} aria-label="Open questions">
              {brief.openQuestions.map((question) => (
                <li key={question} className={styles['check-row']}>
                  <HelpCircle size={13} className={styles['check-icon']} aria-label="Open" role="img" />
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {sources.length > 0 && (
        <details open className={styles['section']}>
          <summary className={styles['summary']}>
            <Globe size={13} />
            Sources
            <span className={styles['count']}>{sources.length}</span>
          </summary>
          <ol className={styles['sources']} aria-label="Sources">
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title || hostOf(source.url)}
                </a>
                <span className={styles['source-host']}>{hostOf(source.url)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {codeRuns.map((run, index) => (
        <details open className={styles['section']} key={index}>
          <summary className={styles['summary']}>
            <Code2 size={13} />
            Code execution{codeRuns.length > 1 ? ` ${index + 1}` : ""}
            {run.outcome && (
              <span
                className={`${styles['count']} ${/ok/i.test(run.outcome) ? styles['outcome-ok'] : styles['outcome-failed']}`}
              >
                {run.outcome.replace(/^OUTCOME_/, "").toLowerCase()}
              </span>
            )}
          </summary>
          {run.code && (
            <MarkdownContent content={`\`\`\`${run.language}\n${run.code}\n\`\`\``} />
          )}
          {run.output !== undefined ? (
            <figure className={styles['output']}>
              <figcaption>Output</figcaption>
              <pre>{run.output || "(no output)"}</pre>
            </figure>
          ) : (
            <p className={styles['running']}>Running…</p>
          )}
        </details>
      ))}
    </section>
  );
}
