// @ts-nocheck
"use client";

import Link from "next/link";
import SoundService from "@/services/SoundService";
import styles from "./ResourceCardComponent.module.css";

/**
 * ResourceCardComponent — a navigable stats card showing an icon, count, and
 * label. Used in dashboards for quick resource navigation.
 *
 * Props:
 *   href       — Link destination (uses Next.js Link)
 *   icon       — Lucide icon component (e.g. Box, Server, …)
 *   count      — Formatted count string to display
 *   label      — Text label beneath the count
 *   onClick    — Optional click handler (e.g. for scroll-to targets)
 */
export default function ResourceCardComponent({
  href,
  icon: Icon,
  count,
  label,
  onClick,
}: any) {
  return (
    <Link
      href={href}
      className={styles.card}
      {...SoundService.interactive((e: any) => { onClick?.(e); })}
    >
      <Icon size={18} className={styles.icon} />
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
