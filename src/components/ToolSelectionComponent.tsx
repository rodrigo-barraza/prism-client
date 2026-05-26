"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
} from "lucide-react";
import { renderToolName } from "../utils/utilities";
import { TooltipComponent, ButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./ToolSelectionComponent.module.css";

// -- Interfaces --------------------------------------------------

interface ToolSchema {
  name: string;
  description?: string;
  domain?: string;
  labels?: string[];
  system?: boolean;
}

interface MasterCheckboxProps {
  enabledCount: number;
  totalCount: number;
  onToggle: () => void;
  label: string;
}

interface DomainCheckboxProps {
  domainEnabled: number;
  totalCount: number;
  onToggle: () => void;
}

interface ToolSelectionProps {
  availableTools?: ToolSchema[];
  enabledTools?: string[];
  onEnabledToolsChange: (tools: string[]) => void;
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
  "Agentic: File Operations": FolderOpen,
  "Agentic: Search & Discovery": Search,
  "Agentic: Web": Globe2,
  "Agentic: Command Execution": TerminalSquare,
  "Agentic: Git": GitBranch,
  "Agentic: Browser": MonitorSmartphone,
  "Agentic: Code Intelligence": Code2,
  "Agentic: Task Management": Wrench,
  "Agentic: Memory": BookOpen,
  "Agentic: Agent Management": Bot,
  "Agentic: Meta": Search,
  "Agentic: Scheduling": CalendarDays,
  "Agentic: Skills": Layers,
  "Agentic: Control Flow": Cpu,
  "Agentic: Structured Output": Code2,
  "Agentic: Git Isolation": GitBranch,
  Creative: Sparkles,
  Discord: Radio,
  "Smart Home": Lightbulb,
  Sports: Trophy,
  Utilities: Wrench,
  Coordinator: Bot,
  Other: Layers,
};

const DOMAIN_LABELS: Record<string, string> = {
  "Agentic: File Operations": "File Operations",
  "Agentic: Search & Discovery": "Search & Discovery",
  "Agentic: Web": "Web",
  "Agentic: Command Execution": "Command Execution",
  "Agentic: Git": "Git",
  "Agentic: Browser": "Browser",
  "Agentic: Code Intelligence": "Code Intelligence",
  "Agentic: Task Management": "Task Management",
  "Agentic: Memory": "Memory",
  "Agentic: Agent Management": "Agent Management",
  "Agentic: Meta": "Tool Discovery",
  "Agentic: Scheduling": "Scheduling",
  "Agentic: Skills": "Skills",
  "Agentic: Control Flow": "Control Flow",
  "Agentic: Structured Output": "Structured Output",
  "Agentic: Git Isolation": "Git Isolation",
};

const DOMAIN_ORDER = [
  "Agentic: File Operations",
  "Agentic: Search & Discovery",
  "Agentic: Web",
  "Agentic: Command Execution",
  "Agentic: Git",
  "Agentic: Git Isolation",
  "Agentic: Browser",
  "Agentic: Code Intelligence",
  "Agentic: Task Management",
  "Agentic: Memory",
  "Agentic: Agent Management",
  "Agentic: Meta",
  "Agentic: Scheduling",
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

// -- Tri-state checkbox: global select-all -----------------------
function MasterCheckbox({ enabledCount, totalCount, onToggle, label }: MasterCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const allChecked = totalCount > 0 && enabledCount === totalCount;
  const partial = enabledCount > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);

  return (
    <label className={styles.bulkCheckboxRow}>
      <input
        ref={ref}
        type="checkbox"
        className={styles.toolCheckbox}
        checked={allChecked}
        onChange={onToggle}
      />
      <span className={styles.bulkCheckboxLabel}>{label}</span>
    </label>
  );
}

// -- Tri-state checkbox: per-domain select-all -------------------
function DomainCheckbox({ domainEnabled, totalCount, onToggle }: DomainCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const allChecked = totalCount > 0 && domainEnabled === totalCount;
  const partial = domainEnabled > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.domainCheckbox}
      checked={allChecked}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        e.stopPropagation();
        onToggle();
      }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    />
  );
}

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
}: ToolSelectionProps) {
  const [toolSearch, setToolSearch] = useState("");
  const [collapsedDomains, setCollapsedDomains] = useState(new Set<string>());
  const [groupMode, setGroupMode] = useState("domain");
  const [coreCollapsed, setCoreCollapsed] = useState(false);

  // -- Split availableTools into Core System and Configurable ----
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
      const prefix = isDomain ? `domain:${groupKey}` : `label:${groupKey}`;

      const hasGroupRef = currentTools.includes(prefix);
      const resolved = resolveEnabledTools(currentTools);
      const groupNames = groupTools.map((t) => t.name);
      const allEnabled = groupNames.every((n) => resolved.has(n));

      if (hasGroupRef || allEnabled) {
        onEnabledToolsChange(
          currentTools.filter(
            (t) => t !== prefix && !groupNames.includes(t),
          ),
        );
      } else {
        const cleaned = currentTools.filter(
            (t) => !groupNames.includes(t),
        );
        onEnabledToolsChange([...cleaned, prefix]);
      }
    },
    [enabledTools, groupMode, resolveEnabledTools, onEnabledToolsChange],
  );

  // -- Render ---------------------------------------------------
  return (
    <div className={styles.toolsSection}>
      <div className={styles.toolsListWrapper}>
        {/* Search */}
        <div className={styles.toolsSearch}>
          <input
            type="text"
            className={styles.toolsSearchInput}
            placeholder="Search tools..."
            value={toolSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setToolSearch(e.target.value)}
          />
        </div>

        <div className={styles.toolsSectionHeaderRight}>
          <div className={styles.segmentedControl}>
            <ButtonComponent
              variant={groupMode === "domain" ? "tonal" : "secondary"}
              size="small"
              icon={FolderOpen}
              iconSize={11}
              onClick={() => setGroupMode("domain")}
            >
              Domain
            </ButtonComponent>
            <ButtonComponent
              variant={groupMode === "label" ? "tonal" : "secondary"}
              size="small"
              icon={Tag}
              iconSize={11}
              onClick={() => setGroupMode("label")}
            >
              Label
            </ButtonComponent>
          </div>
        </div>

        {/* Master select-all checkbox */}
        <MasterCheckbox
          enabledCount={enabledConfigurableCount}
          totalCount={configurableTools.length}
          onToggle={() => {
            if (enabledConfigurableCount === configurableTools.length) {
              deselectAllTools();
            } else {
              selectAllTools();
            }
          }}
          label="Select All"
        />

        {/* Core System Tools Section */}
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
              <span className={styles.coreLabel}>Core System Tools</span>
              <span className={styles.coreBadge}>Locked On</span>
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
                    <label className={`${styles.toolRow} ${styles.coreToolRow}`}>
                      <input
                        type="checkbox"
                        className={`${styles.toolCheckbox} ${styles.coreCheckbox}`}
                        checked={true}
                        disabled={true}
                      />
                      <span className={`${styles.toolName} ${styles.coreToolName}`}>
                        {renderToolName(tool.name)}
                      </span>
                      <Lock size={10} className={styles.lockIcon} />
                    </label>
                  </TooltipComponent>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Group rendering — domain or label mode */}
        {(groupMode === "domain" ? groupedTools : groupedByLabel).map(
          ([groupKey, tools]) => {
            const isDomain = groupMode === "domain";
            const isMcp = isDomain && groupKey.startsWith("Model Context Protocol:");
            const GroupIcon: LucideIcon = isMcp
              ? Network
              : isDomain
              ? DOMAIN_ICONS[groupKey] || Layers
              : LABEL_ICONS[groupKey] || Tag;
            const label = isMcp
              ? groupKey.replace("Model Context Protocol: ", "MCP: ")
              : isDomain
              ? DOMAIN_LABELS[groupKey] || groupKey
              : LABEL_DISPLAY[groupKey] || groupKey;
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
                  <DomainCheckbox
                    domainEnabled={groupEnabled}
                    totalCount={tools.length}
                    onToggle={() => toggleGroupTools(groupKey, tools)}
                  />
                </div>

                {!collapsed &&
                  tools.map((tool) => (
                    <TooltipComponent
                      key={tool.name}
                      label={tool.description}
                      position="right"
                      delay={400}
                    >
                      <label className={styles.toolRow}>
                        <input
                          type="checkbox"
                          className={styles.toolCheckbox}
                          checked={resolvedEnabledSet.has(tool.name)}
                          onChange={() => toggleTool(tool.name)}
                        />
                        <span className={styles.toolName}>
                          {renderToolName(tool.name)}
                        </span>
                      </label>
                    </TooltipComponent>
                  ))}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
