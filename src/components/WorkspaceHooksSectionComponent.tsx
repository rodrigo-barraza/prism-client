"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderGit2, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./WorkspaceHooksSectionComponent.module.css";
import type { WorkspaceHookFile, WorkspaceHooks } from "../types/types";

/** How much of a file's sha256 a row shows. */
const SHORT_SHA_LENGTH = 12;

interface WorkspaceHooksSectionProps {
  /** The conversation's workspace root. */
  root: string;
  /** A viewer of someone else's conversation: no trust to give. */
  readOnly?: boolean;
}

function HookFileRow({
  file,
  ownerAllowed,
  readOnly,
  isBusy,
  onTrust,
  onRevoke,
}: {
  file: WorkspaceHookFile;
  ownerAllowed: boolean;
  readOnly: boolean;
  isBusy: boolean;
  onTrust: (_file: WorkspaceHookFile) => void;
  onRevoke: (_file: WorkspaceHookFile) => void;
}) {
  const TrustIcon = file.trusted ? ShieldCheck : ShieldOff;
  return (
    <div className={styles["file"]} data-hooks-file={file.path}>
      <div className={styles["file-title-line"]}>
        <span className={styles["scope-chip"]}>{file.scope === "user" ? "User" : "Project"}</span>
        <code className={styles["file-path"]} title={file.path}>
          {file.path}
        </code>
      </div>
      <div className={styles["file-meta"]}>
        <code className={styles["sha"]} title={`sha256 ${file.sha256}`}>
          {file.sha256.slice(0, SHORT_SHA_LENGTH)}
        </code>
        <span className={`${styles["trust-state"]} ${file.trusted ? styles["trusted"] : styles["untrusted"]}`}>
          <TrustIcon size={11} aria-hidden="true" />
          {file.trusted ? "Trusted" : "Not trusted"}
        </span>
        {!readOnly &&
          (file.trusted ? (
            <button
              type="button"
              className={`${styles["trust-button"]} ${styles["revoke-button"]}`}
              onClick={() => onRevoke(file)}
              disabled={isBusy}
              aria-label={`Revoke trust in ${file.path}`}
            >
              Revoke
            </button>
          ) : (
            <button
              type="button"
              className={styles["trust-button"]}
              onClick={() => onTrust(file)}
              disabled={isBusy || !ownerAllowed}
              aria-label={`Trust ${file.path}`}
              title={
                ownerAllowed
                  ? `Run this file's commands at sha256 ${file.sha256.slice(0, SHORT_SHA_LENGTH)} — any change needs trusting again`
                  : "Command hooks are disabled for your account"
              }
            >
              Trust
            </button>
          ))}
      </div>
      {file.error && <div className={styles["file-error"]}>Not read: {file.error} — none of its hooks run.</div>}
      {file.summary.length > 0 ? (
        <table className={styles["summary"]}>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Matcher</th>
              <th scope="col">Command</th>
            </tr>
          </thead>
          <tbody>
            {file.summary.map((row, index) => (
              <tr key={`${row.event}-${index}`}>
                <td>{row.event}</td>
                <td>{row.matcher ? <code>{row.matcher}</code> : <span className={styles["muted"]}>all</span>}</td>
                <td>
                  <code className={styles["command"]}>{row.command}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !file.error && <div className={styles["hint"]}>No command hooks in this file.</div>
      )}
      {file.skipped && file.skipped.length > 0 && (
        <details className={styles["skipped"]}>
          <summary>{file.skipped.length} skipped</summary>
          <ul>
            {file.skipped.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * WorkspaceHooksSectionComponent — the repository hooks that apply to a
 * workspace root: the nearest `.prism/hooks.json` in the repository and the
 * user's own `~/.prism/hooks.json`, in Claude Code's / Codex's schema. Their
 * command hooks run in the repository only for an owner listed in
 * PRISM_HOOK_COMMAND_OWNERS, and only once that user trusted the file at
 * its current content: a changed file is untrusted until trusted again.
 */
export default function WorkspaceHooksSectionComponent({ root, readOnly = false }: WorkspaceHooksSectionProps) {
  const [loaded, setLoaded] = useState<{ root: string; hooks: WorkspaceHooks | null; error: string | null } | null>(
    null,
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Bumped after a trust changes: the files are listed again.
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    PrismService.getWorkspaceHooks(root).then(
      (hooks) => {
        if (!isCancelled) setLoaded({ root, hooks, error: null });
      },
      (error: unknown) => {
        if (!isCancelled) setLoaded({ root, hooks: null, error: getErrorMessage(error) });
      },
    );
    return () => {
      isCancelled = true;
    };
  }, [root, listVersion]);

  const changeTrust = useCallback(async (file: WorkspaceHookFile, trust: boolean) => {
    setBusyPath(file.path);
    setActionError(null);
    try {
      if (trust) await PrismService.trustWorkspaceHooks(file.path, file.sha256);
      else await PrismService.revokeWorkspaceHooks(file.path);
      setListVersion((version) => version + 1);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyPath(null);
    }
  }, []);

  // What was loaded for another root is not this one's.
  const current = loaded?.root === root ? loaded : null;
  const hooks = current?.hooks ?? null;
  return (
    <section className={`workspace-hooks-section-component ${styles["section"]}`} aria-label="Workspace hooks">
      <div className={styles["header"]}>
        <FolderGit2 size={13} aria-hidden="true" />
        <span className={styles["title"]}>Workspace hooks</span>
        <code className={styles["root"]} title={root}>
          {root}
        </code>
      </div>
      <span className={styles["hint"]}>
        <code>.prism/hooks.json</code> in the repository and in your home directory. Their commands run in the
        repository once you trust the file; a changed file needs trusting again.
      </span>
      {hooks && !hooks.ownerAllowed && (
        <div className={styles["owner-note"]} role="note">
          <ShieldAlert size={12} aria-hidden="true" />
          <span>
            Command hooks are disabled for your account: they run only for owners listed in{" "}
            <code>PRISM_HOOK_COMMAND_OWNERS</code>, so these files do not run for you.
          </span>
        </div>
      )}
      {!current && <span className={styles["hint"]}>Loading…</span>}
      {current?.error && (
        <span className={styles["error"]} role="alert">
          {current.error}
        </span>
      )}
      {hooks && hooks.files.length === 0 && (
        <span className={styles["hint"]}>No hooks file applies to this workspace.</span>
      )}
      {hooks?.files.map((file) => (
        <HookFileRow
          key={file.path}
          file={file}
          ownerAllowed={hooks.ownerAllowed}
          readOnly={readOnly}
          isBusy={busyPath !== null}
          onTrust={(target) => void changeTrust(target, true)}
          onRevoke={(target) => void changeTrust(target, false)}
        />
      ))}
      {actionError && (
        <span className={styles["error"]} role="alert">
          {actionError}
        </span>
      )}
    </section>
  );
}
