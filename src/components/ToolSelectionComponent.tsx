"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Tag,
  FolderOpen,
  BookOpen,
  Search,
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
} from "lucide-react";
import { renderToolName } from "../utils/utilities";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ToolSelectionComponent.module.css";

// -- Domain icon mapping (mirrors CustomToolsPanel) --------------
const DOMAIN_ICONS = {
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

const DOMAIN_LABELS = {
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
const LABEL_ICONS = {
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
};

const LABEL_DISPLAY = {
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
function MasterCheckbox({ enabledCount, totalCount, onToggle, label }: any) {
  const ref = useRef<any>(null);
  const allChecked = totalCount > 0 && enabledCount === totalCount;
  const partial = enabledCount > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) (ref.current as HTMLInputElement).indeterminate = partial;
  }, [partial]);

  return (
    <label className={styles.bulkCheckboxRow}>
      <input
        ref={ref as React.Ref<HTMLInputElement>}
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
function DomainCheckbox({ domainEnabled, totalCount, onToggle }: any) {
  const ref = useRef<any>(null);
  const allChecked = totalCount > 0 && domainEnabled === totalCount;
  const partial = domainEnabled > 0 && !allChecked;

  useEffect(() => {
    if (ref.current) (ref.current as HTMLInputElement).indeterminate = partial;
  }, [partial]);

  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
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
}: any) {
  const [toolSearch, setToolSearch] = useState("");
  const [collapsedDomains, setCollapsedDomains] = useState(new Set());
  const [groupMode, setGroupMode] = useState("domain");

  // -- Resolve enabledTools → flat Set of tool names ------------
  const resolveEnabledTools = useCallback(
    (entries: any) => {
      const resolved = new Set();
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
  const enabledCount = resolvedEnabledSet.size;

  // -- Tool toggling --------------------------------------------
  const toggleTool = useCallback(
    (toolName: any) => {
      const tools = enabledTools || [];
      const resolved = new Set();
      for (const entry of tools) {
        if (!entry.startsWith("label:") && !entry.startsWith("domain:")) {
          resolved.add(entry);
        }
      }
      if (resolved.has(toolName)) {
        onEnabledToolsChange(tools.filter((t: any) => t !== toolName));
      } else {
        onEnabledToolsChange([...tools, toolName]);
      }
    },
    [enabledTools, onEnabledToolsChange],
  );

  const selectAllTools = useCallback(() => {
    onEnabledToolsChange(availableTools.map((t: any) => t.name));
  }, [availableTools, onEnabledToolsChange]);

  const deselectAllTools = useCallback(() => {
    onEnabledToolsChange([]);
  }, [onEnabledToolsChange]);

  // -- Filtering ------------------------------------------------
  const query = toolSearch.toLowerCase().trim();

  const filteredTools = useMemo(() => {
    if (!query) return availableTools;
    return availableTools.filter(
      (t: any) =>
        t.name?.toLowerCase().includes(query) ||
        renderToolName(t.name)?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query),
    );
  }, [availableTools, query]);

  // -- Group by domain ------------------------------------------
  const groupedTools = useMemo(() => {
    const groups = new Map();
    for (const tool of filteredTools) {
      const domain = tool.domain || "Other";
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(tool);
    }
    const sorted = [];
    for (const domain of DOMAIN_ORDER) {
      if (groups.has(domain)) sorted.push([domain, groups.get(domain)]);
    }
    for (const [domain, tools] of groups) {
      if (!DOMAIN_ORDER.includes(domain)) sorted.push([domain, tools]);
    }
    return sorted;
  }, [filteredTools]);

  // -- Group by label (tools appear under every label they carry)
  const groupedByLabel = useMemo(() => {
    const groups = new Map();
    for (const tool of filteredTools) {
      const labels =
        tool.labels && tool.labels.length > 0 ? tool.labels : ["other"];
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(tool);
      }
    }
    const sorted = [];
    for (const label of LABEL_ORDER) {
      if (groups.has(label)) sorted.push([label, groups.get(label)]);
    }
    for (const [label, tools] of groups) {
      if (!LABEL_ORDER.includes(label)) sorted.push([label, tools]);
    }
    return sorted;
  }, [filteredTools]);

  // -- Collapse toggling ----------------------------------------
  const toggleDomain = useCallback((domain: any) => {
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  // -- Toggle all tools in a group ------------------------------
  const toggleGroupTools = useCallback(
    (groupKey: any, groupTools: any) => {
      const currentTools = enabledTools || [];
      const isDomain = groupMode === "domain";
      const prefix = isDomain ? `domain:${groupKey}` : `label:${groupKey}`;

      const hasGroupRef = currentTools.includes(prefix);
      const resolved = resolveEnabledTools(currentTools);
      const groupNames = groupTools.map((t: any) => t.name);
      const allEnabled = groupNames.every((n: any) => resolved.has(n));

      if (hasGroupRef || allEnabled) {
        onEnabledToolsChange(
          currentTools.filter(
            (t: any) => t !== prefix && !groupNames.includes(t),
          ),
        );
      } else {
        const cleaned = currentTools.filter(
            (t: any) => !groupNames.includes(t),
        );
        onEnabledToolsChange([...cleaned, prefix]);
      }
    },
    [enabledTools, groupMode, resolveEnabledTools, onEnabledToolsChange],
  );

  // -- Render ---------------------------------------------------
  return (
    <div className={styles.toolsSection}>
      <div className={styles.toolsSectionHeader}>
        <label
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          Tools
        </label>
        <div className={styles.toolsSectionHeaderRight}>
          <div className={styles.segmentedControl}>
            <button
              type="button"
              className={styles.segmentedOption}
              data-active={groupMode === "domain"}
              onClick={() => setGroupMode("domain")}
            >
              <FolderOpen size={11} />
              Domain
            </button>
            <button
              type="button"
              className={styles.segmentedOption}
              data-active={groupMode === "label"}
              onClick={() => setGroupMode("label")}
            >
              <Tag size={11} />
              Label
            </button>
          </div>
          <span className={styles.toolsSummary}>
            {enabledCount} / {availableTools.length}
          </span>
        </div>
      </div>

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

        {/* Master select-all checkbox */}
        <MasterCheckbox
          enabledCount={enabledCount}
          totalCount={availableTools.length}
          onToggle={() => {
            if (enabledCount === availableTools.length) {
              deselectAllTools();
            } else {
              selectAllTools();
            }
          }}
          label="Select All"
        />

        {/* Group rendering — domain or label mode */}
        {(groupMode === "domain" ? groupedTools : groupedByLabel).map(
          ([groupKey, tools]: any) => {
            const isDomain = groupMode === "domain";
            const GroupIcon = (isDomain
              ? (DOMAIN_ICONS as any)[groupKey] || Layers
              : (LABEL_ICONS as any)[groupKey] || Tag) as any;
            const label = isDomain
              ? (DOMAIN_LABELS as any)[groupKey] || groupKey
              : (LABEL_DISPLAY as any)[groupKey] || groupKey;
            const collapsed = collapsedDomains.has(groupKey);
            const groupEnabled = tools.filter((t: any) =>
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
                  tools.map((tool: any) => (
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
