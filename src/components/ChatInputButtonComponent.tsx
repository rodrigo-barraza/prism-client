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
  FileSpreadsheet,
  Send,
  Square,
} from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ChatInputButtonComponent.module.css";
import SoundService from "@/services/SoundService";

type UploadType = keyof typeof TYPE_ICON_MAP;
type IconName = keyof typeof ICON_MAP;

const TYPE_ICON_MAP = {
  paperclip: Paperclip,
  image: ImageIcon,
  audio: Volume2,
  video: Video,
  pdf: FileText,
  document: FileSpreadsheet,
};

interface RotatingUploadIconProps {
  types: UploadType[];
  size?: number;
}

function RotatingUploadIcon({ types, size = 18 }: RotatingUploadIconProps) {
  const allTypes = ["paperclip", ...types];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (allTypes.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((previousIndex) => (previousIndex + 1) % allTypes.length);
        setIsTransitioning(false);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [allTypes.length]);

  if (allTypes.length === 1) {
    const Icon = TYPE_ICON_MAP[allTypes[0] as UploadType] || Paperclip;
    return <Icon size={size} />;
  }

  const currentType = allTypes[activeIndex];
  const nextType = allTypes[(activeIndex + 1) % allTypes.length];
  const CurrentIcon = TYPE_ICON_MAP[currentType as UploadType] || Paperclip;
  const NextIcon = TYPE_ICON_MAP[nextType as UploadType] || Paperclip;

  return (
    <div className={styles['rotating-icon-container']}>
      <div
        className={`${styles['rotating-icon-track']} ${isTransitioning ? styles['rotating-icon-slide'] : ""}`}
      >
        <span className={styles['rotating-icon-item']}>
          <CurrentIcon size={size} />
        </span>
        <span className={styles['rotating-icon-item']}>
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
 */
interface ChatInputButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName | "upload" | React.ReactNode;
  uploadTypes?: UploadType[];
  onClick?: (e: React.MouseEvent) => void;
  label?: string;
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
  tooltipPosition?: string;
  variant?: "button" | "submit";
  isGenerating?: boolean;
}

export default function ChatInputButton({
  icon,
  uploadTypes,
  onClick,
  label,
  isActive = false,
  disabled = false,
  className = "",
  tooltipPosition = "top",
  variant = "button",
  isGenerating = false,
  ...props
}: ChatInputButtonProps) {
  const isSubmit = variant === "submit";

  const classes = [
    "chat-input-button-component",
    styles['chat-input-button'],
    isActive ? styles['is-active-state'] : "",
    isSubmit ? styles['submit'] : "",
    isSubmit && isGenerating ? styles['submit-generating'] : "",
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
  } else if (icon === "upload" && uploadTypes) {
    IconElement = <RotatingUploadIcon types={uploadTypes} size={18} />;
  } else if (typeof icon === "string") {
    const Comp =
      typeof icon === "string" && icon in ICON_MAP
        ? ICON_MAP[icon as IconName]
        : null;
    if (Comp) IconElement = <Comp size={18} />;
  } else {
    IconElement = icon;
  }

  const button = (
    <button
      type={isSubmit ? "submit" : "button"}
      className={classes}
      onClick={(e: React.MouseEvent) => {
        SoundService.playClickButton({ event: e.nativeEvent });
        onClick?.(e);
      }}
      onMouseEnter={(e: React.MouseEvent) =>
        SoundService.playHoverButton({ event: e.nativeEvent })
      }
      disabled={disabled}
      aria-label={label}
      {...props}
    >
      {IconElement}
    </button>
  );

  // Submit variant doesn't need a tooltip (the action is self-evident)
  if (isSubmit) return button;

  return (
    <TooltipComponent label={label} position={tooltipPosition} trigger="hover">
      {button}
    </TooltipComponent>
  );
}
