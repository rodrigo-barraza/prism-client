"use client";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import HistoryList from "./HistoryListComponent";
import { getModalities } from "../utils/utilities";
import styles from "./HistoryPanelComponent.module.css";

import type { Conversation, Message } from "../types/types";
import type { LucideIcon } from "lucide-react";

export interface HistoryPanelProps {
  sessions?: Conversation[];
  activeId?: string | null;
  onSelect?: (session: Conversation) => void | Promise<void>;
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
  generatingSessionIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => Promise<void> | void;
  dateRange?: { from: string; to: string };
  onDateChange?: (range: { from: string; to: string }) => void;
}

export default function HistoryPanel({
  sessions = [],
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
  newLabel = "New Conversation",
  emptyText = "No recent chats",
  searchText = "Search conversations...",
  itemIcon,
  countLabel,
  onOpenInNewTab,
  generatingSessionIds,
  hasMore,
  loadingMore,
  onLoadMore,
  dateRange,
  onDateChange,
}: HistoryPanelProps) {
  // Normalize sessions into HistoryList items
  const items = useMemo(() => {
    return sessions.map((conversation: Conversation) => {
      // Prefer session-level totalCost (authoritative, from request logs
      // for agent sessions). Fall back to message-sum only for Direct Chat
      // sessions that carry messages inline with no precomputed total.
      const totalCost =
        conversation.totalCost ??
        (conversation.messages || []).reduce(
          (sum: number, m: Message) => sum + (m.estimatedCost || 0),
          0,
        );

      const tags = [];
      if (showProject && conversation.project) {
        tags.push({
          label: conversation.project,
          style: {
            background: "var(--accent-primary-subtle)",
            color: "var(--accent-primary)",
          },
        });
      }
      if (conversation.synthetic) {
        tags.push({
          label: "SYNTHETIC",
          style: {
            background: "rgba(168, 85, 247, 0.12)",
            color: "rgb(168, 85, 247)",
          },
        });
      }

      // Use live-patched model names if available (from active generation),
      // then backend-enriched modelNames (from request-log aggregation),
      // otherwise derive from messages
      let modelNames;
      if ((conversation._liveModelNames?.length ?? 0) > 0) {
        modelNames = conversation._liveModelNames;
      } else if ((conversation.modelNames?.length ?? 0) > 0) {
        // Backend enrichment: the list endpoint aggregates unique models
        // from request logs — available without fetching the full session.
        modelNames = conversation.modelNames;
      } else {
        // Extract unique model names and providers used in this conversation
        const msgs = conversation.messages || [];
        const modelNamesSet = new Set();

        // Look at messages from newest to oldest to order recent models first
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant") {
            if (msgs[i].model) modelNamesSet.add(msgs[i].model);
          }
        }

        // If no models found in messages, fall back to conv.model or conv.settings.model
        if (modelNamesSet.size === 0) {
          const fallbackModel =
            conversation.model || conversation.settings?.model;
          if (fallbackModel) modelNamesSet.add(fallbackModel);
        }
        modelNames = Array.from(modelNamesSet);
      }

      // Providers: prefer top-level (from backend or live patch), else derive from messages
      let derivedProviders;
      if ((conversation.providers?.length ?? 0) > 0) {
        derivedProviders = conversation.providers;
      } else {
        const msgs = conversation.messages || [];
        const providersSet = new Set<string>();
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant" && msgs[i].provider) {
            providersSet.add(msgs[i].provider!);
          }
        }
        derivedProviders = Array.from(providersSet);
      }

      // Merge request-log toolCounts into modalities for accurate badge counts
      const baseModalities =
        conversation.modalities || getModalities(conversation.messages);
      const modalities = conversation.toolCounts
        ? {
            ...baseModalities,
            functionCalling: Object.values(conversation.toolCounts).reduce(
              (s: number, c: unknown) => s + (c as number),
              0,
            ),
          }
        : baseModalities;

      return {
        id: conversation.id || String(conversation._id),
        title: conversation.title || "Untitled Chat",
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
        totalCost,
        modalities,
        providers: derivedProviders,
        tags,
        username: conversation.username,
        modelNames,
        modelName: conversation.model || conversation.settings?.model || null,
        agent: conversation.agent,
        searchText: [
          conversation.project || "",
          conversation.username || "",
          ...(conversation.messages || []).map((m: Message) => m.content || ""),
        ].join(" "),
      };
    });
  }, [sessions, showProject]);

  return (
    <div className={styles.container}>
      <HistoryList
        items={items}
        activeId={activeId}
        onSelect={(item: { id: string }) => {
          const conversation = sessions.find((c) => c.id === item.id);
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
        generatingSessionIds={generatingSessionIds}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        dateRange={dateRange}
        onDateChange={onDateChange}
      />
    </div>
  );
}
