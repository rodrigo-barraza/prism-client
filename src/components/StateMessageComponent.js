import { AlertCircle } from "lucide-react";
import { LoadingIndicatorComponent } from "@rodrigo-barraza/components-library";
import styles from "./StateMessageComponent.module.css";

export function LoadingMessage({ message = "Loading..." }) {
  return (
    <div className={styles.container}>
      <LoadingIndicatorComponent size="small" color="inherit" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyMessage({ message = "No records found." }) {
  return (
    <div className={styles.container}>
      <span>{message}</span>
    </div>
  );
}

export function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <div className={styles.errorBanner}>
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}
