// ============================================================
// Prism Client — Runtime Configuration
// ============================================================
// Typed accessor layer over process.env. The Vault service is
// the single source of truth — next.config.mjs hydrates
// process.env from the Vault before any module imports run.
//
// This file contains NO defaults, NO secrets, and NO hardcoded
// URLs. All public domain URLs come from the vault registry
// (services.json → PRISM_SERVICE_PUBLIC_URL, PRISM_WS_PUBLIC_URL).
//
// Browser requests must NEVER hit localhost or LAN IPs when loaded
// from a public domain — that triggers Chrome's Private Network
// Access (PNA) prompt.
//
// Strategy:
//   Production (*.rod.dev):
//     • PRISM_SERVICE_URL  → PRISM_SERVICE_PUBLIC_URL from vault
//     • PRISM_WS_URL       → PRISM_WS_PUBLIC_URL from vault
//     • TOOLS_SERVICE_URL  → /api/tools — Next.js rewrite proxy (internal service)
//
//   Local dev (localhost):
//     • PRISM_SERVICE_URL  → vault value (LAN IP or localhost — same network)
//     • PRISM_WS_URL       → vault value
//     • TOOLS_SERVICE_URL  → /api/tools — Next.js rewrite proxy (avoids CORS)
//
//   Server-side (SSR):
//     • All URLs use full values from vault (LAN IPs for Docker)
// ============================================================

export const PORT = process.env.PRISM_CLIENT_PORT;

const IS_BROWSER = typeof window !== "undefined";

// Environment-aware project name — isolates data between dev and prod
export const IS_PRODUCTION = IS_BROWSER && window.location.hostname.endsWith(".dev");
export const IS_LOCALHOST = !IS_PRODUCTION;

// Environment-aware project name — isolates data between dev and prod
export const PROJECT_NAME = IS_PRODUCTION ? "prism-client" : "prism-client-dev";

// ── Raw values from process.env ────────────────────────────────
const RAW_PRISM_URL = process.env.PRISM_SERVICE_URL;
const RAW_WS_URL = process.env.PRISM_WS_URL;
const RAW_TOOLS_URL = process.env.TOOLS_SERVICE_URL;

// ── Public URLs from vault (browser production overrides) ──────
const PUBLIC_PRISM_URL = process.env.PRISM_SERVICE_PUBLIC_URL;
const PUBLIC_WS_URL = process.env.PRISM_WS_PUBLIC_URL;

// ── Prism Service URL ──────────────────────────────────────────
function resolvePrismUrl() {
  if (!IS_BROWSER) return RAW_PRISM_URL;
  if (IS_PRODUCTION && PUBLIC_PRISM_URL) return PUBLIC_PRISM_URL;
  return RAW_PRISM_URL;
}

export const PRISM_SERVICE_URL = resolvePrismUrl();

// ── Prism WebSocket URL ────────────────────────────────────────
function resolveWsUrl() {
  if (!IS_BROWSER) return RAW_WS_URL;
  if (IS_PRODUCTION && PUBLIC_WS_URL) return PUBLIC_WS_URL;
  return RAW_WS_URL;
}

export const PRISM_WS_URL = resolveWsUrl();

// ── Tools Service URL ──────────────────────────────────────────
// Browser (all environments): proxied through Next.js rewrites at
// /api/tools → TOOLS_SERVICE_URL. Tools-service is internal-only
// (no public hostname), so the browser must NEVER call it directly.
// Server-side: vault value (LAN IP).
export const TOOLS_SERVICE_URL = IS_BROWSER ? "/api/tools" : RAW_TOOLS_URL;

// MinIO file storage (public bucket URL via storage.rod.dev)
export const MINIO_URL = process.env.MINIO_PUBLIC_URL;
