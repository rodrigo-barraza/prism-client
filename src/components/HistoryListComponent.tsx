"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Star, DollarSign, Bot } from "lucide-react";
import ProviderLogo, {
  PROVIDER_LABELS,
  resolveProviderLabel,
} from "./ProviderLogosComponent";
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
  parentAgentSessionId?: string | null;
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
  generatingSessionIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSearchChange?: (query: string) => void;
  dateRange?: { from: string; to: string };
  onDateChange?: (range: { from: string; to: string }) => void;
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
  generatingSessionIds,
  // Pagination
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSearchChange,
  dateRange: controlledDateRange,
  onDateChange: controlledOnDateChange,
}: HistoryListProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (onSearchChange) onSearchChange(query);
  };
  const [activeModalities, setActiveModalities] = useState<Set<string>>(
    new Set(),
  );
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [activeProviders, setActiveProviders] = useState<Set<string>>(
    () => new Set(initialProviders || []),
  );
  const [activeCostTiers, setActiveCostTiers] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [shouldHideSubAgents, setShouldHideSubAgents] = useState(false);
  const [localDateRange, setLocalDateRange] = useState({ from: "", to: "" });

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
      for (const p of item.providers || []) set.add(p);
    }
    const labelOrder = Object.keys(PROVIDER_LABELS);
    return [...set].sort((a: string, b: string) => {
      const ai = labelOrder.indexOf(a);
      const bi = labelOrder.indexOf(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
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
    return (items || []).some((item) => !!item.parentAgentSessionId);
  }, [items]);

  const filtered = useMemo(() => {
    return (items || []).filter((item: HistoryListItem) => {
      if (shouldHideSubAgents && item.parentAgentSessionId) {
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
        const matches = [...activeProviders].some((p) =>
          itemProviders.includes(p),
        );
        if (!matches) return false;
      }
      if (activeCostTiers.size > 0) {
        const cost = item.totalCost ?? 0;
        const matchesCostTier = [...activeCostTiers].some((tierKey) => {
          const tier = COST_TIERS.find((t) => t.key === tierKey);
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
  ]);

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
    <div className={styles['container']}>
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
                    onToggle: () => setShowFavoritesOnly((v) => !v),
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
                    onToggle: () => setShouldHideSubAgents((value) => !value),
                  },
                ]
              : []),
            ...(showModalityFilters && allModalities.length >= 2
              ? [
                  {
                    label: "Modality",
                    items: allModalities.map((m: FilterItem) => ({
                      key: m.key,
                      icon: m.icon,
                      title: m.title,
                      color: m.color,
                    })),
                    activeKeys: activeModalities,
                    onToggle: (key: string) => {
                      setActiveModalities((prev) => {
                        const next = new Set(prev);
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
                    items: allTools.map((t: FilterItem) => ({
                      key: t.key,
                      icon: t.icon,
                      title: t.title,
                      color: t.color,
                    })),
                    activeKeys: activeTools,
                    onToggle: (key: string) => {
                      setActiveTools((prev) => {
                        const next = new Set(prev);
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
                    items: allProviders.map((p: string) => ({
                      key: p,
                      icon: () => <ProviderLogo provider={p} size={13} />,
                      title: resolveProviderLabel(p),
                    })),
                    activeKeys: activeProviders,
                    onToggle: (key: string) => {
                      setActiveProviders((prev) => {
                        const next = new Set(prev);
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
                      setActiveCostTiers((prev) => {
                        const next = new Set(prev);
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
        <div className={styles['count-row']}>
          <span className={styles['count-label']}>
            {filtered.length === items.length
              ? `${items.length}${hasMore ? "+" : ""} ${countLabel}`
              : `${filtered.length} of ${items.length}${hasMore ? "+" : ""} ${countLabel}`}
          </span>
        </div>
      )}

      <div className={styles['list']} ref={listRef}>
        {filtered.map((item: HistoryListItem) => (
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
            isGenerating={generatingSessionIds?.has?.(item.id)}
            isCondensed={true}
          />
        ))}
        {filtered.length === 0 && !loadingMore && (
          <div className={styles['empty']}>
            {searchQuery.trim() ? "No matches" : emptyLabel}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className={styles['sentinel']} />}
        {loadingMore && (
          <div className={styles['loading-more']}>
            <PanelLoadingSpinner size="small" inline />
          </div>
        )}
      </div>
    </div>
  );
}
