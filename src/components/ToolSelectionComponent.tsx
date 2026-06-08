"use client";

import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { useState, useCallback, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Tag,
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
  Compass,
  FlaskConical,
  Lock,
  Brain,
} from "lucide-react";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import {
  TooltipComponent,
  SearchInputComponent,
  SegmentedControlComponent,
  CheckboxComponent,
} from "@rodrigo-barraza/components-library";
import type { SegmentDefinition } from "@rodrigo-barraza/components-library";
import styles from "./ToolSelectionComponent.module.css";

// -- Interfaces --------------------------------------------------

interface ToolSchema {
  name: string;
  description?: string;
  domain?: string;
  labels?: string[];
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
}

// -- Domain icon mapping (mirrors CustomToolsPanel) --------------
const DOMAIN_ICONS: Record<string, LucideIcon> = {
  [DOMAINS.CORE_HARNESS.displayName]: Bot,
  [DOMAINS.ORCHESTRATOR.displayName]: Bot,
  "Weather & Environment": CloudSun,
  Events: CalendarDays,
  "Markets & Commodities": BarChart3,
  Trends: TrendingUp,
  Products: ShoppingCart,
  Finance: BarChart3,
  Knowledge: BookOpen,
  "Movies & TV": Film,
  Health: Heart,
  Transit: Bus,
  Maritime: Ship,
  Energy: Fuel,
  Compute: Cpu,
  Communication: Radio,
  Workspace: FolderOpen,
  Web: Globe2,
  Browser: MonitorSmartphone,
  "Task Management": Wrench,
  Memory: BookOpen,
  "Agent Management": Bot,
  "Model Context Protocol": Network,
  Meta: Search,
  "Scheduled Tasks": CalendarDays,
  Timers: CalendarDays,
  Skills: Layers,
  "Control Flow": Cpu,
  "Structured Output": Code2,
  Creative: Sparkles,
  Discord: Radio,
  "Smart Home": Lightbulb,
  Sports: Trophy,
  Utilities: Wrench,
  Coordinator: Bot,
  Reasoning: Brain,
  Other: Layers,
};

const DOMAIN_LABELS: Record<string, string> = {
  [DOMAINS.CORE_HARNESS.displayName]: DOMAINS.CORE_HARNESS.displayName,
  [DOMAINS.ORCHESTRATOR.displayName]: DOMAINS.ORCHESTRATOR.displayName,
  Workspace: "Workspace Tools",
  Web: "Web",
  Browser: "Browser",
  "Task Management": "Task Management",
  Memory: "Memory",
  "Agent Management": "Agent Management",
  "Model Context Protocol": "Model Context Protocol",
  Meta: "Tool Discovery",
  "Scheduled Tasks": "Scheduled Tasks",
  Timers: "Timers",
  Skills: "Skills",
  "Control Flow": "Control Flow",
  "Structured Output": "Structured Output",
};

const DOMAIN_ORDER = [
  DOMAINS.CORE_HARNESS.displayName,
  DOMAINS.ORCHESTRATOR.displayName,
  "Workspace",
  "Web",
  "Browser",
  "Task Management",
  "Memory",
  "Agent Management",
  "Model Context Protocol",
  "Meta",
  "Scheduled Tasks",
  "Timers",
  "Skills",
  "Control Flow",
  "Structured Output",
  "Reasoning",
  "Coordinator",
  "Weather & Environment",
  "Events",
  "Markets & Commodities",
  "Trends",
  "Products",
  "Finance",
  "Knowledge",
  "Movies & TV",
  "Health",
  "Compute",
  "Communication",
  "Transit",
  "Maritime",
  "Energy",
  "Creative",
  "Discord",
  "Smart Home",
  "Sports",
  "Utilities",
  "Other",
];

// -- Label taxonomy — icon mapping & ordering ----------------
const LABEL_ICONS: Record<string, LucideIcon> = {
  coding: Code2,
  web: Globe2,
  health: Heart,
  finance: BarChart3,
  location: Compass,
  reference: BookOpen,
  media: Film,
  data: Cpu,
  shopping: ShoppingCart,
  sports: Trophy,
  maritime: Ship,
  energy: Fuel,
  communication: Radio,
  creative: Sparkles,
  smart_home: Lightbulb,
  lifx: Lightbulb,
  discord: Radio,
  git: GitBranch,
  meta: Search,
  automation: CalendarDays,
  data_science: FlaskConical,
  mcp: Network,
};

const LABEL_DISPLAY: Record<string, string> = {
  coding: "Coding",
  web: "Web",
  health: "Health",
  finance: "Finance",
  location: "Location",
  reference: "Reference",
  media: "Media",
  data: "Data & Compute",
  shopping: "Shopping",
  sports: "Sports",
  maritime: "Maritime",
  energy: "Energy",
  mcp: "Model Context Protocol",
  communication: "Communication",
  creative: "Creative",
  smart_home: "Smart Home",
  lifx: "LIFX",
  discord: "Discord",
  git: "Git",
  meta: "Meta",
  automation: "Automation",
  data_science: "Data Science",
};

const LABEL_ORDER = [
  "coding",
  "web",
  "data",
  "reference",
  "health",
  "finance",
  "location",
  "media",
  "shopping",
  "sports",
  "creative",
  "communication",
  "automation",
  "data_science",
  "smart_home",
  "lifx",
  "discord",
  "git",
  "maritime",
  "energy",
  "meta",
];

/**
 * ToolSelectionComponent — reusable grouped tool picker with domain/label
 * segmented views, search, tri-state checkboxes, and collapsible groups.
 *
 * enabledTools supports three entry formats:
 *   - "tool_name"   → exact tool match
 *   - "label:X"     → all tools carrying label X
 *   - "domain:X"    → all tools in domain X
 */
export default function ToolSelectionComponent({
  availableTools = [],
  enabledTools = [],
  onEnabledToolsChange,
  coreToolsLocked = true,
  lockedOffTools = new Map(),
  readOnly = false,
}: ToolSelectionProps) {
  const [toolSearch, setToolSearch] = useState("");
  const [collapsedDomains, setCollapsedDomains] = useState(new Set<string>());
  const [groupMode, setGroupMode] = useState("domain");
  const [coreCollapsed, setCoreCollapsed] = useState(true);

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
        if (entry.startsWith("label:")) {
          const label = entry.slice(6);
          for (const tool of availableTools) {
            if (tool.labels?.includes(label) && !lockedOffTools.has(tool.name)) {
              resolved.add(tool.name);
            }
          }
        } else if (entry.startsWith("domain:")) {
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
    const coreCount = coreToolsLocked ? coreTools.length : enabledCoreCount;
    return coreCount + enabledConfigurableCount;
  }, [coreToolsLocked, coreTools.length, enabledCoreCount, enabledConfigurableCount]);

  const totalToolsCount = useMemo(() => {
    return coreTools.length + configurableTools.length;
  }, [coreTools.length, configurableTools.length]);

  // -- Tool toggling --------------------------------------------
  const toggleTool = useCallback(
    (toolName: string) => {
      if (readOnly || lockedOffTools.has(toolName)) {
        return;
      }
      const tools = enabledTools || [];
      const resolved = new Set<string>();
      for (const entry of tools) {
        if (!entry.startsWith("label:") && !entry.startsWith("domain:")) {
          resolved.add(entry);
        }
      }
      if (resolved.has(toolName)) {
        onEnabledToolsChange?.(tools.filter((entry) => entry !== toolName));
      } else {
        onEnabledToolsChange?.([...tools, toolName]);
      }
    },
    [readOnly, enabledTools, lockedOffTools, onEnabledToolsChange],
  );

  const selectAllTools = useCallback(() => {
    if (readOnly) return;
    const selectableTools = configurableTools.filter((tool) => !lockedOffTools.has(tool.name));
    onEnabledToolsChange?.(selectableTools.map((tool) => tool.name));
  }, [readOnly, configurableTools, lockedOffTools, onEnabledToolsChange]);

  const deselectAllTools = useCallback(() => {
    if (readOnly) return;
    onEnabledToolsChange?.([]);
  }, [readOnly, onEnabledToolsChange]);

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

  const selectedCoreTools = useMemo(() => {
    return filteredCoreTools.filter((tool) => coreToolsLocked || resolvedEnabledSet.has(tool.name));
  }, [filteredCoreTools, coreToolsLocked, resolvedEnabledSet]);

  const selectedConfigurableTools = useMemo(() => {
    return filteredTools.filter((tool) => resolvedEnabledSet.has(tool.name));
  }, [filteredTools, resolvedEnabledSet]);

  const selectedGroupedByDomain = useMemo(() => {
    const allSelectedTools = [
      ...filteredCoreTools.filter((tool) => coreToolsLocked || resolvedEnabledSet.has(tool.name)),
      ...filteredTools.filter((tool) => resolvedEnabledSet.has(tool.name)),
    ];
    const groups = new Map<string, ToolSchema[]>();
    for (const tool of allSelectedTools) {
      const domain = tool.domain || "Other";
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain)!.push(tool);
    }
    const sorted: [string, ToolSchema[]][] = [];
    for (const domain of DOMAIN_ORDER) {
      if (groups.has(domain)) sorted.push([domain, groups.get(domain)!]);
    }
    for (const [domain, tools] of groups) {
      if (!DOMAIN_ORDER.includes(domain)) sorted.push([domain, tools]);
    }
    return sorted;
  }, [filteredCoreTools, filteredTools, coreToolsLocked, resolvedEnabledSet]);

  // -- Group by domain ------------------------------------------
  const groupedTools = useMemo(() => {
    const groups = new Map<string, ToolSchema[]>();
    for (const tool of filteredTools) {
      const domain = tool.domain || "Other";
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain)!.push(tool);
    }
    const sorted: [string, ToolSchema[]][] = [];
    for (const domain of DOMAIN_ORDER) {
      if (groups.has(domain)) sorted.push([domain, groups.get(domain)!]);
    }
    for (const [domain, tools] of groups) {
      if (!DOMAIN_ORDER.includes(domain)) sorted.push([domain, tools]);
    }
    return sorted;
  }, [filteredTools]);

  // -- Group by label (tools appear under every label they carry)
  const groupedByLabel = useMemo(() => {
    const groups = new Map<string, ToolSchema[]>();
    for (const tool of filteredTools) {
      const labels =
        tool.labels && tool.labels.length > 0 ? tool.labels : ["other"];
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(tool);
      }
    }
    const sorted: [string, ToolSchema[]][] = [];
    for (const label of LABEL_ORDER) {
      if (groups.has(label)) sorted.push([label, groups.get(label)!]);
    }
    for (const [label, tools] of groups) {
      if (!LABEL_ORDER.includes(label)) sorted.push([label, tools]);
    }
    return sorted;
  }, [filteredTools]);

  // -- Group by intelligence tier --------------------------------
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

  const groupedByTier = useMemo(() => {
    const groups = new Map<string, ToolSchema[]>();
    for (const tool of filteredTools) {
      const tier = tool.intelligenceTier || "low";
      if (!groups.has(tier)) groups.set(tier, []);
      groups.get(tier)!.push(tool);
    }
    const sorted: [string, ToolSchema[]][] = [];
    for (const tier of TIER_ORDER) {
      if (groups.has(tier)) sorted.push([tier, groups.get(tier)!]);
    }
    for (const [tier, tools] of groups) {
      if (!TIER_ORDER.includes(tier)) sorted.push([tier, tools]);
    }
    return sorted;
  }, [filteredTools]);

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
      const currentTools = enabledTools || [];
      const isDomain = groupMode === "domain";
      const isLabel = groupMode === "label";
      const prefix = isDomain
          ? `domain:${groupKey}`
          : isLabel
              ? `label:${groupKey}`
              : `tier:${groupKey}`;

      const resolved = resolveEnabledTools(currentTools);
      const selectableGroupTools = groupTools.filter((tool) => !lockedOffTools.has(tool.name));
      const selectableGroupNames = selectableGroupTools.map((tool) => tool.name);
      const allSelectableEnabled = selectableGroupNames.every((name) => resolved.has(name));

      const hasActiveSearch = query.length > 0;

      if (groupKey === "core") {
        if (allSelectableEnabled) {
          onEnabledToolsChange?.(
              currentTools.filter((enabledToolEntry) => !selectableGroupNames.includes(enabledToolEntry)),
          );
        } else {
          const cleaned = currentTools.filter((enabledToolEntry) => !selectableGroupNames.includes(enabledToolEntry));
          onEnabledToolsChange?.([...cleaned, ...selectableGroupNames]);
        }
        return;
      }

      const hasGroupRef = currentTools.includes(prefix);
      if (hasGroupRef || allSelectableEnabled) {
        onEnabledToolsChange?.(
            currentTools.filter((enabledToolEntry) => enabledToolEntry !== prefix && !selectableGroupNames.includes(enabledToolEntry)),
        );
      } else {
        const cleaned = currentTools.filter((enabledToolEntry) => !selectableGroupNames.includes(enabledToolEntry));
        if (hasActiveSearch) {
          onEnabledToolsChange?.([...cleaned, ...selectableGroupNames]);
        } else {
          onEnabledToolsChange?.([...cleaned, prefix]);
        }
      }
    },
    [readOnly, enabledTools, groupMode, query, resolveEnabledTools, onEnabledToolsChange, lockedOffTools],
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
        <SegmentedControlComponent
          value={groupMode}
          onChange={setGroupMode}
          compact
          fullWidth
          segments={[
            { value: "domain", label: "Domain" },
            { value: "label", label: "Label" },
            { value: "tier", label: "Tier" },
            { value: "selected", label: "Selected" },
          ] satisfies SegmentDefinition[]}
        />
      </div>

      <div className={styles['tools-list-wrapper']}>

        {/* Master select-all / deselect-all checkbox */}
        {(groupMode !== "selected" || selectedGroupedByDomain.length > 0) && (
          <div className={styles['bulk-checkbox-row']}>
            <CheckboxComponent
              size="compact"
              checked={
                groupMode === "selected"
                  ? true
                  : selectableConfigurableTools.length > 0 &&
                    enabledConfigurableCount === selectableConfigurableTools.length
              }
              indeterminate={
                groupMode === "selected"
                  ? false
                  : enabledConfigurableCount > 0 &&
                    enabledConfigurableCount < selectableConfigurableTools.length
              }
              disabled={
                readOnly ||
                (groupMode === "selected" && enabledConfigurableCount === 0)
              }
              onChange={() => {
                if (readOnly) return;
                if (
                  groupMode === "selected" ||
                  enabledConfigurableCount === selectableConfigurableTools.length
                ) {
                  deselectAllTools();
                } else {
                  selectAllTools();
                }
              }}
              label={
                <span className={styles['bulk-checkbox-label']}>
                  {groupMode === "selected" ? "Deselect All" : "Select All"}
                </span>
              }
            />
            <span className={styles['domain-count']}>
              {totalEnabledCount}/{totalToolsCount}
            </span>
          </div>
        )}

        {/* System Tools Section */}
        {groupMode !== "selected" && filteredCoreTools.length > 0 && (
          <div className={styles['core-group']}>
            <div
              className={styles['core-header']}
              onClick={() => setCoreCollapsed(!coreCollapsed)}
            >
              {coreCollapsed ? (
                <ChevronRight size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              <span className={styles['core-icon']}>
                <Bot size={12} />
              </span>
              <span className={styles['core-label']}>System Tools</span>
              {coreToolsLocked ? (
                <span className={styles['core-badge']}>Locked On</span>
              ) : (
                <>
                  <span className={styles['domain-count']}>
                    {enabledCoreCount}/{coreTools.length}
                  </span>
                  <span onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                    <CheckboxComponent
                      size="compact"
                      checked={selectableCoreTools.length > 0 && enabledCoreCount === selectableCoreTools.length}
                      indeterminate={enabledCoreCount > 0 && enabledCoreCount < selectableCoreTools.length}
                      disabled={readOnly}
                      onChange={() => {
                        if (readOnly) return;
                        toggleGroupTools("core", coreTools);
                      }}
                    />
                  </span>
                </>
              )}
            </div>

            {!coreCollapsed && (
              <div className={styles['core-tools-list']}>
                {filteredCoreTools.map((tool) => (
                  <TooltipComponent
                    key={tool.name}
                    label={tool.description || "Core capability"}
                    position="right"
                    delay={400}
                  >
                    {coreToolsLocked ? (
                      <div
                        className={`${styles['tool-row']} ${styles['core-tool-row']}`}
                      >
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
                    ) : (
                      <div className={styles['tool-row']}>
                        <CheckboxComponent
                          size="compact"
                          className={styles['tool-checkbox']}
                          checked={resolvedEnabledSet.has(tool.name)}
                          disabled={readOnly}
                          onChange={() => {
                            if (readOnly) return;
                            toggleTool(tool.name);
                          }}
                          label={
                            <span className={styles['tool-name']}>
                              {renderToolName(tool.name)}
                            </span>
                          }
                        />
                      </div>
                    )}
                  </TooltipComponent>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Group rendering — domain, label, tier, or selected mode */}
        {groupMode === "selected" ? (
          <div className={styles['selected-tab-content']}>
            {selectedGroupedByDomain.length === 0 ? (
              <div className={styles['no-selected-tools-container']}>
                <Layers size={24} className={styles['no-selected-tools-icon']} />
                <span className={styles['no-selected-tools-message']}>No tools currently selected</span>
                <span className={styles['no-selected-tools-subtext']}>
                  Enable tools from the Domain, Label, or Tier tabs to see them here.
                </span>
              </div>
            ) : (
              selectedGroupedByDomain.map(([groupKey, tools]) => {
                const isCoreDomain = groupKey === DOMAINS.CORE_HARNESS.displayName || groupKey === DOMAINS.ORCHESTRATOR.displayName;
                const isMcp = groupKey.startsWith("Model Context Protocol:") || groupKey === "Model Context Protocol";
                const GroupIcon: LucideIcon = isMcp
                  ? Network
                  : DOMAIN_ICONS[groupKey] || Layers;
                const label = isMcp
                  ? groupKey.replace("Model Context Protocol: ", "MCP: ")
                  : DOMAIN_LABELS[groupKey] || groupKey;
                const collapsed = collapsedDomains.has(`selected:${groupKey}`);
                const selectableGroupTools = tools.filter((tool) => !lockedOffTools.has(tool.name));
                const groupEnabled = selectableGroupTools.filter((tool) =>
                  resolvedEnabledSet.has(tool.name),
                ).length;

                return (
                  <div key={groupKey} className={isCoreDomain ? styles['core-group'] : styles['domain-group']}>
                    <div
                      className={isCoreDomain ? styles['core-header'] : styles['domain-header']}
                      onClick={() => toggleDomain(`selected:${groupKey}`)}
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
                        <span className={styles['core-label']}>{label}</span>
                      ) : (
                        label
                      )}
                      {isCoreDomain && coreToolsLocked ? (
                        <span className={styles['core-badge']}>Locked On</span>
                      ) : (
                        <>
                          <span className={styles['domain-count']}>
                            {groupEnabled}/{tools.length}
                          </span>
                          <span onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                            <CheckboxComponent
                              size="compact"
                              checked={selectableGroupTools.length > 0 && groupEnabled === selectableGroupTools.length}
                              indeterminate={groupEnabled > 0 && groupEnabled < selectableGroupTools.length}
                              disabled={readOnly}
                              onChange={() => {
                                if (readOnly) return;
                                toggleGroupTools(isCoreDomain ? "core" : groupKey, tools);
                              }}
                            />
                          </span>
                        </>
                      )}
                    </div>

                    {!collapsed && (
                      <div className={isCoreDomain ? styles['core-tools-list'] : styles['tools-grid']}>
                        {tools.map((tool) => {
                          const isLocked = lockedOffTools.has(tool.name);
                          const lockReason = lockedOffTools.get(tool.name);
                          const isCoreLockedTool = isCoreDomain && coreToolsLocked;
                          return (
                            <TooltipComponent
                              key={tool.name}
                              label={isLocked ? lockReason! : (tool.description || (isCoreDomain ? "Core capability" : ""))}
                              position="right"
                              delay={isLocked ? 0 : 400}
                            >
                              {isCoreLockedTool ? (
                                <div className={`${styles['tool-row']} ${styles['core-tool-row']}`}>
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
                                <div className={`${styles['tool-row']} ${styles['locked-tool-row']}`}>
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
                                <div className={styles['tool-row']}>
                                  <CheckboxComponent
                                    size="compact"
                                    className={styles['tool-checkbox']}
                                    checked={resolvedEnabledSet.has(tool.name)}
                                    disabled={readOnly}
                                    onChange={() => {
                                      if (readOnly) return;
                                      toggleTool(tool.name);
                                    }}
                                    label={
                                      <span className={styles['tool-name']}>
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
              })
            )}
          </div>
        ) : (
          (groupMode === "domain"
            ? groupedTools
            : groupMode === "label"
              ? groupedByLabel
              : groupedByTier
          ).map(([groupKey, tools]) => {
            const isDomain = groupMode === "domain";
            const isLabel = groupMode === "label";
            const isMcp =
              isDomain && (groupKey.startsWith("Model Context Protocol:") || groupKey === "Model Context Protocol");
            const GroupIcon: LucideIcon = isMcp
              ? Network
              : isDomain
                ? DOMAIN_ICONS[groupKey] || Layers
                : isLabel
                  ? LABEL_ICONS[groupKey] || Tag
                  : TIER_ICONS[groupKey] || Brain;
            const label = isMcp
              ? groupKey.replace("Model Context Protocol: ", "MCP: ")
              : isDomain
                ? DOMAIN_LABELS[groupKey] || groupKey
                : isLabel
                  ? LABEL_DISPLAY[groupKey] || groupKey
                  : TIER_LABELS[groupKey] || groupKey;
            const collapsed = collapsedDomains.has(groupKey);
            const selectableGroupTools = tools.filter((tool) => !lockedOffTools.has(tool.name));
            const groupEnabled = selectableGroupTools.filter((tool) =>
              resolvedEnabledSet.has(tool.name),
            ).length;

            return (
              <div key={groupKey} className={styles['domain-group']}>
                <div
                  className={styles['domain-header']}
                  onClick={() => toggleDomain(groupKey)}
                >
                  {collapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <span className={styles['domain-icon']}>
                    <GroupIcon size={12} />
                  </span>
                  {label}
                  <span className={styles['domain-count']}>
                    {groupEnabled}/{tools.length}
                  </span>
                  <span onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                    <CheckboxComponent
                      size="compact"
                      checked={selectableGroupTools.length > 0 && groupEnabled === selectableGroupTools.length}
                      indeterminate={groupEnabled > 0 && groupEnabled < selectableGroupTools.length}
                      disabled={readOnly}
                      onChange={() => {
                        if (readOnly) return;
                        toggleGroupTools(groupKey, tools);
                      }}
                    />
                  </span>
                </div>

                {!collapsed && (
                  <div className={styles['tools-grid']}>
                    {tools.map((tool) => {
                      const isLocked = lockedOffTools.has(tool.name);
                      const lockReason = lockedOffTools.get(tool.name);
                      return (
                        <TooltipComponent
                          key={tool.name}
                          label={isLocked ? lockReason! : (tool.description || "")}
                          position="right"
                          delay={isLocked ? 0 : 400}
                        >
                          {isLocked ? (
                            <div className={`${styles['tool-row']} ${styles['locked-tool-row']}`}>
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
                            <div className={styles['tool-row']}>
                              <CheckboxComponent
                                size="compact"
                                className={styles['tool-checkbox']}
                                checked={resolvedEnabledSet.has(tool.name)}
                                disabled={readOnly}
                                onChange={() => {
                                  if (readOnly) return;
                                  toggleTool(tool.name);
                                }}
                                label={
                                  <span className={styles['tool-name']}>
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
          })
        )}
      </div>
    </div>
  );
}
