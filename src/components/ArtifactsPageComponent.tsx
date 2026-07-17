"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePersistedState } from "../hooks/usePersistedState";
import {
  Package,
  FileText,
  Code,
  Image as ImageIcon,
  Music,
  Film,
  AppWindow,
  Sparkles,
  PenLine,
  ExternalLink,
  Grid,
  List,
} from "lucide-react";
import Link from "next/link";
import PrismService from "../services/PrismService";
import ImagePreviewComponent from "./ImagePreviewComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import {
  PageHeroComponent,
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
import type { ArtifactItem, ArtifactKind } from "../types/types";
import styles from "./ArtifactsPageComponent.module.css";
import {
  LOCAL_STORAGE_KEY_DATE_RANGE,
  LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE,
  LOCAL_STORAGE_KEY_ARTIFACTS_VIEW_MODE_PREFIX,
  TIMING,
} from "../constants";

const SOURCE_FILTERS = [
  { key: "document", label: "Authored", icon: PenLine },
  { key: "tool", label: "Captured", icon: Sparkles },
];

const KIND_FILTERS: Array<{
  key: ArtifactKind;
  label: string;
  icon: typeof FileText;
  color?: string;
}> = [
  { key: "markdown", label: "Markdown", icon: FileText, color: MODALITY_COLORS.text },
  { key: "html", label: "HTML", icon: Code, color: MODALITY_COLORS.functionCalling },
  { key: "image", label: "Images", icon: ImageIcon, color: MODALITY_COLORS.image },
  { key: "video", label: "Video", icon: Film, color: MODALITY_COLORS.video },
  { key: "audio", label: "Audio", icon: Music, color: MODALITY_COLORS.audio },
  { key: "embed", label: "Embeds", icon: AppWindow, color: MODALITY_COLORS.embedding },
];

const VIEW_MODES = {
  GRID: "grid",
  LIST: "list",
} as const;

const PAGE_SIZE = 60;
const CONVERSATION_BASE_PATH = "/admin/chat";

export function ArtifactKindIcon({
  kind,
  size = 14,
}: {
  kind: ArtifactKind;
  size?: number;
}) {
  const entry = KIND_FILTERS.find((filter) => filter.key === kind);
  const Icon = entry?.icon ?? FileText;
  return <Icon size={size} style={entry?.color ? { color: entry.color } : undefined} />;
}

function conversationRef(artifact: ArtifactItem): string | null {
  return artifact.conversationId || artifact.agentConversationId || null;
}

function ArtifactPreview({
  artifact,
  onImageClick,
}: {
  artifact: ArtifactItem;
  onImageClick?: (_url: string) => void;
}) {
  const resolvedUrl = artifact.url ? PrismService.getFileUrl(artifact.url) : null;

  if (artifact.kind === "image" && resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={artifact.title}
        className={styles['card-image']}
        loading="lazy"
        onClick={() => onImageClick?.(resolvedUrl)}
      />
    );
  }
  if (artifact.kind === "video" && resolvedUrl) {
    return (
      <video
        src={resolvedUrl}
        className={styles['card-image']}
        controls
        muted
        preload="metadata"
      />
    );
  }
  if (artifact.kind === "audio" && resolvedUrl) {
    return (
      <div className={styles['card-audio']}>
        <AudioPlayerRecorderComponent sourceUrl={resolvedUrl} compact />
      </div>
    );
  }
  if (artifact.kind === "embed" && resolvedUrl) {
    return (
      <iframe
        src={resolvedUrl}
        title={artifact.title}
        className={styles['card-embed']}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }
  // Documents: text preview excerpt (markdown) or a kind glyph (html)
  if (artifact.kind === "markdown" && artifact.preview) {
    return <div className={styles['card-text-preview']}>{artifact.preview}</div>;
  }
  return (
    <div className={styles['card-placeholder']}>
      <ArtifactKindIcon kind={artifact.kind} size={28} />
    </div>
  );
}

export interface ArtifactsPageComponentProps {
  mode?: string;
  dateRange?: { from: string; to: string };
  onCountChange?: (_total: number) => void;
}

export default function ArtifactsPageComponent({
  mode = "user",
  dateRange: externalDateRange,
  onCountChange,
}: ArtifactsPageComponentProps) {
  const isAdmin = mode === "admin";

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("all");
  const [kind, setKind] = useState("all");
  const [viewMode, setViewMode] = usePersistedState(
    `${LOCAL_STORAGE_KEY_ARTIFACTS_VIEW_MODE_PREFIX}${mode}`,
    VIEW_MODES.GRID as string,
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
  const searchTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const loadArtifacts = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (source !== "all") params.source = source;
      if (kind !== "all") params.kind = kind;
      if (search) params.search = search;
      Object.assign(params, buildDateRangeParams(dateRange));

      const result = await PrismService.getArtifacts(params);
      setArtifacts(result.data || []);
      setTotal(result.total || 0);
    } catch (error: unknown) {
      console.error("Failed to load artifacts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, source, kind, search, dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    loadArtifacts();
  }, [loadArtifacts]);

  // Report count to parent (admin header badge)
  useEffect(() => {
    onCountChange?.(total);
  }, [onCountChange, total]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const listColumns = [
    {
      key: "kind",
      label: "Kind",
      render: (artifactRow: ArtifactItem) => (
        <span className={styles['kind-badge']}>
          <ArtifactKindIcon kind={artifactRow.kind} />
          <span>{artifactRow.kind}</span>
        </span>
      ),
    },
    {
      key: "title",
      label: "Title",
      render: (artifactRow: ArtifactItem) => (
        <Link
          href={`/artifacts/${encodeURIComponent(artifactRow.id)}`}
          className={styles['title-link']}
        >
          {artifactRow.title}
        </Link>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (artifactRow: ArtifactItem) => (
        <span className={styles['source-tag']}>
          {artifactRow.source === "document"
            ? artifactRow.agent || "agent"
            : artifactRow.toolName || "tool"}
        </span>
      ),
    },
    {
      key: "conversation",
      label: "Conversation",
      render: (artifactRow: ArtifactItem) => {
        const convId = conversationRef(artifactRow);
        return convId ? (
          <Link
            href={`${CONVERSATION_BASE_PATH}/${convId}`}
            className={styles['conversation-link']}
          >
            <ExternalLink size={10} />
            <span>Open</span>
          </Link>
        ) : (
          <span className={styles['time']}>—</span>
        );
      },
    },
    {
      key: "version",
      label: "Version",
      render: (artifactRow: ArtifactItem) => (
        <span className={styles['time']}>v{artifactRow.version}</span>
      ),
    },
    {
      key: "date",
      label: "Updated",
      render: (artifactRow: ArtifactItem) => (
        <span className={styles['time']}>
          {artifactRow.updatedAt
            ? new Date(artifactRow.updatedAt).toLocaleDateString()
            : "—"}
        </span>
      ),
    },
  ];

  const searchControl = (
    <SearchInputComponent
      value={searchInput}
      onChange={(searchValue: string) => {
        setSearchInput(searchValue);
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          setSearch(searchValue);
          setPage(1);
        }, TIMING.DEBOUNCE_SEARCH);
      }}
      placeholder="Search artifact titles…"
      compact
      className={styles['search-wrapper']}
    />
  );

  const filterBar = (
    <FilterBarComponent>
      <FilterDropdownComponent
        groups={[
          {
            label: "Source",
            items: SOURCE_FILTERS.map((filter) => ({
              key: filter.key,
              icon: filter.icon,
              title: filter.label,
            })),
            activeKeys: source === "all" ? null : source,
            isSingleSelect: true,
            onToggle: (toggledValue: string | null) => {
              setSource(toggledValue || "all");
              setPage(1);
            },
          },
          {
            label: "Kind",
            items: KIND_FILTERS.map((filter) => ({
              key: filter.key,
              icon: filter.icon,
              color: filter.color,
              title: filter.label,
            })),
            activeKeys: kind === "all" ? null : kind,
            isSingleSelect: true,
            onToggle: (toggledValue: string | null) => {
              setKind(toggledValue || "all");
              setPage(1);
            },
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
        dateStorageKey={
          !externalDateRange
            ? isAdmin
              ? LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE
              : LOCAL_STORAGE_KEY_DATE_RANGE
            : undefined
        }
      />

      <ViewModeToggleComponent
        mode={viewMode}
        onChange={setViewMode}
        modes={[
          { key: VIEW_MODES.GRID, icon: Grid, title: "Grid view" },
          { key: VIEW_MODES.LIST, icon: List, title: "List view" },
        ]}
      />
    </FilterBarComponent>
  );

  const resultsView = (
    <>
      {loading && <LoadingMessage message="Loading artifacts..." />}

      {!loading && viewMode === VIEW_MODES.GRID && (
        <div className={styles['artifacts-grid']}>
          {artifacts.map((artifact) => {
            const convId = conversationRef(artifact);
            return (
              <div key={artifact.id} className={styles['card']}>
                <div className={styles['card-preview']}>
                  <ArtifactPreview
                    artifact={artifact}
                    onImageClick={(imageUrl) => setLightboxSrc(imageUrl)}
                  />
                </div>
                <div className={styles['card-footer']}>
                  <Link
                    href={`/artifacts/${encodeURIComponent(artifact.id)}`}
                    className={styles['card-title']}
                    title={artifact.title}
                  >
                    <ArtifactKindIcon kind={artifact.kind} />
                    <span>{artifact.title}</span>
                  </Link>
                  <div className={styles['card-meta']}>
                    <span>
                      {artifact.updatedAt
                        ? new Date(artifact.updatedAt).toLocaleDateString()
                        : ""}
                      {artifact.version > 1 && ` · v${artifact.version}`}
                    </span>
                    {convId && (
                      <Link
                        href={`${CONVERSATION_BASE_PATH}/${convId}`}
                        className={styles['conversation-link']}
                        title="Open source conversation"
                      >
                        <ExternalLink size={10} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && viewMode === VIEW_MODES.LIST && (
        <div className={styles['list-wrapper']}>
          <TableComponent
            columns={listColumns}
            data={artifacts}
            getRowKey={(row: ArtifactItem) => row.id}
          />
        </div>
      )}

      {!loading && artifacts.length === 0 && (
        <EmptyMessage message="No artifacts yet — ask the agent to create a document, image, or diagram." />
      )}

      <PaginationComponent
        page={page}
        totalPages={totalPages}
        totalItems={total}
        onPageChange={setPage}
      />
    </>
  );

  return (
    <>
      {!isAdmin ? (
        <div className={`artifacts-page-component ${styles['container']}`}>
          <PageHeroComponent
            icon={Package}
            title="Artifacts"
            subtitle="Everything the agent has made — documents, images, embeds, video, and audio."
            stats={[{ value: total, label: "artifacts" }]}
          />
          <div className={styles['content']}>
            {searchControl}
            {filterBar}
            {resultsView}
          </div>
        </div>
      ) : (
        <div className={styles['admin-content']}>
          {searchControl}
          {filterBar}
          {resultsView}
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
