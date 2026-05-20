"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  ChevronDown,
  Wrench,
  Check,
  Plus,
  Skull,
  Sticker,
  Apple,
  Lightbulb,
  Hammer,
  MessageSquare,
  Infinity,
} from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { resolveIconComponent } from "./CustomAgentsPanelComponent";
import AgentBadgeComponent from "./AgentBadgeComponent";
import ToolBadgeComponent from "./ToolBadgeComponent";
import styles from "./AgentPickerComponent.module.css";

/** Image-based agent icons (rendered as <img> instead of SVG). */
const AGENT_IMAGES: Record<string, string> = {
  OMNI: "/omni-agent-logo.png",
};

/**
 * Icon mapping per agent ID — built-in agents only.
 * Custom agents use the `icon` field stored in their data.
 */
const AGENT_ICONS: Record<string, any> = {
  NONE: MessageSquare,
  CODING: Bot,
  OMNI: Infinity,
  LUPOS: Skull,
  STICKERS: Sticker,
  DIGEST: Apple,
  LIGHTS: Lightbulb,
  OOG: Hammer,
};

/** Render the correct icon for an agent — image logo > custom icon field > built-in map. */
export function renderAgentIcon(agent: any, size = 15) {
  // Image-based agent logos (e.g. OMNI)
  const imageSrc = AGENT_IMAGES[agent?.id];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={agent?.name || agent?.id}
        width={size}
        height={size}
        style={{ objectFit: "contain", borderRadius: 2 }}
      />
    );
  }
  // Custom agents store an icon name string
  if (typeof agent?.icon === "string" && agent.icon) {
    const Resolved = resolveIconComponent(agent.icon);
    return <Resolved size={size} />;
  }
  // Built-in agents use the hardcoded map
  const BuiltIn = AGENT_ICONS[agent?.id] || Bot;
  return <BuiltIn size={size} />;
}

/**
 * AgentPickerComponent — Compact popover for selecting the active agent persona.
 *
 * Supports two modes:
 *   - **default**: Select a single active agent (radio-style). Shows the active agent in the trigger.
 *   - **addMode**: Add agents to a list (benchmark page). Shows "Add Agent" / "N Agents" trigger pill.
 *
 * @param {Array<{ id, name, project, toolCount, icon?, color? }>} agents - Available agent personas


 */
export default function AgentPickerComponent({
  agents = [],
  activeAgentId,
  onSelect,
  disabled = false,
  addMode = false,
  addCount = 0,
  onAddAgent,
}: any) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<any>(null);

  const activeAgent = addMode
    ? null
    : agents.find((a: any) => a.id === activeAgentId) || agents[0];

  const handleSelect = useCallback(
    (agentId: any) => {
      if (agentId !== activeAgentId) {
        onSelect?.(agentId);
      }
      setOpen(false);
      document.dispatchEvent(new CustomEvent("panel:dismiss-sidebars"));
    },
    [activeAgentId, onSelect],
  );

  const handleAdd = useCallback(
    (agent: any) => {
      onAddAgent?.(agent);
    },
    [onAddAgent],
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: any) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  if (agents.length === 0) return null;

  // -- Add-mode trigger label ----------------------------------
  const addLabel =
    addCount === 0
      ? "Add Agent"
      : addCount === 1
        ? "1 Agent"
        : `${addCount} Agents`;

  const triggerContent = (
    <div style={{ position: "relative" }}>
      <div className={`${styles.triggerWrap} ${disabled ? styles.triggerDisabled : ""}`}>
        {addMode ? (
          /* -- Add-mode trigger pill -- */
          <button
            ref={triggerRef}
            className={`${styles.trigger} ${styles.triggerAdd} ${open ? styles.triggerAddOpen : ""} ${addCount > 0 ? styles.triggerAddActive : ""}`}
            onClick={() => !disabled && setOpen((v: any) => !v)}
            title="Add agent to benchmark"
            disabled={disabled}
            type="button"
          >
            <span className={styles.triggerAddContent}>
              <Bot size={14} className={styles.triggerAddIcon} />
              <span className={styles.triggerLabel}>{addLabel}</span>
            </span>
            <ChevronDown
              size={14}
              className={styles.triggerChevron}
              data-open={open}
            />
          </button>
        ) : (
          /* -- Default trigger (active agent) -- */
          <>
            <button
              ref={triggerRef}
              className={styles.trigger}
              onClick={() => !disabled && setOpen((v: any) => !v)}
              title={`Active agent: ${activeAgent?.name || activeAgentId}`}
              disabled={disabled}
              type="button"
            >
              <AgentBadgeComponent agent={activeAgent} />
              <span className={styles.triggerLabel}>
                {activeAgent?.name || activeAgentId}
              </span>
              <ChevronDown
                size={13}
                className={styles.triggerChevron}
                data-open={open}
              />
            </button>
            {activeAgent?.id !== "NONE" && (
              <ToolBadgeComponent
                name="Tool Calling"
                count={activeAgent?.toolCount}
                variant="condensed"
                tooltip={`${activeAgent?.toolCount || 0} Tools available`}
              />
            )}
          </>
        )}
      </div>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.popover}>
            {agents.map((agent: any) => {
              const isActive = !addMode && agent.id === activeAgentId;

              return (
                <button
                  key={agent.id}
                  className={styles.agentItem}
                  data-active={isActive}
                  onClick={() =>
                    addMode ? handleAdd(agent) : handleSelect(agent.id)
                  }
                  type="button"
                  style={
                    agent.color
                      ? ({ "--agent-accent": agent.color } as any)
                      : undefined
                  }
                >
                  <AgentBadgeComponent agent={agent} />
                  <div className={styles.agentInfo}>
                    <div className={styles.agentName}>{agent.name}</div>
                    <div className={styles.agentMeta}>
                      {agent.id !== "NONE" && (
                        <span className={styles.toolBadge}>
                          <Wrench size={9} />
                          {agent.toolCount === -1
                            ? "All tools"
                            : `${agent.toolCount} tools`}
                        </span>
                      )}
                      {addMode && agent.description && (
                        <span>{agent.description}</span>
                      )}
                      {agent.project && <span>{agent.project}</span>}
                    </div>
                  </div>
                  {addMode ? (
                    <span className={styles.addBtn}>
                      <Plus size={12} />
                      Add
                    </span>
                  ) : isActive ? (
                    <Check
                      size={14}
                      className={styles.activeCheck}
                      style={agent.color ? { color: agent.color } : undefined}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  if (disabled) {
    return (
      <TooltipComponent
        label="Start a new session to switch agents"
        position="bottom"
        enterDelay={200}
      >
        {triggerContent}
      </TooltipComponent>
    );
  }

  return triggerContent;
}
