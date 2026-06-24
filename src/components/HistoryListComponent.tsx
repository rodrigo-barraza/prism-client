"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Star, DollarSign, Bot, AlertTriangle } from "lucide-react";
import ProviderLogo, {
  resolveProviderLabel,
} from "./ProviderLogosComponent";
import { PROVIDER_LABELS } from "../constants";
import { MODALITY_FILTERS, TOOL_FILTERS } from "./SidebarFilterComponent";
import FilterDropdownComponent, {
  type FilterGroup,
} from "./FilterDropdownComponent";
import {
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import HistoryItemComponent from "./HistoryItemComponent";
import styles from "./HistoryListComponent.module.css";
import { LS_DATE_RANGE } from "../constants";
import type { LucideIcon } from "lucide-react";

interface HistoryListItem {
  id: string;
  title?: string;
  subtitle?: string;
  searchText?: string;
  updatedAt?: string;
  createdAt?: string;
  totalCost?: number;
  modalities?: Record<string, number | boolean>;
  providers?: string[];
  tags?: Array<{ label: string; style?: React.CSSProperties }>;
  modelName?: string | null;
  modelNames?: string[];
  username?: string;
  agent?: string | { id: string; name?: string };
  parentConversationId?: string | null;
  hasSubAgents?: boolean;
  requestErrorCount?: number;
}

interface FilterItem {
  key: string;
  icon: LucideIcon;
  title: string;
  color?: string;
}

const COST_TIERS = [
  { key: "free", title: "Free", min: 0, max: 0 },
  { key: "under-0.01", title: "Under $0.01", min: 0.000001, max: 0.01 },
  { key: "under-0.10", title: "Under $0.10", min: 0.01, max: 0.1 },
  { key: "under-1.00", title: "Under $1.00", min: 0.1, max: 1 },
  { key: "over-1.00", title: "Over $1.00", min: 1, max: Infinity },
];

const COST_FILTER_COLOR = "#22c55e";


interface HistoryListProps {
  items?: HistoryListItem[];
  activeId?: string | null;
  onSelect?: (item: HistoryListItem) => void;
  onDelete?: (id: string) => void;
  onDownload?: (id: string) => void;
  onCopy?: (id: string) => void;
  icon?: LucideIcon;
  readOnly?: boolean;
  emptyLabel?: string;
  searchPlaceholder?: string;
  showProviderFilters?: boolean;
  showModalityFilters?: boolean;
  showCostFilters?: boolean;
  admin?: boolean;
  newIds?: Set<string>;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  initialProviders?: string[];
  initialSearch?: string;
  countLabel?: string;
  onOpenInNewTab?: (item: HistoryListItem) => void;
  generatingConversationIds?: Set<string>;
  knownParentConversationIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSearchChange?: (query: string) => void;
  dateRange?: { from: string; to: string };
  onDateChange?: (range: { from: string; to: string }) => void;
  filterStorageKey?: string;
}

/**
 * HistoryList — shared list component for both conversations and workflows.
 *
 * Props:
 *   items          — array of objects, each must have: id, title, updatedAt/createdAt
 *                    optional: totalCost, modalities, providers, tags[]
 *   activeId       — currently selected item id
 *   onSelect       — (item) => void
 *   onDelete       — (id) => void  (omit to hide delete buttons)
 *   onDownload     — (id) => void  (omit to hide download button)
 *   onCopy         — (id) => void  (omit to hide copy button)
 *   icon           — React element or component for the item icon
 *   readOnly       — disable delete actions
 *   emptyLabel     — label for empty state
 *   searchPlaceholder — placeholder for search
 *   showProviderFilters — show provider filter bar
 *   showModalityFilters — show modality filter bar
 *   admin          — admin mode (show username tags, hide delete)
 */
export default function HistoryList({
  items = [],
  activeId,
  onSelect,
  onDelete,
  onDownload,
  onCopy,
  icon: ItemIcon,
  readOnly = false,
  emptyLabel = "No items",
  searchPlaceholder = "Search...",
  showProviderFilters = true,
  showModalityFilters = true,
  showCostFilters = true,
  admin = false,
  newIds,
  favorites = [],
  onToggleFavorite,
  initialProviders,
  initialSearch = "",
  countLabel,
  onOpenInNewTab,
  generatingConversationIds,
  knownParentConversationIds,
  // Pagination
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSearchChange,
  dateRange: controlledDateRange,
  onDateChange: controlledOnDateChange,
  filterStorageKey,
}: HistoryListProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (onSearchChange) onSearchChange(query);
  };

  // -- Restore persisted filter state from localStorage on mount --
  const initializedFilterRef = useRef<boolean>(false);

  const restoredFilters = useMemo(() => {
    if (!filterStorageKey) return null;
    try {
      const stored = localStorage.getItem(filterStorageKey);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore corrupt data */ }
    return null;
  }, [filterStorageKey]);

  const [activeModalities, setActiveModalities] = useState<Set<string>>(
    () => new Set(restoredFilters?.modalities || []),
  );
  const [activeTools, setActiveTools] = useState<Set<string>>(
    () => new Set(restoredFilters?.tools || []),
  );
  const [activeProviders, setActiveProviders] = useState<Set<string>>(
    () => new Set(restoredFilters?.providers || initialProviders || []),
  );
  const [activeCostTiers, setActiveCostTiers] = useState<Set<string>>(
    () => new Set(restoredFilters?.costTiers || []),
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(
    () => restoredFilters?.showFavoritesOnly ?? false,
  );
  const [shouldHideSubAgents, setShouldHideSubAgents] = useState(
    () => restoredFilters?.shouldHideSubAgents ?? false,
  );
  const [showErrorsOnly, setShowErrorsOnly] = useState(
    () => restoredFilters?.showErrorsOnly ?? false,
  );
  const [collapsedClusterIds, setCollapsedClusterIds] = useState<Set<string>>(
    () => new Set(restoredFilters?.collapsedClusterIds || []),
  );
  const [localDateRange, setLocalDateRange] = useState({ from: "", to: "" });

  // -- Persist filter state to localStorage on change --
  useEffect(() => {
    if (!filterStorageKey) return;
    // Skip the very first render to avoid writing restored defaults back immediately
    if (!initializedFilterRef.current) {
      initializedFilterRef.current = true;
      return;
    }
    const filterSnapshot = {
      modalities: [...activeModalities],
      tools: [...activeTools],
      providers: [...activeProviders],
      costTiers: [...activeCostTiers],
      showFavoritesOnly,
      shouldHideSubAgents,
      showErrorsOnly,
      collapsedClusterIds: [...collapsedClusterIds],
    };
    const hasActiveFilters =
      activeModalities.size > 0 ||
      activeTools.size > 0 ||
      activeProviders.size > 0 ||
      activeCostTiers.size > 0 ||
      showFavoritesOnly ||
      shouldHideSubAgents ||
      showErrorsOnly ||
      collapsedClusterIds.size > 0;
    try {
      if (hasActiveFilters) {
        localStorage.setItem(filterStorageKey, JSON.stringify(filterSnapshot));
      } else {
        localStorage.removeItem(filterStorageKey);
      }
    } catch { /* ignore quota errors */ }
  }, [
    filterStorageKey,
    activeModalities,
    activeTools,
    activeProviders,
    activeCostTiers,
    showFavoritesOnly,
    shouldHideSubAgents,
    showErrorsOnly,
    collapsedClusterIds,
  ]);

  const dateRange =
    controlledDateRange !== undefined ? controlledDateRange : localDateRange;
  const setDateRange =
    controlledOnDateChange !== undefined
      ? controlledOnDateChange
      : setLocalDateRange;

  // Discover modalities across all items
  const allModalities = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      const modalities = item.modalities || {};
      for (const { key } of MODALITY_FILTERS) {
        if (modalities[`${key}In`] || modalities[`${key}Out`]) set.add(key);
      }
    }
    return MODALITY_FILTERS.filter(({ key }: FilterItem) => set.has(key));
  }, [items]);

  // Discover tools across all items
  const allTools = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      const modalities = item.modalities || {};
      for (const { key } of TOOL_FILTERS) {
        if (modalities[key]) set.add(key);
      }
    }
    return TOOL_FILTERS.filter(({ key }: FilterItem) => set.has(key));
  }, [items]);

  // Discover providers
  const allProviders = useMemo(() => {
    const set = new Set<string>();
    for (const item of items || []) {
      for (const provider of item.providers || []) set.add(provider);
    }
    const labelOrder = Object.keys(PROVIDER_LABELS);
    return [...set].sort((agent: string, current: string) => {
      const indexA = labelOrder.indexOf(agent);
      const indexB = labelOrder.indexOf(current);
      return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
    });
  }, [items]);

  // Discover cost tiers present in items
  const availableCostTiers = useMemo(() => {
    const presentTierKeys = new Set<string>();
    for (const item of items || []) {
      const cost = item.totalCost ?? 0;
      for (const tier of COST_TIERS) {
        if (tier.key === "free" && cost === 0) {
          presentTierKeys.add(tier.key);
        } else if (tier.key !== "free" && cost > tier.min && cost <= tier.max) {
          presentTierKeys.add(tier.key);
        } else if (tier.key === "over-1.00" && cost > tier.min) {
          presentTierKeys.add(tier.key);
        }
      }
    }
    return COST_TIERS.filter((tier) => presentTierKeys.has(tier.key));
  }, [items]);

  const hasSubAgents = useMemo(() => {
    return (items || []).some((item) => !!item.parentConversationId);
  }, [items]);

  const hasItemsWithErrors = useMemo(() => {
    return (items || []).some((item) => (item.requestErrorCount || 0) > 0);
  }, [items]);

  const subAgentNumberMap = useMemo(() => {
    const numberMap = new Map<string, number>();
    const childrenByParent = new Map<string, HistoryListItem[]>();
    for (const item of items || []) {
      if (item.parentConversationId) {
        const siblings = childrenByParent.get(item.parentConversationId) || [];
        siblings.push(item);
        childrenByParent.set(item.parentConversationId, siblings);
      }
    }
    for (const siblings of childrenByParent.values()) {
      siblings.sort((itemA, itemB) => {
        const timestampA = new Date(itemA.createdAt || itemA.updatedAt || "").getTime();
        const timestampB = new Date(itemB.createdAt || itemB.updatedAt || "").getTime();
        return timestampA - timestampB;
      });
      siblings.forEach((child, spawnIndex) => {
        numberMap.set(child.id, spawnIndex + 1);
      });
    }
    return numberMap;
  }, [items]);

  const parentConversationIds = useMemo(() => {
    const parentIds = new Set<string>(knownParentConversationIds);
    for (const item of items || []) {
      if (item.parentConversationId) {
        parentIds.add(item.parentConversationId);
      }
      if (item.hasSubAgents) {
        parentIds.add(item.id);
      }
    }
    return parentIds;
  }, [items, knownParentConversationIds]);

  const filtered = useMemo(() => {
    return (items || []).filter((item: HistoryListItem) => {
      if (shouldHideSubAgents && item.parentConversationId) {
        return false;
      }
      if (showErrorsOnly && (item.requestErrorCount || 0) === 0) {
        return false;
      }
      if (showFavoritesOnly && onToggleFavorite) {
        if (!(favorites || []).includes(item.id)) return false;
      }
      if (searchQuery.trim()) {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        const matchesSearch =
          (item.title || "").toLowerCase().includes(normalizedSearch) ||
          (item.subtitle || "").toLowerCase().includes(normalizedSearch) ||
          (item.searchText || "").toLowerCase().includes(normalizedSearch);
        if (!matchesSearch) return false;
      }
      if (activeModalities.size > 0) {
        const modalities = item.modalities || {};
        const matches = [...activeModalities].some(
          (key) => modalities[`${key}In`] || modalities[`${key}Out`],
        );
        if (!matches) return false;
      }
      if (activeTools.size > 0) {
        const modalities = item.modalities || {};
        const matches = [...activeTools].some((key) => modalities[key]);
        if (!matches) return false;
      }
      if (activeProviders.size > 0) {
        const itemProviders = item.providers || [];
        const matches = [...activeProviders].some((provider) =>
          itemProviders.includes(provider),
        );
        if (!matches) return false;
      }
      if (activeCostTiers.size > 0) {
        const cost = item.totalCost ?? 0;
        const matchesCostTier = [...activeCostTiers].some((tierKey) => {
          const tier = COST_TIERS.find((costTier) => costTier.key === tierKey);
          if (!tier) return false;
          if (tier.key === "free") return cost === 0;
          if (tier.key === "over-1.00") return cost > tier.min;
          return cost > tier.min && cost <= tier.max;
        });
        if (!matchesCostTier) return false;
      }
      if (dateRange.from || dateRange.to) {
        const itemDate = new Date(item.updatedAt || item.createdAt || "");
        if (dateRange.from && itemDate < new Date(dateRange.from)) return false;
        if (dateRange.to && itemDate > new Date(dateRange.to + "T23:59:59"))
          return false;
      }
      return true;
    });
  }, [
    items,
    searchQuery,
    activeModalities,
    activeTools,
    activeProviders,
    activeCostTiers,
    showFavoritesOnly,
    favorites,
    onToggleFavorite,
    dateRange,
    shouldHideSubAgents,
    showErrorsOnly,
  ]);

  interface SubAgentTreeNode {
    item: HistoryListItem;
    children: SubAgentTreeNode[];
  }

  type ConversationGroup = {
    type: "standalone";
    item: HistoryListItem;
  } | {
    type: "agent-cluster";
    parent: HistoryListItem;
    tree: SubAgentTreeNode[];
  };

  const groupedConversations = useMemo<ConversationGroup[]>(() => {
    const childrenByParent = new Map<string, HistoryListItem[]>();
    const filteredIds = new Set(filtered.map((item) => item.id));

    for (const item of filtered) {
      if (item.parentConversationId) {
        const siblingConversations = childrenByParent.get(item.parentConversationId) || [];
        siblingConversations.push(item);
        childrenByParent.set(item.parentConversationId, siblingConversations);
      }
    }

    // Sort children within each cluster by creation time ascending (spawn order)
    for (const children of childrenByParent.values()) {
      children.sort((childConversationA, childConversationB) => {
        const timestampA = new Date(childConversationA.createdAt || childConversationA.updatedAt || "").getTime();
        const timestampB = new Date(childConversationB.createdAt || childConversationB.updatedAt || "").getTime();
        return timestampA - timestampB;
      });
    }

    // Recursively build tree nodes for a given parent
    const buildSubTree = (parentId: string, visitedIds: Set<string>): SubAgentTreeNode[] => {
      const directChildren = childrenByParent.get(parentId) || [];
      return directChildren.map((child) => {
        // Guard against circular references
        if (visitedIds.has(child.id)) {
          return { item: child, children: [] };
        }
        const nextVisited = new Set(visitedIds);
        nextVisited.add(child.id);
        return {
          item: child,
          children: buildSubTree(child.id, nextVisited),
        };
      });
    };

    const groups: ConversationGroup[] = [];

    for (const item of filtered) {
      // Skip items that are children — they'll be rendered inside their parent's tree if their parent is in the filtered list
      if (item.parentConversationId && filteredIds.has(item.parentConversationId)) {
        continue;
      }

      const hasChildren = childrenByParent.has(item.id);
      if (hasChildren) {
        const tree = buildSubTree(item.id, new Set([item.id]));
        groups.push({ type: "agent-cluster", parent: item, tree });
      } else {
        groups.push({ type: "standalone", item });
      }
    }

    return groups;
  }, [filtered, parentConversationIds]);


  // -- Infinite scroll via IntersectionObserver -----------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]: IntersectionObserverEntry[]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { root: listRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, loadingMore]);

  return (
    <div className={`history-list-component ${styles['container']}`}>
      <SearchInputComponent
        value={searchQuery}
        onChange={handleSearchChange}
        placeholder={searchPlaceholder}
        compact
        className={styles['search-wrapper']}
      />

      <FilterDropdownComponent
        fullWidth
        groups={
          [
            ...(onToggleFavorite
              ? [
                  {
                    label: "Favorites",
                    items: [
                      {
                        key: "favorites",
                        icon: Star,
                        title: "Favorites Only",
                        color: "#eab308",
                      },
                    ],
                    activeKeys: showFavoritesOnly ? "favorites" : null,
                    isSingleSelect: true,
                    onToggle: () => setShowFavoritesOnly(!showFavoritesOnly),
                  },
                ]
              : []),
            ...(hasSubAgents
              ? [
                  {
                    label: "Sub-Agents",
                    items: [
                      {
                        key: "hide-subagents",
                        icon: Bot,
                        title: "Hide Sub-Agents",
                        color: "#a855f7",
                      },
                    ],
                    activeKeys: shouldHideSubAgents ? "hide-subagents" : null,
                    isSingleSelect: true,
                    onToggle: () => setShouldHideSubAgents(!shouldHideSubAgents),
                  },
                ]
              : []),
            ...(hasItemsWithErrors
              ? [
                  {
                    label: "Errors",
                    items: [
                      {
                        key: "show-errors-only",
                        icon: AlertTriangle,
                        title: "Has Errors",
                        color: "#ef4444",
                      },
                    ],
                    activeKeys: showErrorsOnly ? "show-errors-only" : null,
                    isSingleSelect: true,
                    onToggle: () => setShowErrorsOnly(!showErrorsOnly),
                  },
                ]
              : []),
            ...(showModalityFilters && allModalities.length >= 2
              ? [
                  {
                    label: "Modality",
                    items: allModalities.map((modality: FilterItem) => ({
                      key: modality.key,
                      icon: modality.icon,
                      title: modality.title,
                      color: modality.color,
                    })),
                    activeKeys: activeModalities,
                    onToggle: (key: string) => {
                      setActiveModalities((previous) => {
                        const next = new Set(previous);
                        next.has(key) ? next.delete(key) : next.add(key);
                        return next;
                      });
                    },
                  },
                ]
              : []),
            ...(showModalityFilters && allTools.length >= 1
              ? [
                  {
                    label: "Tools",
                    items: allTools.map((tool: FilterItem) => ({
                      key: tool.key,
                      icon: tool.icon,
                      title: tool.title,
                      color: tool.color,
                    })),
                    activeKeys: activeTools,
                    onToggle: (key: string) => {
                      setActiveTools((previous) => {
                        const next = new Set(previous);
                        next.has(key) ? next.delete(key) : next.add(key);
                        return next;
                      });
                    },
                  },
                ]
              : []),
            ...(showProviderFilters && allProviders.length >= 2
              ? [
                  {
                    label: "Providers",
                    items: allProviders.map((provider: string) => ({
                      key: provider,
                      icon: () => <ProviderLogo provider={provider} size={13} />,
                      title: resolveProviderLabel(provider),
                    })),
                    activeKeys: activeProviders,
                    onToggle: (key: string) => {
                      setActiveProviders((previous) => {
                        const next = new Set(previous);
                        next.has(key) ? next.delete(key) : next.add(key);
                        return next;
                      });
                    },
                  },
                ]
              : []),
            ...(showCostFilters && availableCostTiers.length >= 2
              ? [
                  {
                    label: "Cost",
                    items: availableCostTiers.map((tier) => ({
                      key: tier.key,
                      icon: DollarSign,
                      title: tier.title,
                      color: COST_FILTER_COLOR,
                    })),
                    activeKeys: activeCostTiers,
                    onToggle: (key: string) => {
                      setActiveCostTiers((previous) => {
                        const next = new Set(previous);
                        next.has(key) ? next.delete(key) : next.add(key);
                        return next;
                      });
                    },
                  },
                ]
              : []),
          ] as FilterGroup[]
        }
        dateRange={dateRange}
        onDateChange={setDateRange}
        dateStorageKey={LS_DATE_RANGE}
      />

      {countLabel && (
        <div className={styles['count-layout-row']}>
          <span className={styles['count-label']}>
            {filtered.length === items.length
              ? `${items.length}${hasMore ? "+" : ""} ${countLabel}`
              : `${filtered.length} of ${items.length}${hasMore ? "+" : ""} ${countLabel}`}
          </span>
        </div>
      )}

      <div className={styles['list']} ref={listRef}>
        {groupedConversations.map((group) => {
          if (group.type === "standalone") {
            const item = group.item;
            return (
              <HistoryItemComponent
                key={item.id}
                item={item}
                isActive={item.id === activeId}
                onClick={onSelect}
                onDelete={onDelete}
                onDownload={onDownload}
                onCopy={onCopy}
                icon={ItemIcon}
                readOnly={readOnly}
                admin={admin}
                isNew={newIds?.has?.(item.id)}
                isFavorite={(favorites || []).includes(item.id)}
                onToggleFavorite={onToggleFavorite}
                dataPanelClose
                onOpenInNewTab={
                  onOpenInNewTab
                    ? (openItem: HistoryListItem) => onOpenInNewTab(openItem)
                    : undefined
                }
                isGenerating={generatingConversationIds?.has?.(item.id)}
                isCondensed={true}
                subAgentNumber={subAgentNumberMap.get(item.id) ?? null}
                subAgentDepth={item.parentConversationId ? 1 : null}
                hasSpawnedSubAgents={parentConversationIds.has(item.id)}
              />
            );
          }



          const renderSubAgentTree = (nodes: SubAgentTreeNode[], depth: number) => (
            <div className={styles['sub-agent-tree-container']} data-tree-depth={depth}>
              <div className={styles['sub-agent-tree-rail']} />
              {nodes.map((treeNode, nodeIndex) => {
                const nodeHasChildren = treeNode.children.length > 0;
                const isNodeCollapsed = collapsedClusterIds.has(treeNode.item.id);
                return (
                  <div
                    key={treeNode.item.id}
                    className={`${styles['sub-agent-tree-node']} ${nodeIndex === nodes.length - 1 ? styles['sub-agent-tree-node-is-last'] : ''}`}
                  >
                    <div className={styles['sub-agent-tree-branch']} />
                    <div className={styles['sub-agent-tree-node-content']}>
                      <HistoryItemComponent
                        item={treeNode.item}
                        isActive={treeNode.item.id === activeId}
                        onClick={onSelect}
                        onDelete={onDelete}
                        onDownload={onDownload}
                        onCopy={onCopy}
                        icon={ItemIcon}
                        readOnly={readOnly}
                        admin={admin}
                        isNew={newIds?.has?.(treeNode.item.id)}
                        isFavorite={(favorites || []).includes(treeNode.item.id)}
                        onToggleFavorite={onToggleFavorite}
                        dataPanelClose
                        onOpenInNewTab={
                          onOpenInNewTab
                            ? (openItem: HistoryListItem) => onOpenInNewTab(openItem)
                            : undefined
                        }
                        isGenerating={generatingConversationIds?.has?.(treeNode.item.id)}
                        isCondensed={true}
                        subAgentNumber={subAgentNumberMap.get(treeNode.item.id) ?? null}
                        subAgentDepth={depth + 1}
                        hasSpawnedSubAgents={nodeHasChildren}
                        isSubAgentsCollapsed={isNodeCollapsed}
                        onToggleSubAgents={nodeHasChildren ? () => {
                          setCollapsedClusterIds((previous) => {
                            const next = new Set(previous);
                            if (next.has(treeNode.item.id)) {
                              next.delete(treeNode.item.id);
                            } else {
                              next.add(treeNode.item.id);
                            }
                            return next;
                          });
                        } : undefined}
                      />
                      {nodeHasChildren && (
                        <div
                          className={`${styles['sub-agent-tree-collapsible']} ${isNodeCollapsed ? styles['sub-agent-tree-collapsible-is-collapsed'] : ''}`}
                        >
                          <div className={styles['sub-agent-tree-collapsible-inner']}>
                            {renderSubAgentTree(treeNode.children, depth + 1)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          return (
            <div
              key={group.parent.id}
              className={styles['agent-cluster-group']}
            >
              <HistoryItemComponent
                item={group.parent}
                isActive={group.parent.id === activeId}
                onClick={onSelect}
                onDelete={onDelete}
                onDownload={onDownload}
                onCopy={onCopy}
                icon={ItemIcon}
                readOnly={readOnly}
                admin={admin}
                isNew={newIds?.has?.(group.parent.id)}
                isFavorite={(favorites || []).includes(group.parent.id)}
                onToggleFavorite={onToggleFavorite}
                dataPanelClose
                onOpenInNewTab={
                  onOpenInNewTab
                    ? (openItem: HistoryListItem) => onOpenInNewTab(openItem)
                    : undefined
                }
                isGenerating={generatingConversationIds?.has?.(group.parent.id)}
                isCondensed={true}
                subAgentNumber={subAgentNumberMap.get(group.parent.id) ?? null}
                hasSpawnedSubAgents={true}
                isSubAgentsCollapsed={collapsedClusterIds.has(group.parent.id)}
                onToggleSubAgents={() => {
                  setCollapsedClusterIds((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.parent.id)) {
                      next.delete(group.parent.id);
                    } else {
                      next.add(group.parent.id);
                    }
                    return next;
                  });
                }}
              />
              <div
                className={`${styles['sub-agent-tree-collapsible']} ${collapsedClusterIds.has(group.parent.id) ? styles['sub-agent-tree-collapsible-is-collapsed'] : ''}`}
              >
                <div className={styles['sub-agent-tree-collapsible-inner']}>
                  {renderSubAgentTree(group.tree, 0)}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !loadingMore && (
          <div className={styles['empty']}>
            {searchQuery.trim() ? "No matches" : emptyLabel}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className={styles['sentinel']} />}
        {loadingMore && (
          <div className={styles['is-loading-state-more']}>
            <PanelLoadingSpinner size="small" inline />
          </div>
        )}
      </div>
    </div>
  );
}
