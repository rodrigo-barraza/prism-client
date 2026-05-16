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
  // @ts-ignore
  // @ts-ignore
  href: any,
  // @ts-ignore
  icon: Icon,
  // @ts-ignore
  // @ts-ignore
  count: any,
  // @ts-ignore
  // @ts-ignore
  label: any,
  // @ts-ignore
  // @ts-ignore
  onClick: any,
}) {
  return (
    <Link
      // @ts-ignore
      href={href}
      className={styles.card}
      // @ts-ignore
      // @ts-ignore
      {...SoundService.interactive((e: any) => { onClick?.(e); })}
    >
      <Icon size={18} className={styles.icon} />
      {/* @ts-ignore */}
      <span className={styles.count}>{count}</span>
      {/* @ts-ignore */}
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
