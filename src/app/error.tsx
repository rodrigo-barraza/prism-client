"use client";

// @ts-ignore
import ErrorFallbackComponent from "@rodrigo-barraza/components-library/src/components/ErrorFallbackComponent/ErrorFallbackComponent";

/**
 * Error boundary — catches unhandled client-side errors in route segments
 * and renders a recovery UI instead of a blank screen.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function Error({ error: any, reset: any }) {
  return (
    // @ts-ignore
    // @ts-ignore
    <ErrorFallbackComponent error={error} reset={reset} logLabel="[Prism]" />
  );
}
