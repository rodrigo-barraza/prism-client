"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User,
  Sparkles,
  ExternalLink,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import Link from "next/link";
import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import ChatPreviewComponent from "./ChatPreviewComponent";
import SearchFilterComponent from "./SearchFilterComponent";
import {
  PageHeaderComponent,
  PaginationComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";

import FilterDropdownComponent from "./FilterDropdownComponent";
import { LoadingMessage, EmptyMessage } from "./StateMessageComponent";
import { FilterBarComponent } from "./FilterBarComponent";
import { formatCost, buildDateRangeParams } from "../utils/utilities";
import styles from "./TextPageComponent.module.css";
import { LS_DATE_RANGE } from "../constants";

const ORIGIN_FILTERS = [
  { key: "user", label: "Prompts", icon: User },
  { key: "ai", label: "Responses", icon: Sparkles },
];

export default function TextPageComponent({
  mode = "user",
  dateRange: externalDateRange,
  onCountChange,
}: any) {
  const isAdmin = mode === "admin";
  const convBasePath = "/admin/conversations";

  const [texts, setTexts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [internalDateRange, setInternalDateRange] = useState({
    from: "",
    to: "",
  });
  const dateRange = externalDateRange ?? internalDateRange;
  const [favoriteKeys, setFavoriteKeys] = useState<any[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const PAGE_SIZE = 30;

  const loadText = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE };
      if (origin !== "all") (params as any).origin = origin;
      if (search) (params as any).search = search;
      if (provider) (params as any).provider = provider;
      if (model) (params as any).model = model;
      Object.assign(params, buildDateRangeParams(dateRange));

      const service = isAdmin ? IrisService : PrismService;
      const result: any = await service.getText(params);
      setTexts(result.data || []);
      setTotal(result.total || 0);
      if (result.providers) setProviders(result.providers);
      if (result.models) setModels(result.models);
    } catch (error: any) {
      console.error("Failed to load text:", error);
    } finally {
      setLoading(false);
    }
  }, [page, origin, search, provider, model, dateRange, isAdmin]);

  useEffect(() => {
    loadText();
  }, [loadText]);

  // Report count to parent
  useEffect(() => {
    onCountChange?.(total);
  }, [onCountChange, total]);

  useEffect(() => {
    PrismService.getFavorites("text")
      .then((favs: any) => setFavoriteKeys(favs.map((f: any) => f.key)))
      .catch(() => {});
  }, []);

  const toggleFavorite = async (textKey: any) => {
    if (favoriteKeys.includes(textKey)) {
      setFavoriteKeys((prev: any) => prev.filter((k: any) => k !== textKey));
      PrismService.removeFavorite("text", textKey).catch(() => {});
    } else {
      setFavoriteKeys((prev: any) => [...prev, textKey]);
      PrismService.addFavorite("text", textKey).catch(() => {});
    }
  };

  const getTextKey = (t: any, i: any) => `${t.convId}-${t.origin}-${i}`;

  const displayTexts = showFavoritesOnly
    ? texts.filter((t: any, i: any) => favoriteKeys.includes(getTextKey(t, i)))
    : texts;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {!isAdmin && (
        <PageHeaderComponent
          title="Text"
          subtitle={`${total} messages across conversations`}
        />
      )}
      <div className={isAdmin ? styles.adminPage : styles.page}>
        {/* Filters */}
        <FilterBarComponent>
          <SearchInputComponent
            value={searchInput}
            onChange={(v: any) => {
              setSearchInput(v);
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search text…"
            className={styles.searchWrapper}
          />

          <FilterDropdownComponent
            groups={[
              {
                label: "Source",
                items: ORIGIN_FILTERS.map((f: any) => ({
                  key: f.key,
                  icon: f.icon,
                  title: f.label,
                })),
                activeKeys: origin === "all" ? null : origin,
                isSingleSelect: true,
                onToggle: (v: any) => {
                  setOrigin(v || "all");
                  setPage(1);
                },
              },
              {
                label: "Favorites",
                items: [
                  { key: "favorites", icon: Star, title: "Favorites Only" },
                ],
                activeKeys: showFavoritesOnly ? "favorites" : null,
                isSingleSelect: true,
                onToggle: (v: any) => setShowFavoritesOnly(v === "favorites"),
              },
            ]}
            dateRange={!externalDateRange ? dateRange : undefined}
            onDateChange={
              !externalDateRange
                ? (v: any) => {
                    setInternalDateRange(v);
                    setPage(1);
                  }
                : undefined
            }
            dateStorageKey={!externalDateRange ? LS_DATE_RANGE : undefined}
          />

          <SearchFilterComponent
            options={providers}
            value={provider}
            onChange={(v: any) => {
              setProvider(v);
              setModel("");
              setPage(1);
            }}
            placeholder="All Providers"
            allLabel="All Providers"
          />

          <SearchFilterComponent
            options={
              provider
                ? models.filter((m: any) => m.startsWith(provider + "/"))
                : models
            }
            value={model}
            onChange={(v: any) => {
              setModel(v);
              setPage(1);
            }}
            placeholder="All Models"
            allLabel="All Models"
          />
        </FilterBarComponent>

        {loading && <LoadingMessage message="Loading messages..." />}

        {/* Text List */}
        {!loading && (
          <div className={styles.textList}>
            {displayTexts.map((t: any, i: any) => {
              const textKey = getTextKey(t, i);
              const isFav = favoriteKeys.includes(textKey);
              return (
                <div key={`${t.convId}-${i}`} className={styles.textCard}>
                  <div className={styles.textHeader}>
                    <button
                      className={`${styles.favBtn} ${isFav ? styles.favBtnActive : ""}`}
                      onClick={() => toggleFavorite(textKey)}
                      title={
                        isFav ? "Remove from favorites" : "Add to favorites"
                      }
                    >
                      <Star size={11} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    <span
                      className={`${styles.roleBadge} ${t.origin === "ai" ? styles.roleAi : styles.roleUser}`}
                    >
                      {t.origin === "ai" ? (
                        <>
                          <Sparkles size={10} /> Response
                        </>
                      ) : (
                        <>
                          <User size={10} /> Prompt
                        </>
                      )}
                    </span>
                    <Link
                      href={`${convBasePath}/${t.convId}`}
                      className={styles.convLink}
                      title={t.convTitle}
                    >
                      <ExternalLink size={10} />
                      <span>{t.convTitle}</span>
                    </Link>
                    {t.hasImages && (
                      <span className={styles.attachmentTag}>
                        <ImageIcon size={10} /> +media
                      </span>
                    )}
                    {t.model && (
                      <span className={styles.modelTag}>
                        {t.model.split("/").pop()}
                      </span>
                    )}
                    {t.timestamp && (
                      <span className={styles.time}>
                        {new Date(t.timestamp).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <ChatPreviewComponent
                    messages={[
                      {
                        role: t.origin === "ai" ? "assistant" : "user",
                        content: t.content,
                        model: t.model,
                        estimatedCost: t.estimatedCost,
                      },
                    ]}
                    readOnly
                    maxHeight="400px"
                    className={styles.cardPreview}
                  />
                </div>
              );
            })}
          </div>
        )}

        {!loading && displayTexts.length === 0 && (
          <EmptyMessage message="No text content found" />
        )}

        {/* Pagination */}
        <PaginationComponent
          page={page}
          totalPages={totalPages}
          totalItems={total}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
