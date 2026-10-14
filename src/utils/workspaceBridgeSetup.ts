import { SERVICE_PORTS } from "@rodrigo-barraza/utilities-library/taxonomy";

/**
 * The WORKSPACE_BACKEND the workspace setup guide shows. On a public domain a
 * bridge dials tools-service's own public domain over wss: the page's host
 * forwards no tools-service port, so `ws://prism.rod.dev:5590` is refused. On
 * the LAN or in dev, tools-service shares the page's host, so the visitor's
 * hostname is the right address.
 */
export function workspaceBackendExample({
  hostname,
  isPublicDomain,
  toolsServicePublicUrl,
}: {
  hostname: string;
  isPublicDomain: boolean;
  toolsServicePublicUrl?: string;
}): string {
  if (isPublicDomain && toolsServicePublicUrl) {
    return toolsServicePublicUrl.replace(/^http/, "ws").replace(/\/+$/, "");
  }
  return `ws://${hostname}:${SERVICE_PORTS["tools-service"]}`;
}

/**
 * The `.env` that workspace-service's `npm run dev:local` sources. It reads
 * nothing else (no vault), so the secret has to be in it: without one,
 * tools-service answers 401 and the bridge stops retrying.
 */
export function workspaceEnvFileExample(backend: string, workspaceRoots: string): string {
  return [
    `WORKSPACE_BACKEND=${backend}`,
    `WORKSPACE_ROOTS=${workspaceRoots}`,
    "WORKSPACE_SERVICE_SECRET=YOUR_API_SECRET",
  ].join("\n");
}
