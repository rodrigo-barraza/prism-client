"use client";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import HistoryList from "./HistoryListComponent";
import { mapConversationToHistoryItem } from "../utils/historyItemMapper";
import styles from "./HistoryPanelComponent.module.css";

import type { Conversation } from "../types/types";
import type { LucideIcon } from "lucide-react";
import type { StatusBarPhase } from "../utils/statusBarPhaseTokens";

export interface HistoryPanelProps {
  conversations?: Conversation[];
  activeId?: string | null;
  onSelect?: (_conversation: Conversation) => void | Promise<void>;
  onNew?: () => void;
  onDelete?: (_id: string) => void;
  readOnly?: boolean;
  showProject?: boolean;
  showUsername?: boolean;
  newIds?: Set<string>;
  favorites?: string[];
  onToggleFavorite?: (_key: string) => void;
  initialProviders?: string[];
  initialSearch?: string;
  disableNew?: boolean;
  newLabel?: string;
  emptyText?: string;
  searchText?: string;
  itemIcon?: LucideIcon;
  countLabel?: string;
  onOpenInNewTab?: (_id: string) => void;
  generatingConversationIds?: Set<string>;
  knownParentConversationIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => Promise<void> | void;
  dateRange?: { from: string; to: string };
  onDateChange?: (_range: { from: string; to: string }) => void;
  dateStorageKey?: string;
  filterStorageKey?: string;
  className?: string;
  /** Live sub-agent execution phases keyed by conversationId */
  subAgentLivePhases?: Map<string, StatusBarPhase>;
}

export default function HistoryPanel({
  conversations = [],
  activeId,
  onSelect,
  onDelete,
  readOnly = false,
  showProject = false,
  showUsername = false,
  newIds,
  favorites = [],
  onToggleFavorite,
  initialProviders,
  initialSearch = "",
  emptyText = "No recent chats",
  searchText = "Search conversations...",
  itemIcon,
  countLabel,
  onOpenInNewTab,
  generatingConversationIds,
  knownParentConversationIds,
  hasMore,
  loadingMore,
  onLoadMore,
  dateRange,
  onDateChange,
  dateStorageKey,
  filterStorageKey,
  className,
  subAgentLivePhases,
}: HistoryPanelProps) {
  const items = useMemo(
    () =>
      conversations.map((conversation) =>
        mapConversationToHistoryItem(conversation, { showProject }),
      ),
    [conversations, showProject],
  );

  return (
    <div className={`history-panel-component ${styles['container']} ${className || ""}`}>
      <HistoryList
        items={items}
        activeId={activeId}
        onSelect={(item: { id: string }) => {
          const conversation = conversations.find((config) => config.id === item.id);
          if (conversation && onSelect) onSelect(conversation);
        }}
        onDelete={!readOnly && onDelete ? onDelete : undefined}
        icon={itemIcon || MessageSquare}
        readOnly={readOnly}
        emptyLabel={emptyText}
        searchPlaceholder={searchText}
        admin={showUsername}
        newIds={newIds}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        initialProviders={initialProviders}
        initialSearch={initialSearch}
        countLabel={countLabel}
        onOpenInNewTab={
          onOpenInNewTab
            ? (item: { id: string }) => onOpenInNewTab(item.id)
            : undefined
        }
        generatingConversationIds={generatingConversationIds}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        dateRange={dateRange}
        onDateChange={onDateChange}
        dateStorageKey={dateStorageKey}
        filterStorageKey={filterStorageKey}
        knownParentConversationIds={knownParentConversationIds}
        subAgentLivePhases={subAgentLivePhases}
      />
    </div>
  );
}
