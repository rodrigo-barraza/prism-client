// ============================================================
// Prism Client — Runtime Configuration
// ============================================================
// Typed accessor layer over process.env. The Vault service is
// the single source of truth — next.config.ts hydrates
// process.env from the Vault before any module imports run.
//
// This file contains NO defaults, NO secrets, and NO hardcoded
// URLs. All public domain URLs come from the vault registry
// (projects.json → PRISM_SERVICE_PUBLIC_URL, PRISM_WS_PUBLIC_URL).
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

const IS_BROWSER = typeof window !== "undefined";

// Environment-aware project name — isolates data between dev and prod
export const IS_PRODUCTION =
  IS_BROWSER && window.location.hostname.endsWith(".dev");
export const IS_LOCALHOST = !IS_PRODUCTION;

// Environment-aware project name — isolates data between dev and prod
export const PROJECT_NAME = IS_PRODUCTION ? "prism-client" : "prism-client-dev";

// -- Raw values from process.env --------------------------------
const RAW_PRISM_URL =
  process.env.NEXT_PUBLIC_PRISM_SERVICE_URL || process.env.PRISM_SERVICE_URL;
const RAW_WS_URL =
  process.env.NEXT_PUBLIC_PRISM_WS_URL || process.env.PRISM_WS_URL;
const RAW_TOOLS_URL =
  process.env.NEXT_PUBLIC_TOOLS_SERVICE_URL || process.env.TOOLS_SERVICE_URL;

// -- Public URLs from vault (browser production overrides) ------
const PUBLIC_PRISM_URL =
  process.env.NEXT_PUBLIC_PRISM_SERVICE_PUBLIC_URL ||
  process.env.PRISM_SERVICE_PUBLIC_URL;
const PUBLIC_WS_URL =
  process.env.NEXT_PUBLIC_PRISM_WS_PUBLIC_URL ||
  process.env.PRISM_WS_PUBLIC_URL;

// -- Prism Service URL ------------------------------------------
function resolvePrismUrl() {
  if (!IS_BROWSER) return RAW_PRISM_URL;
  if (IS_PRODUCTION && PUBLIC_PRISM_URL) return PUBLIC_PRISM_URL;
  return RAW_PRISM_URL;
}

export const PRISM_SERVICE_URL = resolvePrismUrl();

// -- Prism WebSocket URL ----------------------------------------
function resolveWsUrl() {
  if (!IS_BROWSER) return RAW_WS_URL;
  if (IS_PRODUCTION && PUBLIC_WS_URL) return PUBLIC_WS_URL;
  return RAW_WS_URL;
}

export const PRISM_WS_URL = resolveWsUrl();

// -- Tools Service URL ------------------------------------------
// Browser (all environments): proxied through Next.js rewrites at
// /api/tools → TOOLS_SERVICE_URL. Tools-service is internal-only
// (no public hostname), so the browser must NEVER call it directly.
// Server-side: vault value (LAN IP).
export const TOOLS_SERVICE_URL = IS_BROWSER ? "/api/tools" : RAW_TOOLS_URL;

// -- MinIO File Storage -----------------------------------------
// MINIO_PUBLIC_URL is the root (e.g. https://storage.rod.dev).
// Append the bucket name so file refs resolve to the correct path:
//   https://storage.rod.dev/prism/{object-key}
const MINIO_ROOT =
  process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL || process.env.MINIO_PUBLIC_URL;
const MINIO_BUCKET =
  process.env.NEXT_PUBLIC_PRISM_SERVICE_MINIO_BUCKET_NAME ||
  process.env.PRISM_SERVICE_MINIO_BUCKET_NAME;
export const MINIO_URL =
  MINIO_ROOT && MINIO_BUCKET ? `${MINIO_ROOT}/${MINIO_BUCKET}` : null;

export const CUSTOM_MODEL_NAME =
  process.env.NEXT_PUBLIC_CUSTOM_MODEL_NAME ||
  process.env.CUSTOM_MODEL_NAME ||
  "";

// -- Accounts Service URL ---------------------------------------
// Used for authentication (login, signup). Server-side only when
// possible; the login page signup form also needs it client-side.
export const ACCOUNTS_SERVICE_URL =
  process.env.NEXT_PUBLIC_ACCOUNTS_SERVICE_URL ||
  process.env.ACCOUNTS_SERVICE_URL;

