"use client";

import {
  Star,
  User,
  Sparkles,
  ExternalLink,
  Image as ImageIcon,
  Music,
  Film,
  FileText,
} from "lucide-react";
import Link from "next/link";
import PrismService from "../services/PrismService";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";

import BadgeComponent from "./BadgeComponent";
import { MODALITY_COLORS } from "./WorkflowNodeConstantsComponent";
import styles from "./MediaCardComponent.module.css";
import type { MediaItem } from "./MediaPageComponent";

/* -- Helpers -- */

function resolveUrl(url: string | undefined | null) {
  if (!url || typeof url !== "string") return null;
  return PrismService.getFileUrl(url);
}

function MediaTypeIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color =
    (MODALITY_COLORS as Record<string, string>)[type] || MODALITY_COLORS.image;
  if (type === "audio") return <Music size={size} style={{ color }} />;
  if (type === "video") return <Film size={size} style={{ color }} />;
  if (type === "pdf") return <FileText size={size} style={{ color }} />;
  return <ImageIcon size={size} style={{ color }} />;
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <span
      className={`${styles['origin-badge']} ${origin === "ai" ? styles['origin-ai'] : styles['origin-user']}`}
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

export interface MediaCardProps {
  media: MediaItem;
  convBasePath?: string;
  compact?: boolean;
  showInfo?: boolean;
  showOrigin?: boolean;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onFavorite?: () => void;
  onImageClick?: (url: string) => void;
}

/**
 * MediaCardComponent — a reusable card for rendering media previews.
 */
export default function MediaCardComponent({
  media,
  convBasePath = "/admin/chat",
  compact = false,
  showInfo = true,
  showOrigin = true,
  showFavorite = false,
  isFavorite = false,
  onFavorite,
  onImageClick,
}: MediaCardProps) {
  const resolvedUrl = resolveUrl(media.url);


  const cardClasses = [
    "media-card-component",
    styles['card'],
    compact && styles['compact'],
    !showInfo && styles['standalone'],
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      {showFavorite && (
        <button
          className={`${styles['favorite-button']} ${isFavorite ? styles['favorite-button-is-active-state'] : ""}`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onFavorite?.();
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}

      <div className={styles['preview']}>
        {media.mediaType === "image" && resolvedUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolvedUrl}
            alt=""
            className={styles['preview-image']}
            loading="lazy"
            onClick={() => onImageClick?.(resolvedUrl)}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              if (target.parentElement) {
                target.parentElement.classList.add(styles['placeholder']);
                const icon = document.createElement("span");
                icon.textContent = "🖼";
                icon.style.fontSize = "32px";
                icon.style.opacity = "0.3";
                target.parentElement.appendChild(icon);
              }
            }}
          />
        ) : media.mediaType === "video" && resolvedUrl ? (
          <video
            src={resolvedUrl}
            className={styles['preview-video']}
            muted
            preload="metadata"
            onMouseEnter={(e: React.MouseEvent<HTMLVideoElement>) => {
              const target = e.target as HTMLVideoElement;
              target.play().catch(() => {});
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLVideoElement>) => {
              const target = e.target as HTMLVideoElement;
              target.pause();
              target.currentTime = 0;
            }}
          />
        ) : media.mediaType === "audio" && resolvedUrl ? (
          <div
            className={styles['preview-audio']}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <AudioPlayerRecorderComponent sourceUrl={resolvedUrl} square />
          </div>
        ) : media.mediaType === "pdf" && resolvedUrl ? (
          <iframe
            src={resolvedUrl}
            className={styles['preview-pdf']}
            title="PDF preview"
          />
        ) : (
          <div className={styles['placeholder']}>
            <MediaTypeIcon type={media.mediaType} />
            <span>{media.mediaType}</span>
          </div>
        )}

        {showOrigin && media.origin && (
          <OriginBadge origin={media.origin} />
        )}
      </div>

      {showInfo && (
        <div className={styles['info']}>
          {media.convId && media.convTitle && (
            <Link
              href={`${convBasePath}/${media.convId}`}
              className={styles['conversation-link']}
              title={media.convTitle}
            >
              <ExternalLink size={10} />
              <span>{media.convTitle}</span>
            </Link>
          )}
          <div className={styles['meta']}>
            {media.model && (
              <BadgeComponent
                type="model"
                models={[media.model.split("/").pop() || ""]}
                provider={media.provider}
                mini
              />
            )}
            {media.timestamp && (
              <BadgeComponent type="dateTime" date={media.timestamp} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Re-exports for consumers -- */
export { resolveUrl, MediaTypeIcon, OriginBadge };
