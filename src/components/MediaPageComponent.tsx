"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { PageHeaderComponent, PaginationComponent, SearchInputComponent, TableComponent } from "@rodrigo-barraza/components-library";

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

function resolveUrl(url: any) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("minio://")) return PrismService.getFileUrl(url);
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http")) return url;
  return url;
}

// @ts-ignore
function MediaTypeIcon({ type: any, size = 32 }) {
  // @ts-ignore
  // @ts-ignore
  const color = MODALITY_COLORS[type] || MODALITY_COLORS.image;
  // @ts-ignore
  if (type === "audio") return <Music size={size} style={{ color }} />;
  // @ts-ignore
  if (type === "video") return <Film size={size} style={{ color }} />;
  // @ts-ignore
  if (type === "pdf") return <FileText size={size} style={{ color }} />;
  return <ImageIcon size={size} style={{ color }} />;
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function OriginBadge({ origin: any, className: any }) {
  return (
    <span
      // @ts-ignore
      className={`${className} ${origin === "ai" ? styles.originAi : styles.originUser}`}
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

export default function MediaPageComponent({
  mode = "user",
  // @ts-ignore
  project: externalProject,
  // @ts-ignore
  dateRange: externalDateRange,
  // @ts-ignore
  onCountChange: any,
}) {
  const isAdmin = mode === "admin";
  const convBasePath = "/admin/conversations";

  const [media, setMedia] = useState<any>([]);
  const [total, setTotal] = useState<any>(0);
  const [projects, setProjects] = useState<any>([]);
  const [usernames, setUsernames] = useState<any>([]);
  const [loading, setLoading] = useState<any>(true);
  const [origin, setOrigin] = useState<any>("all");
  const [type, setType] = useState<any>("all");
  const [internalProject, setInternalProject] = useState<any>("");
  const project = externalProject ?? internalProject;
  const [username, setUsername] = useState<any>("");
  const [provider, setProvider] = useState<any>("");
  const [model, setModel] = useState<any>("");
  const [providers, setProviders] = useState<any>([]);
  const [models, setModels] = useState<any>([]);
  const [viewMode, setViewMode] = useState<any>("grid");
  const [search, setSearch] = useState<any>("");
  const [searchInput, setSearchInput] = useState<any>("");
  const [page, setPage] = useState<any>(1);
  const [lightboxSrc, setLightboxSrc] = useState<any>(null);
  const [internalDateRange, setInternalDateRange] = useState<any>({ from: "", to: "" });
  const dateRange = externalDateRange ?? internalDateRange;
  const [favoriteKeys, setFavoriteKeys] = useState<any>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<any>(false);
  const PAGE_SIZE = 60;
  const searchTimerRef = useRef<any>(null);

  const loadMedia = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE };
      // @ts-ignore
      if (origin !== "all") params.origin = origin;
      // @ts-ignore
      if (type !== "all") params.type = type;
      if (isAdmin) {
        // @ts-ignore
        if (project) params.project = project;
        // @ts-ignore
        if (username) params.username = username;
      }
      // @ts-ignore
      if (search) params.search = search;
      // @ts-ignore
      if (provider) params.provider = provider;
      // @ts-ignore
      if (model) params.model = model;
      Object.assign(params, buildDateRangeParams(dateRange));

      const service = isAdmin ? IrisService : PrismService;
      const result = await service.getMedia(params);
      setMedia(result.data || []);
      setTotal(result.total || 0);
      if (result.projects) setProjects(result.projects);
      if (result.usernames) setUsernames(result.usernames);
      if (result.providers) setProviders(result.providers);
      if (result.models) setModels(result.models);
    } catch (error) {
      // @ts-ignore
      console.error("Failed to load media:", err);
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
  ]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Report count to parent
  useEffect(() => {
    // @ts-ignore
    onCountChange?.(total);
  // @ts-ignore
  }, [onCountChange, total]);

  useEffect(() => {
    PrismService.getFavorites("media")
      .then((favs) => setFavoriteKeys(favs.map((f: any) => f.key)))
      .catch(() => {});
  }, []);

  const toggleFavorite = async (mediaKey: any) => {
    if (favoriteKeys.includes(mediaKey)) {
      setFavoriteKeys((prev: any) => prev.filter((k: any) => k !== mediaKey));
      PrismService.removeFavorite("media", mediaKey).catch(() => {});
    } else {
      setFavoriteKeys((prev: any) => [...prev, mediaKey]);
      // @ts-ignore
      PrismService.addFavorite("media", mediaKey).catch(() => {});
    }
  };

  const getMediaKey = (m: any, i: any) => `${m.convId}-${m.mediaType}-${i}`;

  const displayMedia = showFavoritesOnly
    ? media.filter((m: any, i: any) => favoriteKeys.includes(getMediaKey(m, i)))
    : media;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const listColumns = [
    {
      key: "preview",
      label: "Preview",
      sortable: false,
      render: (m: any) => {
        const resolvedUrl = resolveUrl(m.url);
        return (
          <div className={styles.listThumb}>
            {m.mediaType === "image" && resolvedUrl ? (
              <img
                src={resolvedUrl}
                alt=""
                className={styles.listThumbImg}
                style={{ cursor: "pointer" }}
                loading="lazy"
                onClick={() => setLightboxSrc(resolvedUrl)}
              />
            ) : m.mediaType === "video" && resolvedUrl ? (
              <video
                src={resolvedUrl}
                className={styles.listThumbImg}
                muted
                preload="metadata"
              />
            ) : m.mediaType === "audio" && resolvedUrl ? (
              <div
                className={styles.listThumbAudio}
                onClick={(e) => e.stopPropagation()}
              >
                {/* @ts-ignore */}
                <AudioPlayerRecorderComponent src={resolvedUrl} compact />
              </div>
            ) : m.mediaType === "pdf" && resolvedUrl ? (
              <iframe
                src={resolvedUrl}
                className={styles.listThumbPdf}
                title="PDF"
              />
            ) : (
              <div className={styles.listThumbPlaceholder}>
                <MediaTypeIcon type={m.mediaType} size={16} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      render: (m: any) => (
        <span
          className={styles.typeBadge}
          // @ts-ignore
          style={{ color: MODALITY_COLORS[m.mediaType] }}
        >
          {m.mediaType}
        </span>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (m: any) => (
        <OriginBadge origin={m.origin} className={styles.originPill} />
      ),
    },
    {
      key: "conversation",
      label: "Conversation",
      render: (m: any) => (
        <Link
          href={`${convBasePath}/${m.convId}`}
          className={styles.convLink}
          title={m.convTitle}
        >
          <ExternalLink size={10} />
          <span>{m.convTitle}</span>
        </Link>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "project",
            label: "Project",
            render: (m: any) =>
              m.project ? (
                <span className={styles.projectTag}>{m.project}</span>
              ) : (
                <span className={styles.time}>—</span>
              ),
          },
        ]
      : []),
    {
      key: "model",
      label: "Model",
      render: (m: any) =>
        m.model ? (
          <span className={styles.modelTag}>{m.model.split("/").pop()}</span>
        ) : (
          <span className={styles.time}>—</span>
        ),
    },
    {
      key: "date",
      label: "Date",
      render: (m: any) => (
        <span className={styles.time}>
          {m.timestamp ? new Date(m.timestamp).toLocaleDateString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      {!isAdmin && (
        <PageHeaderComponent
          title="Media"
          subtitle={`${total} files across conversations`}
        />
      )}
      <div className={isAdmin ? styles.adminContent : styles.content}>
        {/* Filters */}
        <FilterBarComponent>
          <SearchInputComponent
            value={searchInput}
            onChange={(v: any) => {
              setSearchInput(v);
              clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                setSearch(v);
                setPage(1);
              }, 300);
            }}
            placeholder="Search titles & conversations…"
            className={styles.searchWrapper}
          />

          <FilterDropdownComponent
            groups={[
              // @ts-ignore
              {
                label: "Source",
                items: ORIGIN_FILTERS.map((f) => ({
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
              // @ts-ignore
              {
                label: "Type",
                items: TYPE_FILTERS.map((f) => ({
                  key: f.key,
                  icon: f.icon,
                  color: f.color,
                  title: f.label,
                })),
                activeKeys: type === "all" ? null : type,
                isSingleSelect: true,
                onToggle: (v: any) => {
                  setType(v || "all");
                  setPage(1);
                },
              },
              // @ts-ignore
              ...(providers.length >= 2
                ? [
                    {
                      label: "Providers",
                      items: providers.map((p: any) => ({
                        key: p,
                        icon: () => <ProviderLogo provider={p} size={13} />,
                        title: resolveProviderLabel(p),
                      })),
                      activeKeys: provider || null,
                      isSingleSelect: true,
                      onToggle: (v: any) => {
                        setProvider(v || "");
                        setModel("");
                        setPage(1);
                      },
                    },
                  ]
                : []),
              // @ts-ignore
              ...(models.length >= 2
                ? [
                    {
                      label: "Models",
                      items: models.map((m: any) => ({
                        key: m,
                        icon: Bot,
                        title: m,
                      })),
                      activeKeys: model || null,
                      isSingleSelect: true,
                      onToggle: (v: any) => {
                        setModel(v || "");
                        setPage(1);
                      },
                    },
                  ]
                : []),
              // @ts-ignore
              {
                label: "Favorites",
                items: [{ key: "favorites", icon: Star, title: "Favorites Only" }],
                activeKeys: showFavoritesOnly ? "favorites" : null,
                isSingleSelect: true,
                onToggle: (v: any) => setShowFavoritesOnly(v === "favorites"),
              },
            ]}
            dateRange={!externalDateRange ? dateRange : undefined}
            onDateChange={!externalDateRange ? (v: any) => {
              setInternalDateRange(v);
              setPage(1);
            } : undefined}
            dateStorageKey={!externalDateRange ? LS_DATE_RANGE : undefined}
          />

          {isAdmin && externalProject === undefined && (
            // @ts-ignore
            <SearchFilterComponent
              options={projects}
              value={project}
              onChange={(v: any) => {
                setInternalProject(v);
                setPage(1);
              }}
              placeholder="All Projects"
              allLabel="All Projects"
            />
          )}

          {isAdmin && (
            // @ts-ignore
            <SearchFilterComponent
              options={usernames}
              value={username}
              onChange={(v: any) => {
                setUsername(v);
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
          <div className={styles.mediaGrid}>
            {displayMedia.map((m: any, i: any) => {
              const mediaKey = getMediaKey(m, i);
              const isFav = favoriteKeys.includes(mediaKey);
              return (
                <MediaCardComponent
                  key={`${m.convId}-${i}`}
                  media={m}
                  convBasePath={convBasePath}
                  showFavorite
                  isFavorite={isFav}
                  onFavorite={() => toggleFavorite(mediaKey)}
                  onImageClick={(url: any) => setLightboxSrc(url)}
                />
              );
            })}
          </div>
        )}

        {/* -- List View -- */}
        {!loading && viewMode === "list" && (
          <div className={styles.listWrapper}>
            <TableComponent
              columns={listColumns}
              data={displayMedia}
              getRowKey={(m: any, i: any) => `${m.convId}-${i}`}
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

      {lightboxSrc && (
        // @ts-ignore
        <ImagePreviewComponent
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
          readOnly
        />
      )}
    </>
  );
}
