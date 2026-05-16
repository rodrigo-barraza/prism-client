"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Star } from "lucide-react";
import ProviderLogo, { PROVIDER_LABELS, resolveProviderLabel } from "./ProviderLogosComponent";
import { MODALITY_FILTERS, TOOL_FILTERS } from "./SidebarFilterComponent";
import FilterDropdownComponent from "./FilterDropdownComponent";
import { SearchInputComponent, LoadingIndicatorComponent } from "@rodrigo-barraza/components-library";
import HistoryItemComponent from "./HistoryItemComponent";
import styles from "./HistoryListComponent.module.css";
import { LS_DATE_RANGE } from "../constants";

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
  // @ts-ignore
  // @ts-ignore
  activeId: any,
  // @ts-ignore
  // @ts-ignore
  onSelect: any,
  // @ts-ignore
  // @ts-ignore
  onDelete: any,
  // @ts-ignore
  // @ts-ignore
  onDownload: any,
  // @ts-ignore
  // @ts-ignore
  onCopy: any,
  // @ts-ignore
  icon: ItemIcon,
  readOnly = false,
  emptyLabel = "No items",
  searchPlaceholder = "Search...",
  showProviderFilters = true,
  showModalityFilters = true,
  admin = false,
  // @ts-ignore
  // @ts-ignore
  newIds: any,
  favorites = [],
  // @ts-ignore
  // @ts-ignore
  onToggleFavorite: any,
  // @ts-ignore
  // @ts-ignore
  initialProviders: any,
  initialSearch = "",
  // @ts-ignore
  // @ts-ignore
  countLabel: any,
  // @ts-ignore
  // @ts-ignore
  onOpenInNewTab: any,
  // @ts-ignore
  // @ts-ignore
  generatingSessionIds: any,
  // Pagination
  hasMore = false,
  loadingMore = false,
  // @ts-ignore
  // @ts-ignore
  onLoadMore: any,
}) {
  const [searchQuery, setSearchQuery] = useState<any>(initialSearch);
  const [activeModalities, setActiveModalities] = useState<any>(new Set());
  const [activeTools, setActiveTools] = useState<any>(new Set());
  const [activeProviders, setActiveProviders] = useState<any>(
    // @ts-ignore
    () => new Set(initialProviders || []),
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<any>(false);
  const [dateRange, setDateRange] = useState<any>({ from: "", to: "" });

  // Discover modalities across all items
  const allModalities = useMemo<any>(() => {
    const set = new Set();
    for (const item of items) {
      // @ts-ignore
      const mod = item.modalities || {};
      for (const { key } of MODALITY_FILTERS) {
        if (mod[`${key}In`] || mod[`${key}Out`]) set.add(key);
      }
    }
    return MODALITY_FILTERS.filter(({ key }) => set.has(key));
  }, [items]);

  // Discover tools across all items
  const allTools = useMemo<any>(() => {
    const set = new Set();
    for (const item of items) {
      // @ts-ignore
      const mod = item.modalities || {};
      for (const { key } of TOOL_FILTERS) {
        if (mod[key]) set.add(key);
      }
    }
    return TOOL_FILTERS.filter(({ key }) => set.has(key));
  }, [items]);

  // Discover providers
  const allProviders = useMemo<any>(() => {
    const set = new Set();
    for (const item of items) {
      // @ts-ignore
      for (const p of item.providers || []) set.add(p);
    }
    const labelOrder = Object.keys(PROVIDER_LABELS);
    return [...set].sort((a, b) => {
      // @ts-ignore
      const ai = labelOrder.indexOf(a);
      // @ts-ignore
      const bi = labelOrder.indexOf(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }, [items]);

  const filtered = useMemo<any>(() => {
    return items.filter((item) => {
      // @ts-ignore
      if (showFavoritesOnly && onToggleFavorite) {
        // @ts-ignore
        // @ts-ignore
        if (!(favorites || []).includes(item.id)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          // @ts-ignore
          (item.title || "").toLowerCase().includes(q) ||
          // @ts-ignore
          (item.subtitle || "").toLowerCase().includes(q) ||
          // @ts-ignore
          (item.searchText || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (activeModalities.size > 0) {
        // @ts-ignore
        const mod = item.modalities || {};
        const matches = [...activeModalities].some(
          (key) => mod[`${key}In`] || mod[`${key}Out`],
        );
        if (!matches) return false;
      }
      if (activeTools.size > 0) {
        // @ts-ignore
        const mod = item.modalities || {};
        const matches = [...activeTools].some((key) => mod[key]);
        if (!matches) return false;
      }
      if (activeProviders.size > 0) {
        // @ts-ignore
        const itemProviders = item.providers || [];
        const matches = [...activeProviders].some((p) =>
          itemProviders.includes(p),
        );
        if (!matches) return false;
      }
      if (dateRange.from || dateRange.to) {
        // @ts-ignore
        // @ts-ignore
        const itemDate = new Date(item.updatedAt || item.createdAt);
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
    showFavoritesOnly,
    favorites,
    // @ts-ignore
    onToggleFavorite,
    dateRange,
  ]);

  // -- Infinite scroll via IntersectionObserver -----------------
  const sentinelRef = useRef<any>(null);
  const listRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    if (!hasMore || !onLoadMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // @ts-ignore
          onLoadMore();
        }
      },
      { root: listRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  // @ts-ignore
  }, [hasMore, onLoadMore, loadingMore]);


  return (
    <div className={styles.container}>
      <SearchInputComponent
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={searchPlaceholder}
        className={styles.searchWrapper}
      />

      <FilterDropdownComponent
        fullWidth
        // @ts-ignore
        groups={[
          // @ts-ignore
          ...(onToggleFavorite
            ? [
                {
                  label: "Favorites",
                  items: [{ key: "favorites", icon: Star, title: "Favorites Only", color: "#eab308" }],
                  activeKeys: showFavoritesOnly ? "favorites" : null,
                  isSingleSelect: true,
                  onToggle: () => setShowFavoritesOnly((v: any) => !v),
                },
              ]
            : []),
          ...(showModalityFilters && allModalities.length >= 2
            ? [
                {
                  label: "Modality",
                  items: allModalities.map((m: any) => ({ key: m.key, icon: m.icon, title: m.title, color: m.color })),
                  activeKeys: activeModalities,
                  onToggle: (key: any) => {
                    setActiveModalities((prev: any) => {
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
                  items: allTools.map((t: any) => ({ key: t.key, icon: t.icon, title: t.title, color: t.color })),
                  activeKeys: activeTools,
                  onToggle: (key: any) => {
                    setActiveTools((prev: any) => {
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
                  items: allProviders.map((p: any) => ({
                    key: p,
                    icon: () => <ProviderLogo provider={p} size={13} />,
                    title: resolveProviderLabel(p),
                  })),
                  activeKeys: activeProviders,
                  onToggle: (key: any) => {
                    setActiveProviders((prev: any) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  },
                },
              ]
            : []),
        ]}
        dateRange={dateRange}
        onDateChange={setDateRange}
        dateStorageKey={LS_DATE_RANGE}
      />

      {/* @ts-ignore */}
      {countLabel && (
        <div className={styles.countRow}>
          <span className={styles.countLabel}>
            {filtered.length === items.length
              // @ts-ignore
              ? `${items.length}${hasMore ? "+" : ""} ${countLabel}`
              // @ts-ignore
              : `${filtered.length} of ${items.length}${hasMore ? "+" : ""} ${countLabel}`}
          </span>
        </div>
      )}

      <div className={styles.list} ref={listRef}>
        {filtered.map((item: any) => (
          <HistoryItemComponent
            key={item.id}
            item={item}
            // @ts-ignore
            isActive={item.id === activeId}
            // @ts-ignore
            onClick={onSelect}
            // @ts-ignore
            onDelete={onDelete}
            // @ts-ignore
            onDownload={onDownload}
            // @ts-ignore
            onCopy={onCopy}
            // @ts-ignore
            icon={ItemIcon}
            readOnly={readOnly}
            admin={admin}
            // @ts-ignore
            isNew={newIds?.has?.(item.id)}
            // @ts-ignore
            isFavorite={(favorites || []).includes(item.id)}
            // @ts-ignore
            onToggleFavorite={onToggleFavorite}
            dataPanelClose
            // @ts-ignore
            // @ts-ignore
            onOpenInNewTab={onOpenInNewTab ? (item: any) => onOpenInNewTab(item) : undefined}
            // @ts-ignore
            isGenerating={generatingSessionIds?.has?.(item.id)}
          />
        ))}
        {filtered.length === 0 && !loadingMore && (
          <div className={styles.empty}>
            {searchQuery.trim() ? "No matches" : emptyLabel}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        {loadingMore && (
          <div className={styles.loadingMore}>
            <LoadingIndicatorComponent size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
