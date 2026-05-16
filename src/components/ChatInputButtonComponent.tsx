"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  Paperclip,
  Pencil,
  Image as ImageIcon,
  Volume2,
  Video,
  FileText,
  Send,
  Square,
} from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ChatInputButtonComponent.module.css";
import SoundService from "@/services/SoundService";

const TYPE_ICON_MAP = {
  paperclip: Paperclip,
  image: ImageIcon,
  audio: Volume2,
  video: Video,
  pdf: FileText,
};

// @ts-ignore
function RotatingUploadIcon({ types: any, size = 18 }) {
  // @ts-ignore
  const allTypes = ["paperclip", ...types];
  const [activeIndex, setActiveIndex] = useState<any>(0);
  const [isTransitioning, setIsTransitioning] = useState<any>(false);

  useEffect(() => {
    if (allTypes.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev: any) => (prev + 1) % allTypes.length);
        setIsTransitioning(false);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [allTypes.length]);

  if (allTypes.length === 1) {
    // @ts-ignore
    const Icon = TYPE_ICON_MAP[allTypes[0]] || Paperclip;
    return <Icon size={size} />;
  }

  const currentType = allTypes[activeIndex];
  const nextType = allTypes[(activeIndex + 1) % allTypes.length];
  // @ts-ignore
  const CurrentIcon = TYPE_ICON_MAP[currentType] || Paperclip;
  // @ts-ignore
  const NextIcon = TYPE_ICON_MAP[nextType] || Paperclip;

  return (
    <div className={styles.rotatingIconContainer}>
      <div
        className={`${styles.rotatingIconTrack} ${isTransitioning ? styles.rotatingIconSlide : ""}`}
      >
        <span className={styles.rotatingIconItem}>
          <CurrentIcon size={size} />
        </span>
        <span className={styles.rotatingIconItem}>
          <NextIcon size={size} />
        </span>
      </div>
    </div>
  );
}

const ICON_MAP = {
  wrench: Wrench,
  pencil: Pencil,
  paperclip: Paperclip,
};

/**
 * Unified input button for the ChatArea input row.
 *
 * @param {"button"|"submit"} [variant="button"] — "submit" renders the accent-colored send/stop button.
 * @param {boolean} [isGenerating] — When variant="submit", shows the stop icon with a conic-gradient spinner.
 */
export default function ChatInputButton({
  // @ts-ignore
  // @ts-ignore
  icon: any,
  // @ts-ignore
  // @ts-ignore
  uploadTypes: any,
  // @ts-ignore
  // @ts-ignore
  onClick: any,
  // @ts-ignore
  // @ts-ignore
  label: any,
  isActive = false,
  disabled = false,
  className = "",
  tooltipPosition = "top",
  variant = "button",
  isGenerating = false,
  ...props
}) {
  const isSubmit = variant === "submit";

  const classes = [
    styles.chatInputBtn,
    isActive ? styles.active : "",
    isSubmit ? styles.submit : "",
    isSubmit && isGenerating ? styles.submitGenerating : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  let IconElement = null;
  if (isSubmit) {
    IconElement = isGenerating ? (
      <Square size={14} fill="currentColor" />
    ) : (
      <Send size={18} />
    );
  // @ts-ignore
  // @ts-ignore
  } else if (icon === "upload" && uploadTypes) {
    // @ts-ignore
    IconElement = <RotatingUploadIcon types={uploadTypes} size={18} />;
  // @ts-ignore
  } else if (typeof icon === "string") {
    // @ts-ignore
    // @ts-ignore
    const Comp = ICON_MAP[icon];
    if (Comp) IconElement = <Comp size={18} />;
  } else {
    // @ts-ignore
    IconElement = icon;
  }

  const button = (
    <button
      type={isSubmit ? "submit" : "button"}
      className={classes}
      // @ts-ignore
      onClick={(e) => { SoundService.playClickButton({ event: e }); onClick?.(e); }}
      onMouseEnter={(e) => SoundService.playHoverButton({ event: e })}
      disabled={disabled}
      // @ts-ignore
      aria-label={label}
      {...props}
    >
      {IconElement}
    </button>
  );

  // Submit variant doesn't need a tooltip (the action is self-evident)
  if (isSubmit) return button;

  return (
    // @ts-ignore
    <TooltipComponent label={label} position={tooltipPosition} trigger="hover">
      {button}
    </TooltipComponent>
  );
}
