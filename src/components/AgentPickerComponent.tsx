"use client";
import { AGENT_IDS, EV_PANEL_DISMISS_SIDEBARS } from "@/constants";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Bot,
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
import { SelectComponent, SearchInputComponent } from "@rodrigo-barraza/components-library";
import { resolveIconComponent } from "./CustomAgentsPanelComponent";
import BadgeComponent, { type ClientAgent } from "./BadgeComponent";
import ToolBadgeComponent from "./ToolBadgeComponent";
import SoundService from "@/services/SoundService";
import styles from "./AgentPickerComponent.module.css";

interface AgentPickerComponentProps {
  agents?: ClientAgent[];
  activeAgentId?: string;
  onSelect?: (agentId: string) => void;
  disabled?: boolean;
  addMode?: boolean;
  addCount?: number;
  onAddAgent?: (agent: ClientAgent) => void;
}

/** Image-based agent icons (rendered as <img> instead of SVG). */
const AGENT_IMAGES: Record<string, string> = {
  OMNI: "/omni-agent-avatar.png",
  STICKERS: "/clankerbox-agent-avatar.png",
  OOG: "/oog-agent-avatar.jpg",
};

/**
 * Icon mapping per agent ID — built-in agents only.
 * Custom agents use the `icon` field stored in their data.
 */
const AGENT_ICONS: Record<string, React.ElementType> = {
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

/** Render the correct icon for an agent — image logo > avatar > icon > built-in map. */
export function renderAgentIcon(agent: ClientAgent | string | null | undefined, size = 15) {
  // Normalize string agent IDs to ClientAgent objects
  const normalizedAgent: ClientAgent | null | undefined =
    typeof agent === "string" ? { id: agent, name: agent } : agent;
  // Image-based agent logos (e.g. OMNI)
  const imageSrc = AGENT_IMAGES[normalizedAgent?.id || ""];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={normalizedAgent?.name || normalizedAgent?.id}
        width={size}
        height={size}
        style={{ objectFit: "contain", borderRadius: 2 }}
      />
    );
  }
  // Avatar field — image URL or data URL for custom avatar images
  if (typeof normalizedAgent?.avatar === "string" && normalizedAgent.avatar) {
    return (
      <img
        src={normalizedAgent.avatar}
        alt={normalizedAgent?.name || normalizedAgent?.id}
        width={size}
        height={size}
        style={{ objectFit: "cover", borderRadius: "50%" }}
      />
    );
  }
  // Icon field — Lucide icon name string (e.g. "Bot", "Skull", "Palette")
  if (typeof normalizedAgent?.icon === "string" && normalizedAgent.icon) {
    const Resolved = resolveIconComponent(normalizedAgent.icon) as React.ElementType;
    return <Resolved size={size} />;
  }
  // Built-in agents use the hardcoded map
  const BuiltIn = (AGENT_ICONS[normalizedAgent?.id || ""] || Bot) as React.ElementType;
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
}: AgentPickerComponentProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Move "NONE" / "Agentless" to the bottom of the list
  const sortedAgents = useMemo(() => {
    return [...agents].sort((firstAgent, secondAgent) => {
      if (firstAgent.id === AGENT_IDS.NONE) return 1;
      if (secondAgent.id === AGENT_IDS.NONE) return -1;
      return 0;
    });
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedAgents;
    return sortedAgents.filter((agent: ClientAgent) => {
      const nameMatches = agent.name?.toLowerCase().includes(query);
      const descriptionMatches = agent.description?.toLowerCase().includes(query);
      const idMatches = agent.id?.toLowerCase().includes(query);
      return nameMatches || descriptionMatches || idMatches;
    });
  }, [searchQuery, sortedAgents]);

  const activeAgent = addMode
    ? null
    : sortedAgents.find((agent: ClientAgent) => agent.id === activeAgentId) || sortedAgents[0];

  const handleSelect = useCallback(
    (agentId: string) => {
      if (agentId !== activeAgentId) {
        onSelect?.(agentId);
      }
      setIsPopoverOpen(false);
      setHighlightedIndex(-1);
      document.dispatchEvent(new CustomEvent(EV_PANEL_DISMISS_SIDEBARS));
    },
    [activeAgentId, onSelect],
  );

  const handleAdd = useCallback(
    (agent: ClientAgent) => {
      onAddAgent?.(agent);
    },
    [onAddAgent],
  );

  // Reset highlighted index and search query when popover closes
  useEffect(() => {
    if (!isPopoverOpen) {
      setHighlightedIndex(-1);
      setSearchQuery("");
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
          const maximumIndex = filteredAgents.length - 1;
          if (maximumIndex < 0) return -1;
          const nextIndex =
            previousIndex < maximumIndex ? previousIndex + 1 : 0;
          SoundService.playHover({});
          return nextIndex;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((previousIndex) => {
          const maximumIndex = filteredAgents.length - 1;
          if (maximumIndex < 0) return -1;
          const nextIndex =
            previousIndex > 0 ? previousIndex - 1 : maximumIndex;
          SoundService.playHover({});
          return nextIndex;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredAgents.length) {
          const selectedAgent = filteredAgents[highlightedIndex];
          SoundService.playClickButton({});
          if (addMode) {
            handleAdd(selectedAgent);
          } else {
            handleSelect(selectedAgent.id || "");
          }
        }
        return;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isPopoverOpen,
    highlightedIndex,
    filteredAgents,
    addMode,
    handleSelect,
    handleAdd,
  ]);

  const handleToggle = useCallback(() => {
    if (!disabled) setIsPopoverOpen((previous) => !previous);
  }, [disabled]);

  if (sortedAgents.length === 0) return null;

  // Determine which agent should show the spinning animation.
  // When an item is highlighted (hovered or keyboard-navigated), that agent spins.
  // Otherwise, the currently selected/active agent spins.
  const spinningAgentId =
    highlightedIndex >= 0 && highlightedIndex < filteredAgents.length
      ? filteredAgents[highlightedIndex].id
      : activeAgentId;

  // -- Add-mode trigger label ----------------------------------
  const addLabel =
    addCount === 0
      ? "Add Agent"
      : addCount === 1
        ? "1 Agent"
        : `${addCount} Agents`;

  // Build trigger icon: in add-mode use Bot icon, otherwise the agent badge
  const triggerIcon = addMode ? (
    <Bot size={14} className={styles['trigger-add-icon']} />
  ) : (
    <BadgeComponent
      type="agent"
      agent={activeAgent ?? undefined}
      animation={!isPopoverOpen}
    />
  );

  // Build trigger label
  const triggerLabel = addMode
    ? addLabel
    : activeAgent?.name || activeAgentId;

  // Build tooltip content for default mode (not add-mode, not disabled, not agentless)
  const triggerTooltipContent =
    !addMode && !disabled && activeAgent?.id !== AGENT_IDS.NONE ? (
      <div className={styles['tooltip-capabilities']}>
        <ToolBadgeComponent
          name="Tool Calling"
          count={activeAgent?.toolCount}
          variant="condensed"
          tooltip={`${activeAgent?.toolCount || 0} Tools available`}
        />
      </div>
    ) : null;

  // Resolve trigger class based on mode
  const triggerClassName = addMode
    ? `${styles['trigger-add']} ${isPopoverOpen ? styles['trigger-add-open'] : ""} ${addCount > 0 ? styles['trigger-add-is-active-state'] : ""}`
    : undefined;

  const triggerContent = (
    <div style={{ position: "relative" }}>
      <SelectComponent
        isOpen={isPopoverOpen}
        onToggle={handleToggle}
        icon={triggerIcon}
        placeholder={triggerLabel}
        disabled={disabled}
        triggerRef={triggerRef}
        triggerClassName={triggerClassName}
        triggerTooltipContent={triggerTooltipContent}
      >
        {isPopoverOpen && (
          <>
            <div
              className={styles['backdrop']}
              onClick={() => setIsPopoverOpen(false)}
            />
            <div className={styles['popover']} role="listbox">
              <SearchInputComponent
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search agents…"
                autoFocus
                compact
                onClick={(event: React.MouseEvent) => event.stopPropagation()}
              />
              <div className={styles["agent-list-scrollable-container"]}>
                {filteredAgents.length === 0 ? (
                  <div className={styles["no-agents-found-message"]}>
                    No agents found
                  </div>
                ) : (
                  filteredAgents.map((agent: ClientAgent, agentIndex: number) => {
                    const isActive = !addMode && agent.id === activeAgentId;
                    const isHighlighted = agentIndex === highlightedIndex;
                    const shouldAnimate = agent.id === spinningAgentId;

                    return (
                      <button
                        key={agent.id}
                        className={styles['agent-item']}
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
                          SoundService.playClickButton({
                            event: mouseEvent.nativeEvent,
                          });
                          if (addMode) {
                            handleAdd(agent);
                          } else {
                            handleSelect(agent.id || "");
                          }
                        }}
                        type="button"
                        style={
                          agent.color
                            ? ({
                                "--agent-accent": agent.color,
                              } as React.CSSProperties)
                            : undefined
                        }
                      >
                        <BadgeComponent
                          type="agent"
                          agent={agent}
                          animation={shouldAnimate}
                        />
                        <div className={styles['agent-info']}>
                          <div className={styles['agent-name']}>{agent.name}</div>
                          <div className={styles['agent-meta']}>
                            {agent.id !== AGENT_IDS.NONE && (
                              <span className={styles['tool-badge']}>
                                <Wrench size={9} />
                                {agent.toolCount === -1
                                  ? "All tools"
                                  : `${agent.toolCount} tools`}
                              </span>
                            )}
                          </div>
                        </div>
                        {addMode ? (
                          <span className={styles['add-button']}>
                            <Plus size={12} />
                            Add
                          </span>
                        ) : isActive ? (
                          <Check
                            size={14}
                            className={styles['is-active-state-check']}
                            style={agent.color ? { color: agent.color } : undefined}
                          />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </SelectComponent>
    </div>
  );

  if (disabled) {
    return (
      <div className={`agent-picker-component ${styles["agent-picker-container"]}`}>
        <SelectComponent
          isOpen={false}
          onToggle={() => {}}
          icon={triggerIcon}
          placeholder={triggerLabel}
          disabled
          triggerTooltip="Start a new conversation to switch agents"
        />
      </div>
    );
  }

  return <div className={styles["agent-picker-container"]}>{triggerContent}</div>;
}
