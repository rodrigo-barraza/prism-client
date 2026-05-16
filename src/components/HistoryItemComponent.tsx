"use client";

import {
  Download,
  Copy,
  Star,
  Trash2,
  ExternalLink,
} from "lucide-react";

import ModalityIconComponent from "./ModalityIconComponent";
import { ModelToolsRow } from "./ToolBadgeComponent";

import styles from "./HistoryItemComponent.module.css";
import CostBadgeComponent from "./CostBadgeComponent";
import ModelBadgeComponent from "./ModelBadgeComponent";
import SoundService from "@/services/SoundService";
import { IconButtonComponent, DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";

/**
 * HistoryItemComponent — a single row within HistoryList or any list that
 * needs the same visual treatment (admin association lists, etc.).
 *
 * Props:
 *   item          — { id, title, subtitle, updatedAt, createdAt, totalCost,
 *                     modalities, modelName, tags[], username }
 *   isActive      — boolean, highlights the row
 *   onClick       — (item) => void
 *   onDelete      — (id) => void  (omit to hide)
 *   onDownload    — (id) => void  (omit to hide)
 *   onCopy        — (id) => void  (omit to hide)

 *   readOnly      — disables destructive actions
 *   admin         — shows username tag, hides delete
 *   isNew         — shows NEW badge
 *   isFavorite    — boolean
 *   onToggleFavorite — (id) => void (omit to hide star)
 *   className     — extra root class
 *   dataPanelClose — adds data-panel-close attr (for mobile drawer close)
 *   children      — optional extra content appended inside the row
 */
export default function HistoryItemComponent({
  // @ts-ignore
  // @ts-ignore
  item: any,
  isActive = false,
  // @ts-ignore
  // @ts-ignore
  onClick: any,
  // @ts-ignore
  // @ts-ignore
  onDelete: any,
  // @ts-ignore
  // @ts-ignore
  onDownload: any,
  // @ts-ignore
  // @ts-ignore
  onCopy: any,

  readOnly = false,
  admin = false,
  isNew = false,
  isFavorite = false,
  // @ts-ignore
  // @ts-ignore
  onToggleFavorite: any,
  // @ts-ignore
  // @ts-ignore
  className: any,
  dataPanelClose = false,
  // @ts-ignore
  // @ts-ignore
  onOpenInNewTab: any,
  isGenerating = false,
  // @ts-ignore
  // @ts-ignore
  children: any,
}) {
  // @ts-ignore
  // @ts-ignore
  const itemDate = item.updatedAt || item.createdAt;
  // @ts-ignore
  const mod = item.modalities || {};
  const hasModalities = mod && Object.keys(mod).length > 0;
  // @ts-ignore
  // @ts-ignore
  const hasModel = item.modelNames?.length > 0 || item.modelName;

  return (
    <div
      // @ts-ignore
      className={`${styles.item} ${isActive ? styles.active : ""} ${className || ""}`}
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      {...SoundService.interactive(() => onClick?.(item))}
      {...(dataPanelClose ? { "data-panel-close": true } : {})}
      // @ts-ignore
      onContextMenu={onOpenInNewTab ? (e) => {
        // Only show custom context on right-click of the main item area
        // (not on action buttons which have their own handlers)
        // @ts-ignore
        if (e.target.closest(`.${styles.actions}`)) return;
        e.preventDefault();
        // @ts-ignore
        // @ts-ignore
        onOpenInNewTab(item);
      } : undefined}
    >
      {/* @ts-ignore */}
      {onToggleFavorite && (
        <button
          className={`${styles.favBtn} ${isFavorite ? styles.favBtnActive : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            // @ts-ignore
            // @ts-ignore
            onToggleFavorite(item.id);
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
      <div className={styles.content}>
        {/* Row 1: time + tags (left) · cost (right) */}
        <div className={styles.topRow}>
          <div className={styles.topLeft}>
            <DateTimeBadgeComponent date={itemDate} />
            // @ts-ignore
            {/* @ts-ignore */}
            {admin && item.username && item.username !== "unknown" && (
              // @ts-ignore
              <span className={styles.usernameTag}>{item.username}</span>
            )}
            {/* @ts-ignore */}
            {item.tags?.map((tag: any) => (
              <span key={tag.label} className={styles.tag} style={tag.style}>
                {tag.label}
              </span>
            ))}
          </div>
          {/* @ts-ignore */}
          <CostBadgeComponent cost={item.totalCost} showIcon={false} />
        </div>

        {/* Row 2: title */}
        <div className={styles.title}>
          {isGenerating && <span className={styles.generatingDot} />}
          {/* @ts-ignore */}
          {item.title || "Untitled"}
          {isNew && <span className={styles.newBadge}>NEW</span>}
        </div>

        {/* Row 3: model badge */}
        {hasModel && (
          // @ts-ignore
          <ModelBadgeComponent
            // @ts-ignore
            // @ts-ignore
            // @ts-ignore
            models={item.modelNames?.length > 0 ? item.modelNames : [item.modelName]}
            // @ts-ignore
            providers={item.providers}
            className={styles.modelBadge}
          />
        )}

        {/* Row 4: modalities (left) · tools (right) */}
        {hasModalities && (
          <div className={styles.bottomRow}>
            {/* @ts-ignore */}
            <ModalityIconComponent modalities={mod} />
            {/* @ts-ignore */}
            <ModelToolsRow tools={mod} variant="condensed" />
          </div>
        )}

        {/* @ts-ignore */}
        {children}
      </div>
      {/* Actions */}
      <div className={styles.actions}>
        {/* @ts-ignore */}
        {onDownload && (
          <IconButtonComponent
            icon={<Download size={12} />}
            onClick={(e: any) => {
              e.stopPropagation();
              // @ts-ignore
              // @ts-ignore
              onDownload(item.id);
            }}
            tooltip="Download"
            hoverReveal
          />
        )}
        {/* @ts-ignore */}
        {onCopy && (
          <IconButtonComponent
            icon={<Copy size={12} />}
            onClick={(e: any) => {
              e.stopPropagation();
              // @ts-ignore
              // @ts-ignore
              onCopy(item.id);
            }}
            tooltip="Copy"
            hoverReveal
          />
        )}
        {/* @ts-ignore */}
        {!readOnly && !admin && onDelete && (
          <IconButtonComponent
            icon={<Trash2 size={12} />}
            onClick={(e: any) => {
              e.stopPropagation();
              // @ts-ignore
              // @ts-ignore
              onDelete(item.id);
            }}
            tooltip="Delete"
            variant="destructive"
            hoverReveal
          />
        )}
        {/* @ts-ignore */}
        {onOpenInNewTab && (
          <IconButtonComponent
            icon={<ExternalLink size={12} />}
            onClick={(e: any) => {
              e.stopPropagation();
              // @ts-ignore
              // @ts-ignore
              onOpenInNewTab(item);
            }}
            tooltip="Open in New Tab"
            hoverReveal
          />
        )}
      </div>
    </div>
  );
}
