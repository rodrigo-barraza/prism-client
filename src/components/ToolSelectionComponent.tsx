"use client";

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
  onEnabledToolsChange: (tools: string[]) => void;
  agent?: boolean;
}

// -- Domain icon mapping (mirrors CustomToolsPanel) --------------
const DOMAIN_ICONS: Record<string, LucideIcon> = {
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
  "Agentic: Workspace": FolderOpen,
  "Agentic: Web": Globe2,
  "Agentic: Browser": MonitorSmartphone,
  "Agentic: Task Management": Wrench,
  "Agentic: Memory": BookOpen,
  "Agentic: Agent Management": Bot,
  "Agentic: Meta": Search,
  "Cron Jobs": CalendarDays,
  Timers: CalendarDays,
  "Agentic: Skills": Layers,
  "Agentic: Control Flow": Cpu,
  "Agentic: Structured Output": Code2,
  Creative: Sparkles,
  Discord: Radio,
  "Smart Home": Lightbulb,
  Sports: Trophy,
  Utilities: Wrench,
  Coordinator: Bot,
  Other: Layers,
};

const DOMAIN_LABELS: Record<string, string> = {
  "Agentic: Workspace": "Workspace Tools",
  "Agentic: Web": "Web",
  "Agentic: Browser": "Browser",
  "Agentic: Task Management": "Task Management",
  "Agentic: Memory": "Memory",
  "Agentic: Agent Management": "Agent Management",
  "Agentic: Meta": "Tool Discovery",
  "Cron Jobs": "Cron Jobs",
  Timers: "Timers",
  "Agentic: Skills": "Skills",
  "Agentic: Control Flow": "Control Flow",
  "Agentic: Structured Output": "Structured Output",
};

const DOMAIN_ORDER = [
  "Agentic: Workspace",
  "Agentic: Web",
  "Agentic: Browser",
  "Agentic: Task Management",
  "Agentic: Memory",
  "Agentic: Agent Management",
  "Agentic: Meta",
  "Cron Jobs",
  "Timers",
  "Agentic: Skills",
  "Agentic: Control Flow",
  "Agentic: Structured Output",
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
  agent = true,
}: ToolSelectionProps) {
  const [toolSearch, setToolSearch] = useState("");
  const [collapsedDomains, setCollapsedDomains] = useState(new Set<string>());
  const [groupMode, setGroupMode] = useState("domain");
  const [coreCollapsed, setCoreCollapsed] = useState(true);

  // -- Split availableTools into Core Agentic and Configurable ----
  const { coreTools, configurableTools } = useMemo(() => {
    const core: ToolSchema[] = [];
    const config: ToolSchema[] = [];
    for (const t of availableTools || []) {
      if (t.system === true) {
        core.push(t);
      } else {
        config.push(t);
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
          for (const t of availableTools) {
            if (t.labels?.includes(label)) resolved.add(t.name);
          }
        } else if (entry.startsWith("domain:")) {
          const domain = entry.slice(7);
          for (const t of availableTools) {
            if (t.domain === domain) resolved.add(t.name);
          }
        } else if (entry.startsWith("tier:")) {
          const tier = entry.slice(5);
          for (const t of availableTools) {
            if (t.intelligenceTier === tier) resolved.add(t.name);
          }
        } else {
          resolved.add(entry);
        }
      }
      return resolved;
    },
    [availableTools],
  );

  const resolvedEnabledSet = useMemo(
    () => resolveEnabledTools(enabledTools),
    [resolveEnabledTools, enabledTools],
  );

  // -- Core tools enabled count ---------------------------------
  const enabledCoreCount = useMemo(() => {
    let count = 0;
    for (const t of coreTools) {
      if (resolvedEnabledSet.has(t.name)) {
        count++;
      }
    }
    return count;
  }, [coreTools, resolvedEnabledSet]);

  // -- Configurable enabled count --------------------------------
  const enabledConfigurableCount = useMemo(() => {
    let count = 0;
    for (const t of configurableTools) {
      if (resolvedEnabledSet.has(t.name)) {
        count++;
      }
    }
    return count;
  }, [configurableTools, resolvedEnabledSet]);

  // -- Tool toggling --------------------------------------------
  const toggleTool = useCallback(
    (toolName: string) => {
      const tools = enabledTools || [];
      const resolved = new Set<string>();
      for (const entry of tools) {
        if (!entry.startsWith("label:") && !entry.startsWith("domain:")) {
          resolved.add(entry);
        }
      }
      if (resolved.has(toolName)) {
        onEnabledToolsChange(tools.filter((t) => t !== toolName));
      } else {
        onEnabledToolsChange([...tools, toolName]);
      }
    },
    [enabledTools, onEnabledToolsChange],
  );

  const selectAllTools = useCallback(() => {
    onEnabledToolsChange(configurableTools.map((t) => t.name));
  }, [configurableTools, onEnabledToolsChange]);

  const deselectAllTools = useCallback(() => {
    onEnabledToolsChange([]);
  }, [onEnabledToolsChange]);

  // -- Filtering ------------------------------------------------
  const query = toolSearch.toLowerCase().trim();

  const filteredCoreTools = useMemo(() => {
    if (!query) return coreTools;
    return coreTools.filter(
      (t) =>
        t.name?.toLowerCase().includes(query) ||
        renderToolName(t.name)?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query),
    );
  }, [coreTools, query]);

  const filteredTools = useMemo(() => {
    if (!query) return configurableTools;
    return configurableTools.filter(
      (t) =>
        t.name?.toLowerCase().includes(query) ||
        renderToolName(t.name)?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query),
    );
  }, [configurableTools, query]);

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
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  // -- Toggle all tools in a group ------------------------------
  const toggleGroupTools = useCallback(
    (groupKey: string, groupTools: ToolSchema[]) => {
      const currentTools = enabledTools || [];
      const isDomain = groupMode === "domain";
      const isLabel = groupMode === "label";
      const prefix = isDomain
        ? `domain:${groupKey}`
        : isLabel
          ? `label:${groupKey}`
          : `tier:${groupKey}`;

      const resolved = resolveEnabledTools(currentTools);
      const groupNames = groupTools.map((t) => t.name);
      const allEnabled = groupNames.every((n) => resolved.has(n));

      if (groupKey === "core") {
        if (allEnabled) {
          onEnabledToolsChange(
            currentTools.filter((t) => !groupNames.includes(t)),
          );
        } else {
          const cleaned = currentTools.filter((t) => !groupNames.includes(t));
          onEnabledToolsChange([...cleaned, ...groupNames]);
        }
        return;
      }

      const hasGroupRef = currentTools.includes(prefix);
      if (hasGroupRef || allEnabled) {
        onEnabledToolsChange(
          currentTools.filter((t) => t !== prefix && !groupNames.includes(t)),
        );
      } else {
        const cleaned = currentTools.filter((t) => !groupNames.includes(t));
        onEnabledToolsChange([...cleaned, prefix]);
      }
    },
    [enabledTools, groupMode, resolveEnabledTools, onEnabledToolsChange],
  );

  // -- Render ---------------------------------------------------
  return (
    <div className={styles.toolsSection}>
      {/* Search — pinned above scroll */}
      <SearchInputComponent
        value={toolSearch}
        onChange={setToolSearch}
        placeholder="Search tools..."
        className={styles.toolsSearch}
      />

      <div className={styles.toolsSectionHeaderRight}>
        <SegmentedControlComponent
          value={groupMode}
          onChange={setGroupMode}
          compact
          fullWidth
          segments={[
            { value: "domain", label: "Domain", icon: <FolderOpen size={11} /> },
            { value: "label", label: "Label", icon: <Tag size={11} /> },
            { value: "tier", label: "Tier", icon: <Brain size={11} /> },
          ] satisfies SegmentDefinition[]}
        />
      </div>

      <div className={styles.toolsListWrapper}>

        {/* Master select-all checkbox */}
        <div className={styles.bulkCheckboxRow}>
          <CheckboxComponent
            size="compact"
            checked={configurableTools.length > 0 && enabledConfigurableCount === configurableTools.length}
            indeterminate={enabledConfigurableCount > 0 && enabledConfigurableCount < configurableTools.length}
            onChange={() => {
              if (enabledConfigurableCount === configurableTools.length) {
                deselectAllTools();
              } else {
                selectAllTools();
              }
            }}
            label={<span className={styles.bulkCheckboxLabel}>Select All</span>}
          />
        </div>

        {/* Core Agentic Tools Section */}
        {filteredCoreTools.length > 0 && (
          <div className={styles.coreGroup}>
            <div
              className={styles.coreHeader}
              onClick={() => setCoreCollapsed(!coreCollapsed)}
            >
              {coreCollapsed ? (
                <ChevronRight size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              <span className={styles.coreIcon}>
                <Bot size={12} />
              </span>
              <span className={styles.coreLabel}>Core Agentic Tools</span>
              {agent ? (
                <span className={styles.coreBadge}>Locked On</span>
              ) : (
                <>
                  <span className={styles.domainCount}>
                    {enabledCoreCount}/{coreTools.length}
                  </span>
                  <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <CheckboxComponent
                      size="compact"
                      checked={coreTools.length > 0 && enabledCoreCount === coreTools.length}
                      indeterminate={enabledCoreCount > 0 && enabledCoreCount < coreTools.length}
                      onChange={() => toggleGroupTools("core", coreTools)}
                    />
                  </span>
                </>
              )}
            </div>

            {!coreCollapsed && (
              <div className={styles.coreToolsList}>
                {filteredCoreTools.map((tool) => (
                  <TooltipComponent
                    key={tool.name}
                    label={tool.description || "Core capability"}
                    position="right"
                    delay={400}
                  >
                    {agent ? (
                      <div
                        className={`${styles.toolRow} ${styles.coreToolRow}`}
                      >
                        <CheckboxComponent
                          size="compact"
                          checked={true}
                          disabled={true}
                          onChange={() => {}}
                          label={
                            <span className={`${styles.toolName} ${styles.coreToolName}`}>
                              {renderToolName(tool.name)}
                            </span>
                          }
                        />
                        <Lock size={10} className={styles.lockIcon} />
                      </div>
                    ) : (
                      <div className={styles.toolRow}>
                        <CheckboxComponent
                          size="compact"
                          checked={resolvedEnabledSet.has(tool.name)}
                          onChange={() => toggleTool(tool.name)}
                          label={
                            <span className={styles.toolName}>
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

        {/* Group rendering — domain, label, or tier mode */}
        {(groupMode === "domain"
          ? groupedTools
          : groupMode === "label"
            ? groupedByLabel
            : groupedByTier
        ).map(([groupKey, tools]) => {
          const isDomain = groupMode === "domain";
          const isLabel = groupMode === "label";
          const isMcp =
            isDomain && groupKey.startsWith("Model Context Protocol:");
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
          const groupEnabled = tools.filter((t) =>
            resolvedEnabledSet.has(t.name),
          ).length;

          return (
            <div key={groupKey} className={styles.domainGroup}>
              <div
                className={styles.domainHeader}
                onClick={() => toggleDomain(groupKey)}
              >
                {collapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <span className={styles.domainIcon}>
                  <GroupIcon size={12} />
                </span>
                {label}
                <span className={styles.domainCount}>
                  {groupEnabled}/{tools.length}
                </span>
                <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <CheckboxComponent
                    size="compact"
                    checked={tools.length > 0 && groupEnabled === tools.length}
                    indeterminate={groupEnabled > 0 && groupEnabled < tools.length}
                    onChange={() => toggleGroupTools(groupKey, tools)}
                  />
                </span>
              </div>

              {!collapsed &&
                tools.map((tool) => (
                  <TooltipComponent
                    key={tool.name}
                    label={tool.description}
                    position="right"
                    delay={400}
                  >
                    <div className={styles.toolRow}>
                      <CheckboxComponent
                        size="compact"
                        checked={resolvedEnabledSet.has(tool.name)}
                        onChange={() => toggleTool(tool.name)}
                        label={
                          <span className={styles.toolName}>
                            {renderToolName(tool.name)}
                          </span>
                        }
                      />
                    </div>
                  </TooltipComponent>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
