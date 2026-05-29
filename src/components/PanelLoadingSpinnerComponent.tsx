import styles from "./PanelLoadingSpinnerComponent.module.css";

/**
 * PanelLoadingSpinner — consistent, visually premium loading indicator
 * used across all sidebar panel tabs. Renders concentric orbital rings
 * with a pulsing core dot. No text — purely visual.
 */
export default function PanelLoadingSpinner() {
  return (
    <div
      className={styles["loading-spinner-container"]}
      role="status"
      aria-label="Loading"
    >
      <div className={styles["spinner-orbit-group"]}>
        <div
          className={`${styles["spinner-ring"]} ${styles["spinner-ring-outer"]}`}
        />
        <div
          className={`${styles["spinner-ring"]} ${styles["spinner-ring-middle"]}`}
        />
        <div className={styles["spinner-core-dot"]} />
      </div>
    </div>
  );
}
