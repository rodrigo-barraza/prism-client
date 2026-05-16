import { LetterText } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./WordBadgeComponent.module.css";

/**
 * WordBadgeComponent — displays a word count badge with an icon.
 *
 * @param {number} count — word count
 * @param {string} [className]
 * @param {boolean} [mini]
 */
export default function WordBadgeComponent({
  // @ts-ignore
  count: any,
  className = "",
  mini = false,
}) {
  // @ts-ignore
  // @ts-ignore
  if (!count || count <= 0) return null;

  // @ts-ignore
  const suffix = count !== 1 ? "words" : "word";
  // @ts-ignore
  const tooltipLabel = `${count.toLocaleString()} ${suffix}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${styles.badge} ${mini ? styles.mini : ""} ${className}`}
      >
        <LetterText size={mini ? 8 : 10} />
        {/* @ts-ignore */}
        {count.toLocaleString()} {suffix}
      </span>
    </TooltipComponent>
  );
}
