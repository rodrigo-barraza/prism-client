"use client";

import { DEFAULT_CONVERSATION_TITLE } from "@/constants";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import HistoryList from "./HistoryListComponent";
import { mapConversationToHistoryItem } from "../utils/historyItemMapper";
import styles from "./HistoryPanelComponent.module.css";

import type { Conversation } from "../types/types";
import type { LucideIcon } from "lucide-react";

export interface HistoryPanelProps {
  conversations?: Conversation[];
  activeId?: string | null;
  onSelect?: (conversation: Conversation) => void | Promise<void>;
  onNew?: () => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
  showProject?: boolean;
  showUsername?: boolean;
  newIds?: Set<string>;
  favorites?: string[];
  onToggleFavorite?: (key: string) => void;
  initialProviders?: string[];
  initialSearch?: string;
  disableNew?: boolean;
  newLabel?: string;
  emptyText?: string;
  searchText?: string;
  itemIcon?: LucideIcon;
  countLabel?: string;
  onOpenInNewTab?: (id: string) => void;
  generatingConversationIds?: Set<string>;
  knownParentConversationIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => Promise<void> | void;
  dateRange?: { from: string; to: string };
  onDateChange?: (range: { from: string; to: string }) => void;
  filterStorageKey?: string;
  className?: string;
}

export default function HistoryPanel({
  conversations = [],
  activeId,
  onSelect,
  onNew,
  onDelete,
  readOnly = false,
  showProject = false,
  showUsername = false,
  newIds,
  favorites = [],
  onToggleFavorite,
  initialProviders,
  initialSearch = "",
  disableNew,
  newLabel = DEFAULT_CONVERSATION_TITLE,
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
  filterStorageKey,
  className,
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
        filterStorageKey={filterStorageKey}
        knownParentConversationIds={knownParentConversationIds}
      />
    </div>
  );
}
