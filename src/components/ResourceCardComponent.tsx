"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import SoundService from "@/services/SoundService";
import styles from "./ResourceCardComponent.module.css";

interface ResourceCardProps {
  href: string;
  icon: LucideIcon;
  count: string | number;
  label: string;
  onClick?: (event: React.SyntheticEvent) => void;
}

export default function ResourceCardComponent({
  href,
  icon: Icon,
  count,
  label,
  onClick,
}: ResourceCardProps) {
  return (
    <Link
      href={href}
      className={`resource-card-component ${styles['card']}`}
      {...SoundService.interactive((e: React.SyntheticEvent) => {
        onClick?.(e);
      })}
    >
      <Icon size={18} className={styles['icon']} />
      <span className={styles['count']}>{count}</span>
      <span className={styles['label']}>{label}</span>
    </Link>
  );
}
