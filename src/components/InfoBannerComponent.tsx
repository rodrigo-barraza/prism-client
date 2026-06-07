"use client";

import React from "react";
import { Info, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import styles from "./InfoBannerComponent.module.css";

type InfoBannerVariant = "info" | "warning" | "danger" | "success";

interface InfoBannerComponentProps {
  children: React.ReactNode;
  variant?: InfoBannerVariant;
  className?: string;
}

const VARIANT_ICON_MAP: Record<
  InfoBannerVariant,
  React.ComponentType<{ size?: number }>
> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
};

export default function InfoBannerComponent({
  children,
  variant = "info",
  className,
}: InfoBannerComponentProps) {
  const IconElement = VARIANT_ICON_MAP[variant];

  const containerClassName = [
    "info-banner-component",
    styles["info-banner-container"],
    styles[`is-variant-${variant}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName} role="status">
      <div className={styles["info-banner-icon-wrapper"]}>
        <IconElement size={14} />
      </div>
      <div className={styles["info-banner-text-content"]}>{children}</div>
    </div>
  );
}
