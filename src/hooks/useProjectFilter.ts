"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import IrisService from "../services/IrisService";
import { LS_ADMIN_PROJECT_FILTER } from "../constants";

/**
 * Reusable hook for admin project filtering.
 * Fetches available projects, builds dropdown options, and manages the
 * `?project=` URL search param. Persists the selection in localStorage
 * so it survives page navigations and reloads.
 */
export default function useProjectFilter(enabled = true) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasRestoredRef = useRef<boolean>(false);

  const urlProject = searchParams.get("project") || null;
  const [projects, setProjects] = useState<string[]>([]);

  // On mount, restore from localStorage if no URL param is present
  useEffect(() => {
    if (!enabled) return;
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    if (!urlProject) {
      try {
        const saved = localStorage.getItem(LS_ADMIN_PROJECT_FILTER);
        if (saved) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", saved);
          router.replace(`${pathname}?${params.toString()}`);
        }
      } catch {
        /* localStorage unavailable */
      }
    }
  }, [enabled, urlProject, pathname, router, searchParams]);

  useEffect(() => {
    if (!enabled) return;
    IrisService.getConversationFilters()
      .then((data) =>
        setProjects((data as { projects?: string[] }).projects || []),
      )
      .catch(() => {});
  }, [enabled]);

  const projectOptions = useMemo(
    () => [
      { value: "", label: "All Projects" },
      ...projects.map((project) => ({ value: project, label: project })),
    ],
    [projects],
  );

  const handleProjectChange = useCallback(
    (value: string) => {
      // Persist to localStorage
      try {
        if (value) {
          localStorage.setItem(LS_ADMIN_PROJECT_FILTER, value);
        } else {
          localStorage.removeItem(LS_ADMIN_PROJECT_FILTER);
        }
      } catch {
        /* localStorage unavailable */
      }

      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("project", value);
      } else {
        params.delete("project");
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  return { projectFilter: urlProject, projectOptions, handleProjectChange };
}
