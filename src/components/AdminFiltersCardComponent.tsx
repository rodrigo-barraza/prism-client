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
  SearchInputComponent,
  useDebounce,
} from "@rodrigo-barraza/components-library";
import IrisService from "../services/IrisService";
import { useAdminHeader } from "./AdminHeaderContextComponent";
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

export default function AdminFiltersCardComponent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateRange, setDateRange, sessionFilter } = useAdminHeader();

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

  const urlSearchQuery = searchParams.get("search") || "";
  const [localSearchQuery, setLocalSearchQuery] = useState(urlSearchQuery);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }
    setLocalSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

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

  const handleProjectChange = useCallback(
    (value: string) => updateSearchParam("project", value),
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
    (values: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (values.length > 0) {
        params.set("agent", values.join(","));
      } else {
        params.delete("agent");
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const handleWorkspaceChange = useCallback(
    (value: string) => updateSearchParam("workspace", value),
    [updateSearchParam],
  );

  const syncSearchToUrl = useCallback(
    (value: string) => updateSearchParam("search", value),
    [updateSearchParam],
  );

  const debouncedSyncSearchToUrl = useDebounce(syncSearchToUrl as (...args: unknown[]) => void, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearchQuery(value);
      debouncedSyncSearchToUrl(value);
    },
    [debouncedSyncSearchToUrl],
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

  const hasSessionFilter = !!sessionFilter;

  return (
    <div className={styles["filters-card"]}>
      <SearchInputComponent
        value={localSearchQuery}
        onChange={handleSearchChange}
        placeholder="Search sessions, requests, conversations…"
        compact
        className={styles["search-input"]}
      />
      <div className={styles["filters-grid"]}>
        <SelectComponent
          value={selectedProject}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
          icon={<Box size={14} />}
          compact
        />
        <SelectComponent
          value={selectedProvider}
          options={providerOptions}
          onChange={handleProviderChange}
          placeholder="All Providers"
          icon={<Layers size={14} />}
          compact
        />
        <SelectComponent
          value={selectedModel}
          options={modelOptions}
          onChange={handleModelChange}
          placeholder="All Models"
          icon={<Server size={14} />}
          compact
        />
        <SelectComponent
          multiple
          value={selectedAgents}
          options={agentOptions}
          onChange={handleAgentChange}
          placeholder="All Agents"
          allLabel="All Agents"
          icon={<Users size={14} />}
          compact
        />
        <SelectComponent
          value={selectedWorkspace}
          options={workspaceOptions}
          onChange={handleWorkspaceChange}
          placeholder="All Workspaces"
          icon={<FolderKanban size={14} />}
          compact
        />
        <DatePickerComponent
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
          disabled={hasSessionFilter}
        />
      </div>
    </div>
  );
}
