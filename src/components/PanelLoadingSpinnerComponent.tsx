import styles from "./PanelLoadingSpinnerComponent.module.css";

interface PanelLoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  inline?: boolean;
}

export default function PanelLoadingSpinner({
  size = "medium",
  inline = false,
}: PanelLoadingSpinnerProps = {}) {
  const sizeClassName = styles[`spinner-size-${size}`];

  const orbitalGroup = (
    <div className={`${styles["spinner-orbit-group"]} ${sizeClassName}`}>
      <div
        className={`${styles["spinner-ring"]} ${styles["spinner-ring-outer"]}`}
      />
      <div
        className={`${styles["spinner-ring"]} ${styles["spinner-ring-middle"]}`}
      />
      <div className={styles["spinner-core-dot"]} />
    </div>
  );

  if (inline) {
    return (
      <span
        className={styles["spinner-inline-wrapper"]}
        role="status"
        aria-label="Loading"
      >
        {orbitalGroup}
      </span>
    );
  }

  return (
    <div
      className={`panel-loading-spinner-component ${styles["is-loading-state-spinner-container"]}`}
      role="status"
      aria-label="Loading"
    >
      {orbitalGroup}
    </div>
  );
}
