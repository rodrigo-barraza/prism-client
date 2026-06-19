"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
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
  PaginationComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";

import FilterDropdownComponent from "./FilterDropdownComponent";
import { LoadingMessage, EmptyMessage } from "./StateMessageComponent";
import { FilterBarComponent } from "./FilterBarComponent";
import { formatCost } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../utils/utilities";
import styles from "./TextPageComponent.module.css";
import { LS_DATE_RANGE } from "../constants";

const ORIGIN_FILTERS = [
  { key: "user", label: "Prompts", icon: User },
  { key: "ai", label: "Responses", icon: Sparkles },
];

interface TextItem {
  convId: string;
  convTitle: string;
  origin: string;
  content: string;
  model?: string;
  hasImages?: boolean;
  timestamp?: string;
  estimatedCost?: number;
}

interface TextSearchParams {
  page: number;
  limit: number;
  origin?: string;
  search?: string;
  provider?: string;
  model?: string;
  agent?: string;
  from?: string;
  to?: string;
}

interface TextSearchResponse {
  data: TextItem[];
  total: number;
  providers?: string[];
  models?: string[];
}

interface TextPageComponentProps {
  mode?: string;
  dateRange?: { from: string; to: string };
  agent?: string;
  onCountChange?: (count: number) => void;
}

export default function TextPageComponent({
  mode = "user",
  dateRange: externalDateRange,
  agent: externalAgent,
  onCountChange,
}: TextPageComponentProps) {
  const isAdmin = mode === "admin";
  const convBasePath = "/admin/chat";

  const [texts, setTexts] = useState<TextItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [internalDateRange, setInternalDateRange] = useState({
    from: "",
    to: "",
  });
  const dateRange = externalDateRange ?? internalDateRange;
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const PAGE_SIZE = 30;

  const loadText = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number | boolean> = { page, limit: PAGE_SIZE };
      if (origin !== "all") params.origin = origin;
      if (search) params.search = search;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (externalAgent) params.agent = externalAgent;
      Object.assign(params, buildDateRangeParams(dateRange));

      const service = isAdmin ? IrisService : PrismService;
      const result = await service.getText(params) as unknown as TextSearchResponse;
      setTexts(result.data || []);
      setTotal(result.total || 0);
      if (result.providers) setProviders(result.providers);
      if (result.models) setModels(result.models);
    } catch (error: unknown) {
      console.error("Failed to load text:", error);
    } finally {
      setLoading(false);
    }
  }, [page, origin, search, provider, model, dateRange, isAdmin, externalAgent]);

  useEffect(() => {
    loadText();
  }, [loadText]);

  // Report count to parent
  useEffect(() => {
    onCountChange?.(total);
  }, [onCountChange, total]);

  useEffect(() => {
    PrismService.getFavorites("text")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((favorite) => favorite.key)),
      )
      .catch(() => {});
  }, []);

  const toggleFavorite = async (textKey: string) => {
    if (favoriteKeys.includes(textKey)) {
      setFavoriteKeys((previousKeys) => previousKeys.filter((key) => key !== textKey));
      PrismService.removeFavorite("text", textKey).catch(() => {});
    } else {
      setFavoriteKeys((previousKeys) => [...previousKeys, textKey]);
      PrismService.addFavorite("text", textKey).catch(() => {});
    }
  };

  const getTextKey = (textItem: TextItem, index: number) => `${textItem.convId}-${textItem.origin}-${index}`;

  const displayTexts = showFavoritesOnly
    ? texts.filter((textItem, index) => favoriteKeys.includes(getTextKey(textItem, index)))
    : texts;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {!isAdmin ? (
        <div className={`text-page-component ${styles['container']}`}>
          {/* Header */}
          <div className={styles['header']}>
            <div className={styles['header-left']}>
              <h1 className={styles['title']}>
                <FileText className={styles['title-icon']} size={22} />
                Text
              </h1>
              <p className={styles['subtitle']}>
                All text message segments and prompts recorded across conversations.
              </p>
            </div>

            <div className={styles['header-right']}>
              {/* Stats */}
              <div className={styles['stats-badges']}>
                <div className={styles['stat-badge']}>
                  <span className={styles['stat-value']}>{total}</span> messages
                </div>
              </div>
            </div>
          </div>

          <div className={styles['page']}>
            <SearchInputComponent
              value={searchInput}
              onChange={(value: string) => {
                setSearchInput(value);
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search text…"
              compact
              className={styles["search-input-container"]}
            />

            {/* Filters */}
            <FilterBarComponent>

              <FilterDropdownComponent
                groups={[
                  {
                    label: "Source",
                    items: ORIGIN_FILTERS.map((filterOption) => ({
                      key: filterOption.key,
                      icon: filterOption.icon,
                      title: filterOption.label,
                    })),
                    activeKeys: origin === "all" ? null : origin,
                    isSingleSelect: true,
                    onToggle: (value) => {
                      setOrigin(value || "all");
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
                    onToggle: (value) => setShowFavoritesOnly(value === "favorites"),
                  },
                ]}
                dateRange={!externalDateRange ? dateRange : undefined}
                onDateChange={
                  !externalDateRange
                    ? (value) => {
                        setInternalDateRange(value);
                        setPage(1);
                      }
                    : undefined
                }
                dateStorageKey={!externalDateRange ? LS_DATE_RANGE : undefined}
              />

              <SearchFilterComponent
                options={providers}
                value={provider}
                onChange={(value) => {
                  setProvider(value);
                  setModel("");
                  setPage(1);
                }}
                placeholder="All Providers"
                allLabel="All Providers"
              />

              <SearchFilterComponent
                options={
                  provider
                    ? models.filter((modelName) => modelName.startsWith(provider + "/"))
                    : models
                }
                value={model}
                onChange={(value) => {
                  setModel(value);
                  setPage(1);
                }}
                placeholder="All Models"
                allLabel="All Models"
              />
            </FilterBarComponent>

            {loading && <LoadingMessage message="Loading messages..." />}

            {/* Text List */}
            {!loading && (
              <div className={styles['text-list']}>
                {displayTexts.map((textItem, index) => {
                  const textKey = getTextKey(textItem, index);
                  const isFav = favoriteKeys.includes(textKey);
                  return (
                    <div key={`${textItem.convId}-${index}`} className={styles['text-card']}>
                      <div className={styles['text-header']}>
                        <button
                          className={`${styles['favorite-button']} ${isFav ? styles['favorite-button-is-active-state'] : ""}`}
                          onClick={() => toggleFavorite(textKey)}
                          title={
                            isFav ? "Remove from favorites" : "Add to favorites"
                          }
                        >
                          <Star size={11} fill={isFav ? "currentColor" : "none"} />
                        </button>
                        <span
                          className={`${styles['role-badge']} ${textItem.origin === "ai" ? styles['role-ai'] : styles['role-user']}`}
                        >
                          {textItem.origin === "ai" ? (
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
                          href={`${convBasePath}/${textItem.convId}`}
                          className={styles['conversation-link']}
                          title={textItem.convTitle}
                        >
                          <ExternalLink size={10} />
                          <span>{textItem.convTitle}</span>
                        </Link>
                        {textItem.hasImages && (
                          <span className={styles['attachment-tag']}>
                            <ImageIcon size={10} /> +media
                          </span>
                        )}
                        {textItem.model && (
                          <span className={styles['model-tag']}>
                            {textItem.model.split("/").pop()}
                          </span>
                        )}
                        {textItem.timestamp && (
                          <span className={styles['time']}>
                            {new Date(textItem.timestamp).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <ChatPreviewComponent
                        messages={[
                          {
                            role: textItem.origin === "ai" ? "assistant" : "user",
                            content: textItem.content,
                            model: textItem.model,
                            estimatedCost: textItem.estimatedCost,
                          },
                        ]}
                        readOnly
                        maxHeight="400px"
                        className={styles['card-preview']}
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
        </div>
      ) : (
        <div className={styles['admin-page']}>
          <SearchInputComponent
            value={searchInput}
            onChange={(value: string) => {
              setSearchInput(value);
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search text…"
            compact
            className={styles["search-input-container"]}
          />

          {/* Filters */}
          <FilterBarComponent>

            <FilterDropdownComponent
              groups={[
                {
                  label: "Source",
                  items: ORIGIN_FILTERS.map((filterOption) => ({
                    key: filterOption.key,
                    icon: filterOption.icon,
                    title: filterOption.label,
                  })),
                  activeKeys: origin === "all" ? null : origin,
                  isSingleSelect: true,
                  onToggle: (value) => {
                    setOrigin(value || "all");
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
                  onToggle: (value) => setShowFavoritesOnly(value === "favorites"),
                },
              ]}
              dateRange={!externalDateRange ? dateRange : undefined}
              onDateChange={
                !externalDateRange
                  ? (value) => {
                      setInternalDateRange(value);
                      setPage(1);
                    }
                  : undefined
              }
              dateStorageKey={!externalDateRange ? LS_DATE_RANGE : undefined}
            />

            <SearchFilterComponent
              options={providers}
              value={provider}
              onChange={(value) => {
                setProvider(value);
                setModel("");
                setPage(1);
              }}
              placeholder="All Providers"
              allLabel="All Providers"
            />

            <SearchFilterComponent
              options={
                provider
                  ? models.filter((modelName) => modelName.startsWith(provider + "/"))
                  : models
              }
              value={model}
              onChange={(value) => {
                setModel(value);
                setPage(1);
              }}
              placeholder="All Models"
              allLabel="All Models"
            />
          </FilterBarComponent>

          {loading && <LoadingMessage message="Loading messages..." />}

          {/* Text List */}
          {!loading && (
            <div className={styles['text-list']}>
              {displayTexts.map((textItem, index) => {
                const textKey = getTextKey(textItem, index);
                const isFav = favoriteKeys.includes(textKey);
                return (
                  <div key={`${textItem.convId}-${index}`} className={styles['text-card']}>
                    <div className={styles['text-header']}>
                      <button
                        className={`${styles['favorite-button']} ${isFav ? styles['favorite-button-is-active-state'] : ""}`}
                        onClick={() => toggleFavorite(textKey)}
                        title={
                          isFav ? "Remove from favorites" : "Add to favorites"
                        }
                      >
                        <Star size={11} fill={isFav ? "currentColor" : "none"} />
                      </button>
                      <span
                        className={`${styles['role-badge']} ${textItem.origin === "ai" ? styles['role-ai'] : styles['role-user']}`}
                      >
                        {textItem.origin === "ai" ? (
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
                        href={`${convBasePath}/${textItem.convId}`}
                        className={styles['conversation-link']}
                        title={textItem.convTitle}
                      >
                        <ExternalLink size={10} />
                        <span>{textItem.convTitle}</span>
                      </Link>
                      {textItem.hasImages && (
                        <span className={styles['attachment-tag']}>
                          <ImageIcon size={10} /> +media
                        </span>
                      )}
                      {textItem.model && (
                        <span className={styles['model-tag']}>
                          {textItem.model.split("/").pop()}
                        </span>
                      )}
                      {textItem.timestamp && (
                        <span className={styles['time']}>
                          {new Date(textItem.timestamp).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <ChatPreviewComponent
                      messages={[
                        {
                          role: textItem.origin === "ai" ? "assistant" : "user",
                          content: textItem.content,
                          model: textItem.model,
                          estimatedCost: textItem.estimatedCost,
                        },
                      ]}
                      readOnly
                      maxHeight="400px"
                      className={styles['card-preview']}
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
      )}
    </>
  );
}
