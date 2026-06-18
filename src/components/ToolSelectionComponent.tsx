"use client";

import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { useState, useCallback, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FolderOpen,
  BookOpen,
  Search,
  Network,
  ChevronRight,
  ChevronDown,
  Globe2,
  TerminalSquare,
  GitBranch,
  MonitorSmartphone,
  Code2,
  CloudSun,
  CalendarDays,
  TrendingUp,
  ShoppingCart,
  BarChart3,
  Film,
  Heart,
  Bus,
  Ship,
  Fuel,
  Radio,
  Cpu,
  Sparkles,
  Layers,
  Lightbulb,
  Wrench,
  Bot,
  Trophy,
  Lock,
  Brain,
} from "lucide-react";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import {
  TooltipComponent,
  SearchInputComponent,
  SelectComponent,
  CheckboxComponent,
} from "@rodrigo-barraza/components-library";
import type { SelectOption } from "@rodrigo-barraza/components-library";
import styles from "./ToolSelectionComponent.module.css";

// -- Interfaces --------------------------------------------------

interface ToolSchema {
  name: string;
  description?: string;
  domain?: string;
  system?: boolean;
  intelligenceTier?: "low" | "medium" | "high" | "frontier";
}

interface ToolSelectionProps {
  availableTools?: ToolSchema[];
  enabledTools?: string[];
  onEnabledToolsChange?: (tools: string[]) => void;
  coreToolsLocked?: boolean;
  lockedOffTools?: Map<string, string>;
  readOnly?: boolean;
  /** When true, enables tri-state cycling: Off → Available → Enabled by Default → Off. Used in agent configuration only. */
  triStateMode?: boolean;
  /** Subset of enabledTools that are enabled by default (only relevant in triStateMode). */
  enabledByDefaultTools?: string[];
  /** Callback when the enabled-by-default subset changes (only relevant in triStateMode). */
  onEnabledByDefaultToolsChange?: (tools: string[]) => void;
}

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  [DOMAINS.CORE_HARNESS.displayName]: Bot,
  [DOMAINS.CORE_WORKSPACE.displayName]: FolderOpen,
  [DOMAINS.CORE_ORCHESTRATOR.displayName]: Bot,
  [DOMAINS.WEATHER.displayName]: CloudSun,
  [DOMAINS.EVENTS.displayName]: CalendarDays,
  [DOMAINS.MARKETS.displayName]: BarChart3,
  [DOMAINS.TRENDS.displayName]: TrendingUp,
  [DOMAINS.PRODUCTS.displayName]: ShoppingCart,
  [DOMAINS.FINANCE.displayName]: BarChart3,
  [DOMAINS.KNOWLEDGE.displayName]: BookOpen,
  [DOMAINS.MOVIES.displayName]: Film,
  [DOMAINS.HEALTH.displayName]: Heart,
  [DOMAINS.TRANSIT.displayName]: Bus,
  [DOMAINS.MARITIME.displayName]: Ship,
  [DOMAINS.ENERGY.displayName]: Fuel,
  [DOMAINS.COMPUTE.displayName]: Cpu,
  [DOMAINS.COMMUNICATION.displayName]: Radio,
  [DOMAINS.WEB.displayName]: Globe2,
  [DOMAINS.BROWSER.displayName]: MonitorSmartphone,
  [DOMAINS.TASKS.displayName]: Wrench,
  [DOMAINS.MEMORY.displayName]: BookOpen,
  [DOMAINS.AGENTS.displayName]: Bot,
  [DOMAINS.TOOLS.displayName]: Wrench,
  [DOMAINS.MCP.displayName]: Network,
  [DOMAINS.META.displayName]: Search,
  [DOMAINS.CORE_SCHEDULE.displayName]: CalendarDays,
  [DOMAINS.CONVERSATION_TIMERS.displayName]: CalendarDays,
  [DOMAINS.SKILLS.displayName]: Layers,
  [DOMAINS.CONTROL.displayName]: Cpu,
  [DOMAINS.STRUCTURED.displayName]: Code2,
  [DOMAINS.REASONING.displayName]: Brain,
  [DOMAINS.CREATIVE.displayName]: Sparkles,
  [DOMAINS.GAMING.displayName]: TerminalSquare,
  [DOMAINS.DISCORD.displayName]: Radio,
  [DOMAINS.SMART_HOME.displayName]: Lightbulb,
  [DOMAINS.SPORTS.displayName]: Trophy,
  [DOMAINS.UTILITIES.displayName]: Wrench,
  [DOMAINS.TORRENT.displayName]: CloudSun,
  [DOMAINS.REDDIT.displayName]: Radio,
  Other: Layers,
};

const DOMAIN_LABELS: Record<string, string> = {
  [DOMAINS.CORE_HARNESS.displayName]: DOMAINS.CORE_HARNESS.displayName,
  [DOMAINS.CORE_WORKSPACE.displayName]: DOMAINS.CORE_WORKSPACE.displayName,
  [DOMAINS.CORE_ORCHESTRATOR.displayName]: DOMAINS.CORE_ORCHESTRATOR.displayName,
  [DOMAINS.WEB.displayName]: DOMAINS.WEB.displayName,
  [DOMAINS.BROWSER.displayName]: DOMAINS.BROWSER.displayName,
  [DOMAINS.TASKS.displayName]: DOMAINS.TASKS.displayName,
  [DOMAINS.MEMORY.displayName]: DOMAINS.MEMORY.displayName,
  [DOMAINS.AGENTS.displayName]: DOMAINS.AGENTS.displayName,
  [DOMAINS.TOOLS.displayName]: DOMAINS.TOOLS.displayName,
  [DOMAINS.MCP.displayName]: DOMAINS.MCP.displayName,
  [DOMAINS.META.displayName]: "Tool Discovery",
  [DOMAINS.CORE_SCHEDULE.displayName]: DOMAINS.CORE_SCHEDULE.displayName,
  [DOMAINS.CONVERSATION_TIMERS.displayName]: DOMAINS.CONVERSATION_TIMERS.displayName,
  [DOMAINS.SKILLS.displayName]: DOMAINS.SKILLS.displayName,
  [DOMAINS.CONTROL.displayName]: DOMAINS.CONTROL.displayName,
  [DOMAINS.STRUCTURED.displayName]: DOMAINS.STRUCTURED.displayName,
  [DOMAINS.REASONING.displayName]: DOMAINS.REASONING.displayName,
  [DOMAINS.TORRENT.displayName]: DOMAINS.TORRENT.displayName,
  [DOMAINS.REDDIT.displayName]: DOMAINS.REDDIT.displayName,
  [DOMAINS.GAMING.displayName]: DOMAINS.GAMING.displayName,
};

const DOMAIN_ORDER = [
  DOMAINS.CORE_HARNESS.displayName,
  DOMAINS.CORE_WORKSPACE.displayName,
  DOMAINS.CORE_ORCHESTRATOR.displayName,
  DOMAINS.WEB.displayName,
  DOMAINS.BROWSER.displayName,
  DOMAINS.TASKS.displayName,
  DOMAINS.MEMORY.displayName,
  DOMAINS.AGENTS.displayName,
  DOMAINS.TOOLS.displayName,
  DOMAINS.MCP.displayName,
  DOMAINS.META.displayName,
  DOMAINS.CORE_SCHEDULE.displayName,
  DOMAINS.CONVERSATION_TIMERS.displayName,
  DOMAINS.SKILLS.displayName,
  DOMAINS.CONTROL.displayName,
  DOMAINS.STRUCTURED.displayName,
  DOMAINS.REASONING.displayName,
  DOMAINS.WEATHER.displayName,
  DOMAINS.EVENTS.displayName,
  DOMAINS.MARKETS.displayName,
  DOMAINS.TRENDS.displayName,
  DOMAINS.PRODUCTS.displayName,
  DOMAINS.FINANCE.displayName,
  DOMAINS.KNOWLEDGE.displayName,
  DOMAINS.MOVIES.displayName,
  DOMAINS.HEALTH.displayName,
  DOMAINS.COMPUTE.displayName,
  DOMAINS.COMMUNICATION.displayName,
  DOMAINS.TRANSIT.displayName,
  DOMAINS.MARITIME.displayName,
  DOMAINS.ENERGY.displayName,
  DOMAINS.CREATIVE.displayName,
  DOMAINS.GAMING.displayName,
  DOMAINS.DISCORD.displayName,
  DOMAINS.SMART_HOME.displayName,
  DOMAINS.SPORTS.displayName,
  DOMAINS.UTILITIES.displayName,
  DOMAINS.TORRENT.displayName,
  DOMAINS.REDDIT.displayName,
  "Other",
];



/**
 * ToolSelectionComponent — reusable grouped tool picker with domain
 * segmented views, search, tri-state checkboxes, and collapsible groups.
 *
 * enabledTools supports two entry formats:
 *   - "tool_name"   → exact tool match
 *   - "domain:X"    → all tools in domain X
 */
export default function ToolSelectionComponent({
  availableTools = [],
  enabledTools = [],
  onEnabledToolsChange,
  coreToolsLocked = true,
  lockedOffTools = new Map(),
  readOnly = false,
  triStateMode = false,
  enabledByDefaultTools = [],
  onEnabledByDefaultToolsChange,
}: ToolSelectionProps) {
  const [toolSearch, setToolSearch] = useState("");
  const [collapsedDomains, setCollapsedDomains] = useState(new Set<string>());
  type ToolSortMode = "domain" | "tier";
  type ToolFilterMode = "all" | "selected" | "unselected" | "locked";
  const [sortMode, setSortMode] = useState<ToolSortMode>("domain");
  const [filterMode, setFilterMode] = useState<ToolFilterMode>("all");

  const SORT_MODE_OPTIONS: SelectOption[] = [
    { value: "domain", label: "Domains" },
    { value: "tier", label: "Intelligence Tiers" },
  ];

  const FILTER_MODE_OPTIONS: SelectOption[] = [
    { value: "all", label: "All Tools" },
    { value: "selected", label: "Selected" },
    { value: "unselected", label: "Unselected" },
    { value: "locked", label: "Locked" },
  ];

  // -- Split availableTools into Core Agentic and Configurable ----
  const { coreTools, configurableTools } = useMemo(() => {
    const core: ToolSchema[] = [];
    const config: ToolSchema[] = [];
    for (const tool of availableTools || []) {
      if (tool.system === true) {
        core.push(tool);
      } else {
        config.push(tool);
      }
    }
    return { coreTools: core, configurableTools: config };
  }, [availableTools]);

  // -- Resolve enabledTools → flat Set of tool names ------------
  const resolveEnabledTools = useCallback(
    (entries: string[]) => {
      const resolved = new Set<string>();
      for (const entry of entries || []) {
        if (entry.startsWith("domain:")) {
          const domain = entry.slice(7);
          for (const tool of availableTools) {
            if (tool.domain === domain && !lockedOffTools.has(tool.name)) {
              resolved.add(tool.name);
            }
          }
        } else if (entry.startsWith("tier:")) {
          const tier = entry.slice(5);
          for (const tool of availableTools) {
            if (tool.intelligenceTier === tier && !lockedOffTools.has(tool.name)) {
              resolved.add(tool.name);
            }
          }
        } else {
          if (!lockedOffTools.has(entry)) {
            resolved.add(entry);
          }
        }
      }
      return resolved;
    },
    [availableTools, lockedOffTools],
  );

  const resolvedEnabledSet = useMemo(
    () => resolveEnabledTools(enabledTools),
    [resolveEnabledTools, enabledTools],
  );

  const selectableConfigurableTools = useMemo(() => {
    return configurableTools.filter((tool) => !lockedOffTools.has(tool.name));
  }, [configurableTools, lockedOffTools]);

  const selectableCoreTools = useMemo(() => {
    return coreTools.filter((tool) => !lockedOffTools.has(tool.name));
  }, [coreTools, lockedOffTools]);

  // -- Core tools enabled count ---------------------------------
  const enabledCoreCount = useMemo(() => {
    let count = 0;
    for (const tool of coreTools) {
      if (resolvedEnabledSet.has(tool.name)) {
        count++;
      }
    }
    return count;
  }, [coreTools, resolvedEnabledSet]);

  // -- Configurable enabled count --------------------------------
  const enabledConfigurableCount = useMemo(() => {
    let count = 0;
    for (const tool of configurableTools) {
      if (resolvedEnabledSet.has(tool.name)) {
        count++;
      }
    }
    return count;
  }, [configurableTools, resolvedEnabledSet]);

  // -- Total enabled and total tools count taking Core Tools into account --
  const totalEnabledCount = useMemo(() => {
    const coreCount = coreToolsLocked ? selectableCoreTools.length : enabledCoreCount;
    return coreCount + enabledConfigurableCount;
  }, [coreToolsLocked, selectableCoreTools.length, enabledCoreCount, enabledConfigurableCount]);

  const totalToolsCount = useMemo(() => {
    return selectableCoreTools.length + selectableConfigurableTools.length;
  }, [selectableCoreTools.length, selectableConfigurableTools.length]);

  // -- Resolved enabledByDefault set for tri-state mode ----------
  const resolvedEnabledByDefaultSet = useMemo(
    () => new Set(enabledByDefaultTools),
    [enabledByDefaultTools],
  );

  // -- Tool toggling --------------------------------------------
  const toggleTool = useCallback(
    (toolName: string) => {
      if (readOnly || lockedOffTools.has(toolName)) {
        return;
      }

      if (triStateMode) {
        // Tri-state cycle: Off → Available → Enabled by Default → Off
        const isAvailable = resolvedEnabledSet.has(toolName);
        const isEnabledByDefault = resolvedEnabledByDefaultSet.has(toolName);

        if (!isAvailable) {
          // Off → Available (add to enabledTools, not to enabledByDefault)
          const nextEnabled = new Set(resolvedEnabledSet);
          nextEnabled.add(toolName);
          onEnabledToolsChange?.(Array.from(nextEnabled));
        } else if (isAvailable && !isEnabledByDefault) {
          // Available → Enabled by Default (add to enabledByDefault)
          const nextEnabledByDefault = new Set(resolvedEnabledByDefaultSet);
          nextEnabledByDefault.add(toolName);
          onEnabledByDefaultToolsChange?.(Array.from(nextEnabledByDefault));
        } else {
          // Enabled by Default → Off (remove from both)
          const nextEnabled = new Set(resolvedEnabledSet);
          nextEnabled.delete(toolName);
          onEnabledToolsChange?.(Array.from(nextEnabled));
          const nextEnabledByDefault = new Set(resolvedEnabledByDefaultSet);
          nextEnabledByDefault.delete(toolName);
          onEnabledByDefaultToolsChange?.(Array.from(nextEnabledByDefault));
        }
      } else {
        // Binary toggle (standard in-chat behavior)
        const nextEnabledSet = new Set(resolvedEnabledSet);
        if (nextEnabledSet.has(toolName)) {
          nextEnabledSet.delete(toolName);
        } else {
          nextEnabledSet.add(toolName);
        }
        onEnabledToolsChange?.(Array.from(nextEnabledSet));
      }
    },
    [readOnly, resolvedEnabledSet, resolvedEnabledByDefaultSet, lockedOffTools, onEnabledToolsChange, onEnabledByDefaultToolsChange, triStateMode],
  );

  const selectAllTools = useCallback(() => {
    if (readOnly) return;
    const selectableTools = configurableTools.filter((tool) => !lockedOffTools.has(tool.name));
    const toolNames = selectableTools.map((tool) => tool.name);
    onEnabledToolsChange?.(toolNames);
    if (triStateMode) {
      onEnabledByDefaultToolsChange?.(toolNames);
    }
  }, [readOnly, configurableTools, lockedOffTools, onEnabledToolsChange, onEnabledByDefaultToolsChange, triStateMode]);

  const deselectAllTools = useCallback(() => {
    if (readOnly) return;
    onEnabledToolsChange?.([]);
    if (triStateMode) {
      onEnabledByDefaultToolsChange?.([]);
    }
  }, [readOnly, onEnabledToolsChange, onEnabledByDefaultToolsChange, triStateMode]);

  // -- Filtering ------------------------------------------------
  const query = toolSearch.toLowerCase().trim();

  const filteredCoreTools = useMemo(() => {
    if (!query) return coreTools;
    return coreTools.filter(
      (tool) =>
        tool.name?.toLowerCase().includes(query) ||
        renderToolName(tool.name)?.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query),
    );
  }, [coreTools, query]);

  const filteredTools = useMemo(() => {
    if (!query) return configurableTools;
    return configurableTools.filter(
      (tool) =>
        tool.name?.toLowerCase().includes(query) ||
        renderToolName(tool.name)?.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query),
    );
  }, [configurableTools, query]);

  // -- Intelligence tier constants --------------------------------
  const TIER_ORDER = ["frontier", "high", "medium", "low"];

  const TIER_LABELS: Record<string, string> = {
    frontier: "Frontier (State-of-the-Art Reasoning)",
    high: "High Capability",
    medium: "Medium Capability",
    low: "Low/Lightweight",
  };

  const TIER_ICONS: Record<string, LucideIcon> = {
    frontier: Brain,
    high: Cpu,
    medium: Bot,
    low: Layers,
  };

  // -- Collapse toggling ----------------------------------------
  const toggleDomain = useCallback((domain: string) => {
    setCollapsedDomains((previousCollapsedDomains) => {
      const next = new Set(previousCollapsedDomains);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  // -- Toggle all tools in a group ------------------------------
  const toggleGroupTools = useCallback(
    (groupKey: string, groupTools: ToolSchema[]) => {
      if (readOnly) return;
      const selectableGroupTools = groupTools.filter((tool) => !lockedOffTools.has(tool.name));
      const toggleableGroupTools = selectableGroupTools.filter((tool) => !(tool.system && coreToolsLocked));
      if (toggleableGroupTools.length === 0) return;

      const toggleableGroupNames = toggleableGroupTools.map((tool) => tool.name);

      if (triStateMode) {
        // Tri-state group cycle: Off → Available → Enabled by Default → Off
        const allAvailable = toggleableGroupNames.every((name) => resolvedEnabledSet.has(name));
        const allEnabledByDefault = toggleableGroupNames.every((name) => resolvedEnabledByDefaultSet.has(name));

        const nextEnabledSet = new Set(resolvedEnabledSet);
        const nextEnabledByDefaultSet = new Set(resolvedEnabledByDefaultSet);

        if (!allAvailable) {
          // Not all available → make all Available
          for (const name of toggleableGroupNames) {
            nextEnabledSet.add(name);
          }
        } else if (allAvailable && !allEnabledByDefault) {
          // All available but not all enabled by default → make all Enabled by Default
          for (const name of toggleableGroupNames) {
            nextEnabledByDefaultSet.add(name);
          }
        } else {
          // All enabled by default → turn all Off
          for (const name of toggleableGroupNames) {
            nextEnabledSet.delete(name);
            nextEnabledByDefaultSet.delete(name);
          }
        }

        onEnabledToolsChange?.(Array.from(nextEnabledSet));
        onEnabledByDefaultToolsChange?.(Array.from(nextEnabledByDefaultSet));
      } else {
        // Binary group toggle
        const allToggleableEnabled = toggleableGroupNames.every((name) => resolvedEnabledSet.has(name));
        const nextEnabledSet = new Set(resolvedEnabledSet);
        if (allToggleableEnabled) {
          for (const name of toggleableGroupNames) {
            nextEnabledSet.delete(name);
          }
        } else {
          for (const name of toggleableGroupNames) {
            nextEnabledSet.add(name);
          }
        }
        onEnabledToolsChange?.(Array.from(nextEnabledSet));
      }
    },
    [
      readOnly,
      resolvedEnabledSet,
      resolvedEnabledByDefaultSet,
      onEnabledToolsChange,
      onEnabledByDefaultToolsChange,
      lockedOffTools,
      coreToolsLocked,
      triStateMode,
    ],
  );

  // -- Render ---------------------------------------------------
  return (
    <div className={`tool-selection-component ${styles['tools-section']}`} data-read-only={readOnly}>
      {/* Search — pinned above scroll */}
      <SearchInputComponent
        value={toolSearch}
        onChange={setToolSearch}
        placeholder="Search tools..."
        compact
        className={styles['tools-search']}
      />

      <div className={styles['tools-section-header-right']}>
        <SelectComponent
          value={sortMode}
          onChange={(nextMode) => setSortMode(nextMode as ToolSortMode)}
          options={SORT_MODE_OPTIONS}
          compact
          label="Sort"
        />
        <SelectComponent
          value={filterMode}
          onChange={(nextMode) => setFilterMode(nextMode as ToolFilterMode)}
          options={FILTER_MODE_OPTIONS}
          compact
          label="Filter"
        />
      </div>

      <div className={styles['tools-list-wrapper']}>

        {/* Master select-all / deselect-all checkbox */}
        {filterMode !== "locked" && (
          <div className={styles['bulk-checkbox-layout-row']}>
            <CheckboxComponent
              size="compact"
              checked={
                filterMode === "selected"
                  ? true
                  : selectableConfigurableTools.length > 0 &&
                    enabledConfigurableCount === selectableConfigurableTools.length
              }
              indeterminate={
                filterMode === "selected"
                  ? false
                  : enabledConfigurableCount > 0 &&
                    enabledConfigurableCount < selectableConfigurableTools.length
              }
              disabled={
                readOnly ||
                (filterMode === "selected" && enabledConfigurableCount === 0)
              }
              onChange={() => {
                if (readOnly) return;
                if (
                  filterMode === "selected" ||
                  enabledConfigurableCount === selectableConfigurableTools.length
                ) {
                  deselectAllTools();
                } else {
                  selectAllTools();
                }
              }}
              label={
                <span className={styles['bulk-checkbox-label']}>
                  {filterMode === "selected" ? "Deselect All" : "Select All"}
                </span>
              }
            />
            <span className={styles['domain-count']}>
              {totalEnabledCount}/{totalToolsCount}
            </span>
          </div>
        )}

        {/* Unified tool groups — filtered + sorted */}
        {(() => {
          const allToolsPool = [...filteredCoreTools, ...filteredTools];

          const filteredToolPool = filterMode === "all"
            ? allToolsPool
            : filterMode === "selected"
              ? allToolsPool.filter((tool) => {
                  if (lockedOffTools.has(tool.name)) return false;
                  if (tool.system && coreToolsLocked) return true;
                  return resolvedEnabledSet.has(tool.name);
                })
              : filterMode === "unselected"
                ? allToolsPool.filter((tool) => {
                    if (lockedOffTools.has(tool.name)) return false;
                    if (tool.system && coreToolsLocked) return false;
                    return !resolvedEnabledSet.has(tool.name);
                  })
                : allToolsPool.filter((tool) =>
                    lockedOffTools.has(tool.name) || (tool.system && coreToolsLocked),
                  );

          const emptyMessage =
            filterMode === "selected" ? "No tools currently selected"
            : filterMode === "unselected" ? "All tools are currently selected"
            : filterMode === "locked" ? "No tools are currently locked"
            : "No tools match your search";

          const emptySubtext =
            filterMode === "selected" ? "Enable tools from the tool list to see them here."
            : filterMode === "unselected" ? "Deselect tools to see them appear here."
            : filterMode === "locked" ? "No tools have been restricted by the agent persona or core lock."
            : "Try adjusting your search query.";

          if (filteredToolPool.length === 0) {
            return (
              <div className={styles['no-selected-tools-container']}>
                <Layers size={24} className={styles['no-selected-tools-icon']} />
                <span className={styles['no-selected-tools-message']}>{emptyMessage}</span>
                <span className={styles['no-selected-tools-subtext']}>
                  {emptySubtext}
                </span>
              </div>
            );
          }

          const isDomainSort = sortMode === "domain";

          const groupedFilteredTools: [string, ToolSchema[]][] = (() => {
            const groups = new Map<string, ToolSchema[]>();
            for (const tool of filteredToolPool) {
              const key = isDomainSort
                ? (tool.domain || "Other")
                : (tool.intelligenceTier || "low");
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(tool);
            }

            // Sort tools inside each group alphabetically by their display name
            for (const tools of groups.values()) {
              tools.sort((toolA, toolB) => {
                const nameA = renderToolName(toolA.name);
                const nameB = renderToolName(toolB.name);
                return nameA.localeCompare(nameB);
              });
            }

            if (isDomainSort) {
              const coreDomainKeys: string[] = [];
              const otherDomainKeys: string[] = [];
              for (const key of groups.keys()) {
                const isCoreDomainGroup = key.toLowerCase().startsWith("core ");
                if (isCoreDomainGroup) {
                  coreDomainKeys.push(key);
                } else {
                  otherDomainKeys.push(key);
                }
              }

              coreDomainKeys.sort((keyA, keyB) => keyA.localeCompare(keyB));
              otherDomainKeys.sort((keyA, keyB) => keyA.localeCompare(keyB));

              const sorted: [string, ToolSchema[]][] = [];
              for (const key of coreDomainKeys) {
                sorted.push([key, groups.get(key)!]);
              }
              for (const key of otherDomainKeys) {
                sorted.push([key, groups.get(key)!]);
              }
              return sorted;
            } else {
              const order = TIER_ORDER;
              const sorted: [string, ToolSchema[]][] = [];
              for (const key of order) {
                if (groups.has(key)) {
                  sorted.push([key, groups.get(key)!]);
                }
              }
              for (const [key, tools] of groups) {
                if (!order.includes(key)) {
                  sorted.push([key, tools]);
                }
              }
              return sorted;
            }
          })();

          return groupedFilteredTools.map(([groupKey, tools]) => {
            const isCoreDomain = isDomainSort && groupKey.toLowerCase().startsWith("core ");
            const isMcp = isDomainSort && (
              groupKey.startsWith("Model Context Protocol:") || groupKey === "Model Context Protocol"
            );
            const GroupIcon: LucideIcon = isMcp
              ? Network
              : isDomainSort
                ? DOMAIN_ICONS[groupKey] || Layers
                : TIER_ICONS[groupKey] || Brain;
            const groupLabel = isMcp
              ? groupKey.replace("Model Context Protocol: ", "MCP: ")
              : isDomainSort
                ? DOMAIN_LABELS[groupKey] || groupKey
                : TIER_LABELS[groupKey] || groupKey;
            const collapseKey = `${sortMode}:${filterMode}:${groupKey}`;
            const collapsed = collapsedDomains.has(collapseKey);
            const selectableGroupTools = tools.filter((tool) => !lockedOffTools.has(tool.name));
            const toggleableGroupTools = selectableGroupTools.filter((tool) => !(tool.system && coreToolsLocked));
            const isEntireGroupLockedOff = tools.length > 0 && selectableGroupTools.length === 0;
            const isEntireGroupLockedOn = selectableGroupTools.length > 0 && toggleableGroupTools.length === 0;
            const groupEnabled = selectableGroupTools.filter((tool) =>
              resolvedEnabledSet.has(tool.name) || (tool.system && coreToolsLocked),
            ).length;
            const groupEnabledByDefault = triStateMode
              ? selectableGroupTools.filter((tool) => resolvedEnabledByDefaultSet.has(tool.name)).length
              : 0;

            return (
              <div
                key={groupKey}
                className={`${isCoreDomain ? styles['core-group'] : styles['domain-group']}${isEntireGroupLockedOff ? ` ${styles['core-group-locked-off']}` : ''}`}
              >
                <div
                  className={isCoreDomain ? styles['core-header'] : styles['domain-header']}
                  onClick={(event: React.MouseEvent) => {
                    const targetElement = event.target as HTMLElement;
                    if (targetElement.closest(".checkbox-component")) {
                      return;
                    }
                    toggleDomain(collapseKey);
                  }}
                >
                  {collapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <span className={isCoreDomain ? styles['core-icon'] : styles['domain-icon']}>
                    <GroupIcon size={12} />
                  </span>
                  {isCoreDomain ? (
                    <span className={styles['core-label']}>{groupLabel}</span>
                  ) : (
                    groupLabel
                  )}
                  {isEntireGroupLockedOff ? (
                    <span className={styles['core-badge-locked-off']}>Locked Off</span>
                  ) : isEntireGroupLockedOn ? (
                    <span className={styles['core-badge']}>Locked On</span>
                  ) : (
                    <>
                      <span className={styles['domain-count']}>
                        {triStateMode
                          ? `${groupEnabledByDefault}/${groupEnabled}/${selectableGroupTools.length}`
                          : `${groupEnabled}/${selectableGroupTools.length}`
                        }
                      </span>
                      <CheckboxComponent
                        size="compact"
                        checked={selectableGroupTools.length > 0 && groupEnabled === selectableGroupTools.length && (!triStateMode || groupEnabledByDefault === selectableGroupTools.length)}
                        indeterminate={groupEnabled > 0 && (groupEnabled < selectableGroupTools.length || (triStateMode && groupEnabledByDefault < groupEnabled))}
                        disabled={readOnly}
                        className={triStateMode && groupEnabled > 0 && groupEnabledByDefault < groupEnabled ? styles['available-only-checkbox'] : ''}
                        onChange={() => {
                          if (readOnly) return;
                          toggleGroupTools(isCoreDomain ? "core" : groupKey, tools);
                        }}
                      />
                    </>
                  )}
                </div>

                {!collapsed && (
                  <div className={isCoreDomain ? styles['core-tools-list'] : styles['tools-grid']}>
                    {tools.map((tool) => {
                      const isLocked = lockedOffTools.has(tool.name);
                      const lockReason = lockedOffTools.get(tool.name);
                      const isCoreLockedTool = (tool.system && coreToolsLocked && !isLocked);
                      return (
                        <TooltipComponent
                          key={tool.name}
                          label={isLocked ? lockReason! : (tool.description || (tool.system ? "Core capability" : ""))}
                          position="right"
                          delay={isLocked ? 0 : 400}
                        >
                          {isCoreLockedTool ? (
                            <div className={`${styles['tool-layout-row']} ${styles['core-tool-layout-row']}`}>
                              <CheckboxComponent
                                size="compact"
                                className={styles['tool-checkbox']}
                                checked={true}
                                disabled={true}
                                onChange={() => {}}
                                label={
                                  <span className={`${styles['tool-name']} ${styles['core-tool-name']}`}>
                                    {renderToolName(tool.name)}
                                  </span>
                                }
                              />
                              <Lock size={10} className={styles['lock-icon']} />
                            </div>
                          ) : isLocked ? (
                            <div className={`${styles['tool-layout-row']} ${styles['locked-tool-layout-row']}`}>
                              <CheckboxComponent
                                size="compact"
                                className={styles['tool-checkbox']}
                                checked={false}
                                disabled={true}
                                onChange={() => {}}
                                label={
                                  <span className={`${styles['tool-name']} ${styles['locked-tool-name']}`}>
                                    {renderToolName(tool.name)}
                                  </span>
                                }
                              />
                              <Lock size={10} className={styles['lock-icon']} />
                            </div>
                          ) : (
                            <div className={`${styles['tool-layout-row']}${triStateMode && resolvedEnabledSet.has(tool.name) && !resolvedEnabledByDefaultSet.has(tool.name) ? ` ${styles['available-only-tool-layout-row']}` : ''}`}>
                              <CheckboxComponent
                                size="compact"
                                className={`${styles['tool-checkbox']}${triStateMode && resolvedEnabledSet.has(tool.name) && !resolvedEnabledByDefaultSet.has(tool.name) ? ` ${styles['available-only-checkbox']}` : ''}`}
                                checked={triStateMode ? resolvedEnabledByDefaultSet.has(tool.name) : resolvedEnabledSet.has(tool.name)}
                                indeterminate={triStateMode && resolvedEnabledSet.has(tool.name) && !resolvedEnabledByDefaultSet.has(tool.name)}
                                disabled={readOnly}
                                onChange={() => {
                                  if (readOnly) return;
                                  toggleTool(tool.name);
                                }}
                                label={
                                  <span className={`${styles['tool-name']}${triStateMode && resolvedEnabledSet.has(tool.name) && !resolvedEnabledByDefaultSet.has(tool.name) ? ` ${styles['available-only-tool-name']}` : ''}`}>
                                    {renderToolName(tool.name)}
                                  </span>
                                }
                              />
                            </div>
                          )}
                        </TooltipComponent>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
