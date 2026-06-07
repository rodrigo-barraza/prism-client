"use client";

import Link from "next/link";
import styles from "./TableComponentsComponent.module.css";

/**
 * CountLinkComponent — renders a count as a navigable link with an icon,
 * or a muted "0" when the count is zero. Replaces 6 identical inline
 * renderers in the admin dashboard tables.
 */
export default function CountLinkComponent({
  count,
  href,
  icon: Icon,
  className,
}: {
  count?: number;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  className?: string;
}) {
  if (!count || count <= 0) {
    return <span className={styles['count-link-zero']}>0</span>;
  }

  return (
    <Link href={href} className={`count-link-component ${className || styles['count-link']}`}>
      <Icon size={12} />
      {count}
    </Link>
  );
}
