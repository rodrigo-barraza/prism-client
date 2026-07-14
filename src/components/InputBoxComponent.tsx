"use client";

import styles from "./InputBoxComponent.module.css";

interface InputBoxComponentProps
  extends React.FormHTMLAttributes<HTMLFormElement> {
  /** Render as a plain container or a form (chat input submits) */
  as?: "div" | "form";
  /** Animated prism border while the agent is generating */
  isGenerating?: boolean;
  /** Dashed accent border while a file drag is hovering */
  isDragActive?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * InputBoxComponent — the shared visual shell for chat-style inputs.
 * Provides the surface, border, focus ring, and prism "generating"
 * border used by the main chat input; reused by inline cards
 * (agent questions, approvals) so their inputs match the chat input.
 */
export default function InputBoxComponent({
  as: Tag = "div",
  isGenerating = false,
  isDragActive = false,
  className = "",
  children,
  ...props
}: InputBoxComponentProps) {
  const Element = Tag as React.ElementType;
  const classes = [
    "input-box-component",
    styles["input-box"],
    isDragActive ? styles["input-box-drag-is-active-state"] : "",
    isGenerating ? styles["input-box-generating"] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  );
}
