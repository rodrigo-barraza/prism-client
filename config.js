// ============================================================
// Prism Client — Runtime Configuration
// ============================================================
// Resolves service URLs for both server-side (Next.js SSR/API routes)
// and client-side (browser) contexts.
//
// Browser requests must NEVER hit localhost or LAN IPs when loaded
// from a public domain — that triggers Chrome's Private Network
// Access (PNA) prompt.
//
// Strategy:
//   Production (*.rod.dev):
//     • PRISM_SERVICE_URL  → https://api.prism.rod.dev (public API domain)
//     • PRISM_WS_URL       → wss://api.prism.rod.dev
//     • TOOLS_SERVICE_URL  → /api/tools — Next.js rewrite proxy (internal service)
//
//   Local dev (localhost):
//     • PRISM_SERVICE_URL  → vault/env value (LAN IP or localhost — same network)
//     • PRISM_WS_URL       → vault/env value
//     • TOOLS_SERVICE_URL  → /api/tools — Next.js rewrite proxy (avoids CORS)
//
//   Server-side (SSR):
//     • All URLs use full values from vault/secrets (LAN IPs for Docker)
// ============================================================

import {
  PRISM_CLIENT_PORT as SECRETS_PORT,
  PRISM_SERVICE_URL as RAW_PRISM_URL,
  PRISM_WS_URL as RAW_WS_URL,
  TOOLS_SERVICE_URL as RAW_TOOLS_URL,
  MINIO_PUBLIC_URL,
} from "./secrets.js";

export const PORT = SECRETS_PORT || 3333;

const IS_BROWSER = typeof window !== "undefined";

// Environment-aware project name — isolates data between dev and prod
export const IS_PRODUCTION = IS_BROWSER && window.location.hostname.endsWith(".dev");
export const IS_LOCALHOST = !IS_PRODUCTION;

// Legacy: kept as "retina-web"/"retina" for MongoDB data compatibility (conversations, requests, etc.)
export const PROJECT_NAME = IS_PRODUCTION ? "retina-web" : "retina";

// ── Prism Service URL ──────────────────────────────────────────
// Production browser: public API domain (reverse-proxied to prism-service).
// Local dev browser: vault/env value (LAN IP or localhost — same network, no PNA).
// Server-side: vault/env value (LAN IP for Docker container-to-container calls).
function resolvePrismUrl() {
  if (!IS_BROWSER) return RAW_PRISM_URL;
  if (IS_PRODUCTION) return "https://api.prism.rod.dev";
  return RAW_PRISM_URL;
}

export const PRISM_SERVICE_URL = resolvePrismUrl();

// ── Prism WebSocket URL ────────────────────────────────────────
// Production browser: public domain with wss:// for TLS.
// Local dev browser: vault/env value.
// Server-side: vault/env value.
function resolveWsUrl() {
  if (!IS_BROWSER) return RAW_WS_URL;
  if (IS_PRODUCTION) return "wss://api.prism.rod.dev";
  return RAW_WS_URL;
}

export const PRISM_WS_URL = resolveWsUrl();

// ── Tools Service URL ──────────────────────────────────────────
// Browser (all environments): proxied through Next.js rewrites at
// /api/tools → TOOLS_SERVICE_URL. Tools-service is internal-only
// (no public hostname), so the browser must NEVER call it directly.
// Server-side: vault/env value (LAN IP).
export const TOOLS_SERVICE_URL = IS_BROWSER ? "/api/tools" : RAW_TOOLS_URL;

// MinIO file storage (direct bucket URL)
export const MINIO_URL = MINIO_PUBLIC_URL;
