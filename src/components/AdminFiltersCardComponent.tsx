"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Box,
  Layers,
  Server,
  Users,
  FolderKanban,
} from "lucide-react";
import {
  SelectComponent,
  DatePickerComponent,
} from "@rodrigo-barraza/components-library";
import IrisService from "../services/IrisService";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import { LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER } from "../constants";
import styles from "./AdminFiltersCardComponent.module.css";

interface FilterOption {
  value: string;
  label: string;
}

interface FiltersData {
  projects: string[];
  providers: string[];
  models: string[];
  agents: Array<{ id: string; name: string }>;
  workspaces: string[];
}

export interface AdminFilterVisibility {
  project?: boolean;
  provider?: boolean;
  model?: boolean;
  agent?: boolean;
  workspace?: boolean;
  date?: boolean;
}

export interface AdminFiltersCardComponentProps {
  /**
   * Which built-in shared filters to render. Omitted → all shown
   * (the dashboard/users default). Pages pass a subset to only surface the
   * dimensions their API actually supports.
   */
  show?: AdminFilterVisibility;
  /**
   * Page-specific filter controls (e.g. endpoint / operation / status),
   * rendered inline in the same grid so everything reads as one filter bar.
   */
  children?: React.ReactNode;
  /** Right-aligned actions such as Clear / Export CSV. */
  actions?: React.ReactNode;
}

const ALL_VISIBLE: Required<AdminFilterVisibility> = {
  project: true,
  provider: true,
  model: true,
  agent: true,
  workspace: true,
  date: true,
};

export default function AdminFiltersCardComponent({
  show,
  children,
  actions,
}: AdminFiltersCardComponentProps) {
  const visible = useMemo(() => ({ ...ALL_VISIBLE, ...(show ?? {}) }), [show]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateRange, setDateRange, traceFilter } = useAdminHeader();

  const [filtersData, setFiltersData] = useState<FiltersData>({
    projects: [],
    providers: [],
    models: [],
    agents: [],
    workspaces: [],
  });

  useEffect(() => {
    IrisService.getConversationFilters()
      .then((data) =>
        setFiltersData({
          projects: data.projects || [],
          providers: data.providers || [],
          models: data.models || [],
          agents: data.agents || [],
          workspaces: data.workspaces || [],
        }),
      )
      .catch(() => {});
  }, []);

  const selectedProject = searchParams.get("project") || "";
  const selectedProvider = searchParams.get("provider") || "";
  const selectedModel = searchParams.get("model") || "";
  const selectedAgents = useMemo(() => {
    const agentParam = searchParams.get("agent");
    if (!agentParam) return [];
    return agentParam.split(",").filter(Boolean);
  }, [searchParams]);
  const selectedWorkspace = searchParams.get("workspace") || "";

  const updateSearchParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  // Restore the persisted project selection on mount when the URL doesn't
  // already carry one — keeps the project sticky across page navigations,
  // matching the previous useProjectFilter behaviour on every admin page.
  const hasRestoredProjectRef = useRef(false);
  useEffect(() => {
    if (!visible.project || hasRestoredProjectRef.current) return;
    hasRestoredProjectRef.current = true;
    if (searchParams.get("project")) return;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER);
      if (saved) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("project", saved);
        router.replace(`${pathname}?${params.toString()}`);
      }
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore-once-on-mount; deps intentionally omitted
  }, []);

  const handleProjectChange = useCallback(
    (value: string) => {
      try {
        if (value) {
          localStorage.setItem(LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER, value);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER);
        }
      } catch {
        /* localStorage unavailable */
      }
      updateSearchParam("project", value);
    },
    [updateSearchParam],
  );

  const handleProviderChange = useCallback(
    (value: string) => updateSearchParam("provider", value),
    [updateSearchParam],
  );

  const handleModelChange = useCallback(
    (value: string) => updateSearchParam("model", value),
    [updateSearchParam],
  );

  const handleAgentChange = useCallback(
    (values: string[]) => updateSearchParam("agent", values.join(",")),
    [updateSearchParam],
  );

  const handleWorkspaceChange = useCallback(
    (value: string) => updateSearchParam("workspace", value),
    [updateSearchParam],
  );

  const projectOptions: FilterOption[] = useMemo(
    () => [
      { value: "", label: "All Projects" },
      ...filtersData.projects.map((project) => ({
        value: project,
        label: project,
      })),
    ],
    [filtersData.projects],
  );

  const providerOptions: FilterOption[] = useMemo(
    () => [
      { value: "", label: "All Providers" },
      ...filtersData.providers.map((provider) => ({
        value: provider,
        label: provider,
      })),
    ],
    [filtersData.providers],
  );

  const modelOptions: FilterOption[] = useMemo(
    () => [
      { value: "", label: "All Models" },
      ...filtersData.models.map((model) => ({ value: model, label: model })),
    ],
    [filtersData.models],
  );

  const agentOptions: FilterOption[] = useMemo(
    () =>
      filtersData.agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
      })),
    [filtersData.agents],
  );

  const workspaceOptions: FilterOption[] = useMemo(
    () => [
      { value: "", label: "All Workspaces" },
      ...filtersData.workspaces.map((workspace) => {
        const shortLabel = workspace.split("/").pop() || workspace;
        return { value: workspace, label: shortLabel };
      }),
    ],
    [filtersData.workspaces],
  );

  const hasTraceFilter = !!traceFilter;

  return (
    <div className={`admin-filters-card-component ${styles["filters-card"]}`}>
      <div className={styles["filters-grid"]}>
        {visible.project && (
          <SelectComponent
            value={selectedProject}
            options={projectOptions}
            onChange={handleProjectChange}
            placeholder="All Projects"
            icon={<Box size={14} />}
            compact
            searchable
          />
        )}
        {visible.provider && (
          <SelectComponent
            value={selectedProvider}
            options={providerOptions}
            onChange={handleProviderChange}
            placeholder="All Providers"
            icon={<Layers size={14} />}
            compact
            searchable
          />
        )}
        {visible.model && (
          <SelectComponent
            value={selectedModel}
            options={modelOptions}
            onChange={handleModelChange}
            placeholder="All Models"
            icon={<Server size={14} />}
            compact
            searchable
          />
        )}
        {visible.agent && (
          <SelectComponent
            multiple
            value={selectedAgents}
            options={agentOptions}
            onChange={handleAgentChange}
            placeholder="All Agents"
            allLabel="All Agents"
            icon={<Users size={14} />}
            compact
            searchable
          />
        )}
        {visible.workspace && (
          <SelectComponent
            value={selectedWorkspace}
            options={workspaceOptions}
            onChange={handleWorkspaceChange}
            placeholder="All Workspaces"
            icon={<FolderKanban size={14} />}
            compact
            searchable
          />
        )}
        {children}
        {visible.date && (
          <div className={styles["filter-date"]}>
            <DatePickerComponent
              from={dateRange.from}
              to={dateRange.to}
              onChange={setDateRange}
              disabled={hasTraceFilter}
            />
          </div>
        )}
        {actions && <div className={styles["filters-actions"]}>{actions}</div>}
      </div>
    </div>
  );
}
