"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary — catches errors in the root layout itself.
 * Must include its own <html> and <body> since the root layout has failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Prism] Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "16px",
            padding: "32px",
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
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "#999",
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
              color: "#e5e5e5",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
