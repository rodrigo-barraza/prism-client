// @ts-nocheck
"use client";

import ErrorFallbackComponent from "@rodrigo-barraza/components-library/src/components/ErrorFallbackComponent/ErrorFallbackComponent";

/**
 * Error boundary — catches unhandled client-side errors in route segments
 * and renders a recovery UI instead of a blank screen.
 */
export default function Error({ error, reset }: any) {
  return (
    <ErrorFallbackComponent error={error} reset={reset} logLabel="[Prism]" />
  );
}
