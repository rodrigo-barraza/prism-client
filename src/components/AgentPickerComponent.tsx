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
  Palette,
} from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { resolveIconComponent } from "./CustomAgentsPanelComponent";
import BadgeComponent from "./BadgeComponent";
import ToolBadgeComponent from "./ToolBadgeComponent";
import SoundService from "@/services/SoundService";
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
  IMAGE: Palette,
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
    const Resolved = resolveIconComponent(agent.icon) as any;
    return <Resolved size={size} />;
  }
  // Built-in agents use the hardcoded map
  const BuiltIn = (AGENT_ICONS[agent?.id] || Bot) as any;
  return <BuiltIn size={size} />;
}

/**
 * AgentPickerComponent — Compact popover for selecting the active agent persona.
 *
 * Supports two modes:
 *   - **default**: Select a single active agent (radio-style). Shows the active agent in the trigger.
 *   - **addMode**: Add agents to a list (benchmark page). Shows "Add Agent" / "N Agents" trigger pill.
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
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<any>(null);

  const activeAgent = addMode
    ? null
    : agents.find((a: any) => a.id === activeAgentId) || agents[0];

  const handleSelect = useCallback(
    (agentId: any) => {
      if (agentId !== activeAgentId) {
        onSelect?.(agentId);
      }
      setIsPopoverOpen(false);
      setHighlightedIndex(-1);
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

  // Reset highlighted index when popover closes
  useEffect(() => {
    if (!isPopoverOpen) {
      setHighlightedIndex(-1);
    }
  }, [isPopoverOpen]);

  // Keyboard navigation: Escape / ArrowUp / ArrowDown / Enter
  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPopoverOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((previousIndex) => {
          const maximumIndex = agents.length - 1;
          if (maximumIndex < 0) return -1;
          const nextIndex = previousIndex < maximumIndex ? previousIndex + 1 : 0;
          SoundService.playHover({});
          return nextIndex;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((previousIndex) => {
          const maximumIndex = agents.length - 1;
          if (maximumIndex < 0) return -1;
          const nextIndex = previousIndex > 0 ? previousIndex - 1 : maximumIndex;
          SoundService.playHover({});
          return nextIndex;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < agents.length) {
          const selectedAgent = agents[highlightedIndex];
          SoundService.playClickButton({});
          if (addMode) {
            handleAdd(selectedAgent);
          } else {
            handleSelect(selectedAgent.id);
          }
        }
        return;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen, highlightedIndex, agents, addMode, handleSelect, handleAdd]);

  if (agents.length === 0) return null;

  // Determine which agent should show the spinning animation.
  // When an item is highlighted (hovered or keyboard-navigated), that agent spins.
  // Otherwise, the currently selected/active agent spins.
  const spinningAgentId =
    highlightedIndex >= 0 && highlightedIndex < agents.length
      ? agents[highlightedIndex].id
      : activeAgentId;

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
            className={`${styles.trigger} ${styles.triggerAdd} ${isPopoverOpen ? styles.triggerAddOpen : ""} ${addCount > 0 ? styles.triggerAddActive : ""}`}
            onClick={() => !disabled && setIsPopoverOpen((v) => !v)}
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
              data-is-open={isPopoverOpen}
            />
          </button>
        ) : (
          /* -- Default trigger (active agent) -- */
          (() => {
            let buttonElement = (
              <button
                ref={triggerRef}
                className={styles.trigger}
                onClick={() => !disabled && setIsPopoverOpen((v) => !v)}
                title={`Active agent: ${activeAgent?.name || activeAgentId}`}
                disabled={disabled}
                type="button"
              >
                <BadgeComponent type="agent" agent={activeAgent} animation={!isPopoverOpen} />
                <span className={styles.triggerLabel}>
                  {activeAgent?.name || activeAgentId}
                </span>
                <ChevronDown
                  size={13}
                  className={styles.triggerChevron}
                  data-is-open={isPopoverOpen}
                />
              </button>
            );

            if (!disabled && activeAgent?.id !== "NONE") {
              buttonElement = (
                <TooltipComponent
                  label={
                    <div className={styles.tooltipCapabilities}>
                      <ToolBadgeComponent
                        name="Tool Calling"
                        count={activeAgent?.toolCount}
                        variant="condensed"
                        tooltip={`${activeAgent?.toolCount || 0} Tools available`}
                      />
                    </div>
                  }
                  position="bottom"
                  enterDelay={150}
                >
                  {buttonElement}
                </TooltipComponent>
              );
            }

            return buttonElement;
          })()
        )}
      </div>

      {isPopoverOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsPopoverOpen(false)} />
          <div className={styles.popover} role="listbox">
            {agents.map((agent: any, agentIndex: number) => {
              const isActive = !addMode && agent.id === activeAgentId;
              const isHighlighted = agentIndex === highlightedIndex;
              const shouldAnimate = agent.id === spinningAgentId;

              return (
                <button
                  key={agent.id}
                  className={styles.agentItem}
                  data-is-active-state={isActive}
                  data-is-highlighted-state={isHighlighted}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={(mouseEvent) => {
                    setHighlightedIndex(agentIndex);
                    SoundService.playHover({ event: mouseEvent.nativeEvent });
                  }}
                  onMouseLeave={() => {
                    setHighlightedIndex(-1);
                  }}
                  onClick={(mouseEvent) => {
                    SoundService.playClickButton({ event: mouseEvent.nativeEvent });
                    if (addMode) {
                      handleAdd(agent);
                    } else {
                      handleSelect(agent.id);
                    }
                  }}
                  type="button"
                  style={
                    agent.color
                      ? ({ "--agent-accent": agent.color } as React.CSSProperties)
                      : undefined
                  }
                >
                  <BadgeComponent type="agent" agent={agent} animation={shouldAnimate} />
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
                    </div>
                  </div>
                  {addMode ? (
                    <span className={styles.addButton}>
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
