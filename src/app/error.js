"use client";

import { useEffect } from "react";

/**
 * Error boundary — catches unhandled client-side errors in route segments
 * and renders a recovery UI instead of a blank screen.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("[Prism] Unhandled error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "16px",
        padding: "32px",
        color: "var(--text-primary, #fff)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ fontSize: "48px", lineHeight: 1, opacity: 0.4 }}>⚠</div>
      <h2
        style={{
          fontSize: "18px",
          fontWeight: 600,
          margin: 0,
          letterSpacing: "-0.02em",
        }}
      >
        This page couldn&apos;t load
      </h2>
      <p
        style={{
          fontSize: "13px",
          color: "var(--text-muted, #999)",
          margin: 0,
          textAlign: "center",
          maxWidth: "400px",
        }}
      >
        {error?.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: "8px",
          padding: "8px 20px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--text-primary, #fff)",
          background: "var(--bg-surface, rgba(255,255,255,0.06))",
          border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          e.target.style.borderColor = "var(--accent-color, #6366f1)";
        }}
        onMouseLeave={(e) => {
          e.target.style.borderColor =
            "var(--border-color, rgba(255,255,255,0.08))";
        }}
      >
        Try Again
      </button>
    </div>
  );
}
