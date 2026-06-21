"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePersistedState } from "../hooks/usePersistedState";
import {
  Image as ImageIcon,
  Music,
  Film,
  FileText,
  User,
  Sparkles,
  ExternalLink,
  Grid,
  List,
  Star,
  Bot,
} from "lucide-react";
import Link from "next/link";
import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import MediaCardComponent from "./MediaCardComponent";
import SearchFilterComponent from "./SearchFilterComponent";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import {
  PaginationComponent,
  SearchInputComponent,
  TableComponent,
} from "@rodrigo-barraza/components-library";

import FilterDropdownComponent from "./FilterDropdownComponent";
import { LoadingMessage, EmptyMessage } from "./StateMessageComponent";
import {
  FilterBarComponent,
  ViewModeToggleComponent,
} from "./FilterBarComponent";
import { MODALITY_COLORS } from "./WorkflowNodeConstantsComponent";
import { buildDateRangeParams } from "../utils/utilities";
import styles from "./MediaPageComponent.module.css";
import { LS_DATE_RANGE } from "../constants";

const ORIGIN_FILTERS = [
  { key: "user", label: "Uploaded", icon: User },
  { key: "ai", label: "Generated", icon: Sparkles },
];

const TYPE_FILTERS = [
  {
    key: "image",
    label: "Images",
    icon: ImageIcon,
    color: MODALITY_COLORS.image,
  },
  { key: "audio", label: "Audio", icon: Music, color: MODALITY_COLORS.audio },
  { key: "video", label: "Video", icon: Film, color: MODALITY_COLORS.video },
  { key: "pdf", label: "PDF", icon: FileText, color: MODALITY_COLORS.pdf },
];

function resolveUrl(url: string | undefined | null) {
  if (!url || typeof url !== "string") return null;
  return PrismService.getFileUrl(url);
}

function MediaTypeIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color =
    (MODALITY_COLORS as Record<string, string>)[type] ||
    (MODALITY_COLORS as Record<string, string>).image;
  if (type === "audio") return <Music size={size} style={{ color }} />;
  if (type === "video") return <Film size={size} style={{ color }} />;
  if (type === "pdf") return <FileText size={size} style={{ color }} />;
  return <ImageIcon size={size} style={{ color }} />;
}

function OriginBadge({
  origin,
  className,
}: {
  origin: string;
  className?: string;
}) {
  return (
    <span
      className={`${className} ${origin === "ai" ? styles['origin-ai'] : styles['origin-user']}`}
    >
      {origin === "ai" ? (
        <>
          <Sparkles size={10} /> Generated
        </>
      ) : (
        <>
          <User size={10} /> Uploaded
        </>
      )}
    </span>
  );
}

export interface MediaItem {
  convId: string;
  mediaType: string;
  url?: string;
  origin: string;
  convTitle?: string;
  project?: string;
  model?: string;
  provider?: string;
  timestamp?: number | string;
}

export interface MediaPageComponentProps {
  mode?: string;
  project?: string | null;
  dateRange?: { from: string; to: string };
  agent?: string | null;
  onCountChange?: (total: number) => void;
}

export default function MediaPageComponent({
  mode = "user",
  project: externalProject,
  dateRange: externalDateRange,
  agent: externalAgent,
  onCountChange,
}: MediaPageComponentProps) {
  const isAdmin = mode === "admin";
  const convBasePath = "/admin/chat";

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("all");
  const [type, setType] = useState("all");
  const [internalProject, setInternalProject] = useState("");
  const project = externalProject ?? internalProject;
  const [username, setUsername] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [viewMode, setViewMode] = usePersistedState(
    `media-page:view-mode:${mode}`,
    "grid",
  );
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [internalDateRange, setInternalDateRange] = useState({
    from: "",
    to: "",
  });
  const dateRange = externalDateRange ?? internalDateRange;
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const PAGE_SIZE = 60;
  const searchTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const loadMedia = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (origin !== "all") params.origin = origin;
      if (type !== "all") params.type = type;
      if (isAdmin) {
        if (project) params.project = project;
        if (username) params.username = username;
      }
      if (search) params.search = search;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (externalAgent) params.agent = externalAgent;
      Object.assign(params, buildDateRangeParams(dateRange));

      const service = isAdmin ? IrisService : PrismService;
      const result = await service.getMedia(params) as unknown as { data?: MediaItem[]; total?: number; projects?: string[]; usernames?: string[]; providers?: string[]; models?: string[] };
      setMedia(result.data || []);
      setTotal(result.total || 0);
      if (result.projects) setProjects(result.projects);
      if (result.usernames) setUsernames(result.usernames);
      if (result.providers) setProviders(result.providers);
      if (result.models) setModels(result.models);
    } catch (error: unknown) {
      console.error("Failed to load media:", error);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    origin,
    type,
    project,
    username,
    search,
    provider,
    model,
    dateRange,
    isAdmin,
    externalAgent,
  ]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Report count to parent
  useEffect(() => {
    onCountChange?.(total);
  }, [onCountChange, total]);

  useEffect(() => {
    PrismService.getFavorites("media")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((file) => file.key)),
      )
      .catch(() => {});
  }, []);

  const toggleFavorite = async (mediaKey: string) => {
    if (favoriteKeys.includes(mediaKey)) {
      setFavoriteKeys((prev) => prev.filter((k) => k !== mediaKey));
      PrismService.removeFavorite("media", mediaKey).catch(() => {});
    } else {
      setFavoriteKeys((prev) => [...prev, mediaKey]);
      PrismService.addFavorite("media", mediaKey, {}).catch(() => {});
    }
  };

  const getMediaKey = (mediaItem: MediaItem, i: number) =>
    `${mediaItem.convId}-${mediaItem.mediaType}-${i}`;

  const displayMedia = showFavoritesOnly
    ? media.filter((mediaItem, i) => favoriteKeys.includes(getMediaKey(mediaItem, i)))
    : media;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const listColumns = [
    {
      key: "preview",
      label: "Preview",
      sortable: false,
      render: (mediaRow: MediaItem) => {
        const resolvedUrl = resolveUrl(mediaRow.url);
        return (
          <div className={styles['list-thumb']}>
            {mediaRow.mediaType === "image" && resolvedUrl ? (
              <img
                src={resolvedUrl}
                alt=""
                className={styles['list-thumb-img']}
                style={{ cursor: "pointer" }}
                loading="lazy"
                onClick={() => setLightboxSrc(resolvedUrl)}
              />
            ) : mediaRow.mediaType === "video" && resolvedUrl ? (
              <video
                src={resolvedUrl}
                className={styles['list-thumb-img']}
                muted
                preload="metadata"
              />
            ) : mediaRow.mediaType === "audio" && resolvedUrl ? (
              <div
                className={styles['list-thumb-audio']}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <AudioPlayerRecorderComponent sourceUrl={resolvedUrl} compact />
              </div>
            ) : mediaRow.mediaType === "pdf" && resolvedUrl ? (
              <iframe
                src={resolvedUrl}
                className={styles['list-thumb-pdf']}
                title="PDF"
              />
            ) : (
              <div className={styles['list-thumb-placeholder']}>
                <MediaTypeIcon type={mediaRow.mediaType} size={16} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      render: (mediaRow: MediaItem) => (
        <span
          className={styles['type-badge']}
          style={{ color: (MODALITY_COLORS as Record<string, string>)[mediaRow.mediaType] }}
        >
          {mediaRow.mediaType}
        </span>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (mediaRow: MediaItem) => (
        <OriginBadge origin={mediaRow.origin} className={styles['origin-pill']} />
      ),
    },
    {
      key: "conversation",
      label: "Conversation",
      render: (mediaRow: MediaItem) => (
        <Link
          href={`${convBasePath}/${mediaRow.convId}`}
          className={styles['conversation-link']}
          title={mediaRow.convTitle}
        >
          <ExternalLink size={10} />
          <span>{mediaRow.convTitle}</span>
        </Link>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "project",
            label: "Project",
            render: (mediaRow: MediaItem) =>
              mediaRow.project ? (
                <span className={styles['project-tag']}>{mediaRow.project}</span>
              ) : (
                <span className={styles['time']}>—</span>
              ),
          },
        ]
      : []),
    {
      key: "model",
      label: "Model",
      render: (mediaRow: MediaItem) =>
        mediaRow.model ? (
          <span className={styles['model-tag']}>{mediaRow.model.split("/").pop()}</span>
        ) : (
          <span className={styles['time']}>—</span>
        ),
    },
    {
      key: "date",
      label: "Date",
      render: (mediaRow: MediaItem) => (
        <span className={styles['time']}>
          {mediaRow.timestamp ? new Date(mediaRow.timestamp).toLocaleDateString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      {!isAdmin ? (
        <div className={`media-page-component ${styles['container']}`}>
          {/* Header */}
          <div className={styles['header']}>
            <div className={styles['header-left']}>
              <h1 className={styles['title']}>
                <ImageIcon className={styles['title-icon']} size={22} />
                Media
              </h1>
              <p className={styles['subtitle']}>
                All uploaded and generated files across your conversations.
              </p>
            </div>

            <div className={styles['header-right']}>
              {/* Stats */}
              <div className={styles['stats-badges']}>
                <div className={styles['stat-badge']}>
                  <span className={styles['stat-value']}>{total}</span> files
                </div>
              </div>
            </div>
          </div>

          <div className={styles['content']}>
            <SearchInputComponent
              value={searchInput}
              onChange={(searchValue: string) => {
                setSearchInput(searchValue);
                clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => {
                  setSearch(searchValue);
                  setPage(1);
                }, 300);
              }}
              placeholder="Search titles & conversations…"
              compact
              className={styles['search-wrapper']}
            />

            {/* Filters */}
            <FilterBarComponent>
              <FilterDropdownComponent
                groups={[
                  {
                    label: "Source",
                    items: ORIGIN_FILTERS.map((file) => ({
                      key: file.key,
                      icon: file.icon,
                      title: file.label,
                    })),
                    activeKeys: origin === "all" ? null : origin,
                    isSingleSelect: true,
                    onToggle: (toggledValue: string | null) => {
                      setOrigin(toggledValue || "all");
                      setPage(1);
                    },
                  },
                  {
                    label: "Type",
                    items: TYPE_FILTERS.map((file) => ({
                      key: file.key,
                      icon: file.icon,
                      color: file.color,
                      title: file.label,
                    })),
                    activeKeys: type === "all" ? null : type,
                    isSingleSelect: true,
                    onToggle: (toggledValue: string | null) => {
                      setType(toggledValue || "all");
                      setPage(1);
                    },
                  },
                  ...(providers.length >= 2
                    ? [
                        {
                          label: "Providers",
                          items: providers.map((provider) => ({
                            key: provider,
                            icon: () => <ProviderLogo provider={provider} size={13} />,
                            title: resolveProviderLabel(provider),
                          })),
                          activeKeys: provider || null,
                          isSingleSelect: true,
                          onToggle: (toggledValue: string | null) => {
                            setProvider(toggledValue || "");
                            setModel("");
                            setPage(1);
                          },
                        },
                      ]
                    : []),
                  ...(models.length >= 2
                    ? [
                        {
                          label: "Models",
                          items: models.map((mediaItem) => ({
                            key: mediaItem,
                            icon: Bot,
                            title: mediaItem,
                          })),
                          activeKeys: model || null,
                          isSingleSelect: true,
                          onToggle: (toggledValue: string | null) => {
                            setModel(toggledValue || "");
                            setPage(1);
                          },
                        },
                      ]
                    : []),
                  {
                    label: "Favorites",
                    items: [
                      { key: "favorites", icon: Star, title: "Favorites Only" },
                    ],
                    activeKeys: showFavoritesOnly ? "favorites" : null,
                    isSingleSelect: true,
                    onToggle: (toggledValue: string | null) => setShowFavoritesOnly(toggledValue === "favorites"),
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

              {isAdmin && externalProject === undefined && (
                <SearchFilterComponent
                  options={projects}
                  value={project}
                  onChange={(value) => {
                    setInternalProject(value);
                    setPage(1);
                  }}
                  placeholder="All Projects"
                  allLabel="All Projects"
                />
              )}

              {isAdmin && (
                <SearchFilterComponent
                  options={usernames}
                  value={username}
                  onChange={(value) => {
                    setUsername(value);
                    setPage(1);
                  }}
                  placeholder="All Users"
                  allLabel="All Users"
                  icon={User}
                />
              )}

              <ViewModeToggleComponent
                mode={viewMode}
                onChange={setViewMode}
                modes={[
                  { key: "grid", icon: Grid, title: "Grid view" },
                  { key: "list", icon: List, title: "List view" },
                ]}
              />
            </FilterBarComponent>

            {loading && <LoadingMessage message="Loading media..." />}

            {/* -- Grid View -- */}
            {!loading && viewMode === "grid" && (
              <div className={styles['media-grid']}>
                {displayMedia.map((mediaItem, i) => {
                  const mediaKey = getMediaKey(mediaItem, i);
                  const isFav = favoriteKeys.includes(mediaKey);
                  return (
                    <MediaCardComponent
                      key={`${mediaItem.convId}-${i}`}
                      media={mediaItem}
                      convBasePath={convBasePath}
                      showFavorite
                      isFavorite={isFav}
                      onFavorite={() => toggleFavorite(mediaKey)}
                      onImageClick={(imageUrl: string) => setLightboxSrc(imageUrl)}
                    />
                  );
                })}
              </div>
            )}

            {/* -- List View -- */}
            {!loading && viewMode === "list" && (
              <div className={styles['list-wrapper']}>
                <TableComponent
                  columns={listColumns}
                  data={displayMedia}
                  getRowKey={(row: MediaItem, rowIndex: number) => `${row.convId}-${rowIndex}`}
                />
              </div>
            )}

            {!loading && displayMedia.length === 0 && (
              <EmptyMessage message="No media found" />
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
        <div className={styles['admin-content']}>
          <SearchInputComponent
            value={searchInput}
            onChange={(searchValue: string) => {
              setSearchInput(searchValue);
              clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                setSearch(searchValue);
                setPage(1);
              }, 300);
            }}
            placeholder="Search titles & conversations…"
            compact
            className={styles['search-wrapper']}
          />

          {/* Filters */}
          <FilterBarComponent>
            <FilterDropdownComponent
              groups={[
                {
                  label: "Source",
                  items: ORIGIN_FILTERS.map((file) => ({
                    key: file.key,
                    icon: file.icon,
                    title: file.label,
                  })),
                  activeKeys: origin === "all" ? null : origin,
                  isSingleSelect: true,
                  onToggle: (toggledValue: string | null) => {
                    setOrigin(toggledValue || "all");
                    setPage(1);
                  },
                },
                {
                  label: "Type",
                  items: TYPE_FILTERS.map((file) => ({
                    key: file.key,
                    icon: file.icon,
                    color: file.color,
                    title: file.label,
                  })),
                  activeKeys: type === "all" ? null : type,
                  isSingleSelect: true,
                  onToggle: (toggledValue: string | null) => {
                    setType(toggledValue || "all");
                    setPage(1);
                  },
                },
                ...(providers.length >= 2
                  ? [
                      {
                        label: "Providers",
                        items: providers.map((provider) => ({
                          key: provider,
                          icon: () => <ProviderLogo provider={provider} size={13} />,
                          title: resolveProviderLabel(provider),
                        })),
                        activeKeys: provider || null,
                        isSingleSelect: true,
                        onToggle: (toggledValue: string | null) => {
                          setProvider(toggledValue || "");
                          setModel("");
                          setPage(1);
                        },
                      },
                    ]
                  : []),
                ...(models.length >= 2
                  ? [
                      {
                        label: "Models",
                        items: models.map((mediaItem) => ({
                          key: mediaItem,
                          icon: Bot,
                          title: mediaItem,
                        })),
                        activeKeys: model || null,
                        isSingleSelect: true,
                        onToggle: (toggledValue: string | null) => {
                          setModel(toggledValue || "");
                          setPage(1);
                        },
                      },
                    ]
                  : []),
                {
                  label: "Favorites",
                  items: [
                    { key: "favorites", icon: Star, title: "Favorites Only" },
                  ],
                  activeKeys: showFavoritesOnly ? "favorites" : null,
                  isSingleSelect: true,
                  onToggle: (toggledValue: string | null) => setShowFavoritesOnly(toggledValue === "favorites"),
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

            {isAdmin && externalProject === undefined && (
              <SearchFilterComponent
                options={projects}
                value={project}
                onChange={(value) => {
                  setInternalProject(value);
                  setPage(1);
                }}
                placeholder="All Projects"
                allLabel="All Projects"
              />
            )}

            {isAdmin && (
              <SearchFilterComponent
                options={usernames}
                value={username}
                onChange={(value) => {
                  setUsername(value);
                  setPage(1);
                }}
                placeholder="All Users"
                allLabel="All Users"
                icon={User}
              />
            )}

            <ViewModeToggleComponent
              mode={viewMode}
              onChange={setViewMode}
              modes={[
                { key: "grid", icon: Grid, title: "Grid view" },
                { key: "list", icon: List, title: "List view" },
              ]}
            />
          </FilterBarComponent>

          {loading && <LoadingMessage message="Loading media..." />}

          {/* -- Grid View -- */}
          {!loading && viewMode === "grid" && (
            <div className={styles['media-grid']}>
              {displayMedia.map((mediaItem, i) => {
                const mediaKey = getMediaKey(mediaItem, i);
                const isFav = favoriteKeys.includes(mediaKey);
                return (
                  <MediaCardComponent
                    key={`${mediaItem.convId}-${i}`}
                    media={mediaItem}
                    convBasePath={convBasePath}
                    showFavorite
                    isFavorite={isFav}
                    onFavorite={() => toggleFavorite(mediaKey)}
                    onImageClick={(imageUrl: string) => setLightboxSrc(imageUrl)}
                  />
                );
              })}
            </div>
          )}

          {/* -- List View -- */}
          {!loading && viewMode === "list" && (
            <div className={styles['list-wrapper']}>
              <TableComponent
                columns={listColumns}
                data={displayMedia}
                getRowKey={(row: MediaItem, rowIndex: number) => `${row.convId}-${rowIndex}`}
              />
            </div>
          )}

          {!loading && displayMedia.length === 0 && (
            <EmptyMessage message="No media found" />
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

      {lightboxSrc && (
        <ImagePreviewComponent
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
          readOnly
        />
      )}
    </>
  );
}
