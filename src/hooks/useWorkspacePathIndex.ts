"use client";

/**
 * The workspace's paths, flattened (five levels deep): what the composer's
 * `@` menu offers, and what the transcript's mention badges check a path
 * against (a badge to a path that no longer exists shows as stale).
 *
 * Loaded on mount and whenever the agent changed the tree (`refreshKey`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import WorkspaceService from "../services/WorkspaceService";
import { flattenTree } from "../utils/mentionUtils";

export type WorkspacePathEntry = ReturnType<typeof flattenTree>[number];

export default function useWorkspacePathIndex(workspacePath: string | undefined, refreshKey: number) {
  const [entries, setEntries] = useState<WorkspacePathEntry[] | null>(null);
  const [knownPaths, setKnownPaths] = useState<string[] | undefined>(undefined);
  const hasEntriesRef = useRef(false);
  const isLoadingRef = useRef(false);

  const ensure = useCallback(async () => {
    if (hasEntriesRef.current || isLoadingRef.current) return;
    if (!workspacePath) return;
    isLoadingRef.current = true;
    try {
      const data = await WorkspaceService.tree(workspacePath, 5);
      if (data?.tree) {
        const flat = flattenTree(data.tree);
        hasEntriesRef.current = true;
        setEntries(flat);
        setKnownPaths(
          flat
            .map((entry) => entry.path)
            .filter((filePath): filePath is string => typeof filePath === "string"),
        );
      }
    } catch {
      /* autocomplete unavailable */
    }
    isLoadingRef.current = false;
  }, [workspacePath]);

  // The agent changed the tree: start over.
  useEffect(() => {
    hasEntriesRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setEntries(null);
    setKnownPaths(undefined);
    // Re-fetch immediately so knownPaths is available for badge staleness
    ensure();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eagerly populate knownPaths on mount so message list badges can
  // detect staleness without waiting for the user to type @.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    ensure();
  }, [ensure]);

  return { entries, knownPaths, ensure };
}

export type WorkspacePathIndex = ReturnType<typeof useWorkspacePathIndex>;
