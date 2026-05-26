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

function resolveUrl(url: any) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("minio://")) return PrismService.getFileUrl(url);
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http")) return url;
  return url;
}

function MediaTypeIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color = (MODALITY_COLORS as Record<string, string>)[type] || MODALITY_COLORS.image;
  if (type === "audio") return <Music size={size} style={{ color }} />;
  if (type === "video") return <Film size={size} style={{ color }} />;
  if (type === "pdf") return <FileText size={size} style={{ color }} />;
  return <ImageIcon size={size} style={{ color }} />;
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <span
      className={`${styles.originBadge} ${origin === "ai" ? styles.originAi : styles.originUser}`}
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
  const mediaItem = media as any;

  const cardClasses = [
    styles.card,
    compact && styles.compact,
    !showInfo && styles.standalone,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      {showFavorite && (
        <button
          className={`${styles.favButton} ${isFavorite ? styles.favBtnActive : ""}`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onFavorite?.();
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}

      <div className={styles.preview}>
        {mediaItem.mediaType === "image" && resolvedUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolvedUrl}
            alt=""
            className={styles.previewImage}
            loading="lazy"
            onClick={() => onImageClick?.(resolvedUrl)}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              if (target.parentElement) {
                target.parentElement.classList.add(styles.placeholder);
                const icon = document.createElement("span");
                icon.textContent = "🖼";
                icon.style.fontSize = "32px";
                icon.style.opacity = "0.3";
                target.parentElement.appendChild(icon);
              }
            }}
          />
        ) : mediaItem.mediaType === "video" && resolvedUrl ? (
          <video
            src={resolvedUrl}
            className={styles.previewVideo}
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
        ) : mediaItem.mediaType === "audio" && resolvedUrl ? (
          <div
            className={styles.previewAudio}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <AudioPlayerRecorderComponent src={resolvedUrl} square />
          </div>
        ) : mediaItem.mediaType === "pdf" && resolvedUrl ? (
          <iframe
            src={resolvedUrl}
            className={styles.previewPdf}
            title="PDF preview"
          />
        ) : (
          <div className={styles.placeholder}>
            <MediaTypeIcon type={mediaItem.mediaType} />
            <span>{mediaItem.mediaType}</span>
          </div>
        )}

        {showOrigin && mediaItem.origin && <OriginBadge origin={mediaItem.origin} />}
      </div>

      {showInfo && (
        <div className={styles.info}>
          {mediaItem.convId && mediaItem.convTitle && (
            <Link
              href={`${convBasePath}/${mediaItem.convId}`}
              className={styles.convLink}
              title={mediaItem.convTitle}
            >
              <ExternalLink size={10} />
              <span>{mediaItem.convTitle}</span>
            </Link>
          )}
          <div className={styles.meta}>
            {mediaItem.model && (
              <BadgeComponent
                type="model"
                models={[mediaItem.model.split("/").pop() || ""]}
                provider={mediaItem.provider}
                mini
              />
            )}
            {mediaItem.timestamp && <BadgeComponent type="dateTime" date={mediaItem.timestamp} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Re-exports for consumers -- */
export { resolveUrl, MediaTypeIcon, OriginBadge };
