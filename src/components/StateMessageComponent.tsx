import { AlertCircle } from "lucide-react";
import { LoadingIndicatorComponent } from "@rodrigo-barraza/components-library";
import styles from "./StateMessageComponent.module.css";

interface LoadingMessageProps {
  message?: string | null;
}

export function LoadingMessage({
  message = "Loading...",
}: LoadingMessageProps) {
  return (
    <div className={styles.container}>
      <LoadingIndicatorComponent size="small" color="inherit" />
      <span>{message}</span>
    </div>
  );
}

interface EmptyMessageProps {
  message?: string | null;
}

export function EmptyMessage({
  message = "No records found.",
}: EmptyMessageProps) {
  return (
    <div className={styles.container}>
      <span>{message}</span>
    </div>
  );
}

interface ErrorMessageProps {
  message?: string | null;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div className={styles.errorBanner}>
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}
