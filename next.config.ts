// ============================================================
// Prism Client — Next.js Configuration
// ============================================================
// Bootstraps secrets from Vault at startup
// and injects them into process.env for the app.
// ============================================================

import { createVaultClient } from "@rodrigo-barraza/utilities-library/node";
import type { NextConfig } from "next";

// ── Bootstrap secrets at build/dev time ────────────────────────
const vault = createVaultClient();

const secrets = vault.fetchSync();

// Inject into process.env so secrets.js can read them
Object.assign(process.env, secrets);

// Resolved tools-service URL (server-side). Tools-service is internal (no
// public hostname) — the browser calls /api/tools/*, a signed-in route
// handler (src/app/api/tools) that forwards here with the service secret.
const TOOLS_SERVICE_URL =
  process.env.TOOLS_SERVICE_URL ||
  secrets.TOOLS_SERVICE_URL ||
  "http://localhost:1234";

if (!TOOLS_SERVICE_URL) {
  // throw new Error(
  //   "TOOLS_SERVICE_URL is not set — Vault may be unreachable from the Docker build context. " +
  //   "Ensure --network=host is set and the Vault service is running at " +
  //   (secrets.VAULT_SERVICE_URL || process.env.VAULT_SERVICE_URL || "http://localhost:5599")
  // );
}

// Resolved client domain for allowedDevOrigins (from vault).
const PRISM_CLIENT_DOMAIN = secrets.PRISM_CLIENT_DOMAIN;

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: PRISM_CLIENT_DOMAIN ? [PRISM_CLIENT_DOMAIN] : undefined,
  turbopack: {},

  // Type errors fail the build (`tsc` is clean since the strict-mode
  // migration finished).
  typescript: {
    ignoreBuildErrors: false,
  },

  transpilePackages: [
    "@rodrigo-barraza/components-library",
    "@rodrigo-barraza/utilities-library",
  ],

  // Expose resolved values to both server and client bundles.
  // config.ts applies environment-aware overrides for browser contexts
  // (e.g. public domain for prism-service, proxy path for tools-service).
  env: {
    // ── Sessions ──────────────────────────────────────────────
    SESSIONS_SERVICE_URL: secrets.SESSIONS_SERVICE_URL,
    SESSIONS_SERVICE_PUBLIC_URL: secrets.SESSIONS_SERVICE_PUBLIC_URL,
    PRISM_CLIENT_PORT: secrets.PRISM_CLIENT_PORT,
    PRISM_CLIENT_DOMAIN: PRISM_CLIENT_DOMAIN,
    PRISM_SERVICE_URL: secrets.PRISM_SERVICE_URL,
    PRISM_SERVICE_PUBLIC_URL: secrets.PRISM_SERVICE_PUBLIC_URL,
    PRISM_WS_URL: secrets.PRISM_WS_URL,
    PRISM_WS_PUBLIC_URL: secrets.PRISM_WS_PUBLIC_URL,
    PRISM_WEBSOCKET_URL: secrets.PRISM_WS_URL || secrets.PRISM_WEBSOCKET_URL,
    PRISM_WEBSOCKET_PUBLIC_URL: secrets.PRISM_WS_PUBLIC_URL || secrets.PRISM_WEBSOCKET_PUBLIC_URL,
    TOOLS_SERVICE_URL: TOOLS_SERVICE_URL,
    MINIO_PUBLIC_URL: secrets.MINIO_PUBLIC_URL,
    PRISM_SERVICE_MINIO_BUCKET_NAME: secrets.PRISM_SERVICE_MINIO_BUCKET_NAME,
    ACCOUNTS_SERVICE_URL: secrets.ACCOUNTS_SERVICE_URL,
    CUSTOM_MODEL_NAME: process.env.CUSTOM_MODEL_NAME || secrets.CUSTOM_MODEL_NAME || "",

    // Explicit NEXT_PUBLIC_ variables for Turbopack client-side injection
    NEXT_PUBLIC_PRISM_CLIENT_DOMAIN: PRISM_CLIENT_DOMAIN,
    NEXT_PUBLIC_PRISM_SERVICE_URL: secrets.PRISM_SERVICE_URL,
    NEXT_PUBLIC_PRISM_SERVICE_PUBLIC_URL: secrets.PRISM_SERVICE_PUBLIC_URL,
    NEXT_PUBLIC_PRISM_WS_URL: secrets.PRISM_WS_URL,
    NEXT_PUBLIC_PRISM_WS_PUBLIC_URL: secrets.PRISM_WS_PUBLIC_URL,
    NEXT_PUBLIC_PRISM_WEBSOCKET_URL: secrets.PRISM_WS_URL || secrets.PRISM_WEBSOCKET_URL,
    NEXT_PUBLIC_PRISM_WEBSOCKET_PUBLIC_URL: secrets.PRISM_WS_PUBLIC_URL || secrets.PRISM_WEBSOCKET_PUBLIC_URL,
    NEXT_PUBLIC_TOOLS_SERVICE_URL: TOOLS_SERVICE_URL,
    NEXT_PUBLIC_MINIO_PUBLIC_URL: secrets.MINIO_PUBLIC_URL,
    NEXT_PUBLIC_PRISM_SERVICE_MINIO_BUCKET_NAME:
      secrets.PRISM_SERVICE_MINIO_BUCKET_NAME,
    NEXT_PUBLIC_ACCOUNTS_SERVICE_URL: secrets.ACCOUNTS_SERVICE_URL,
    NEXT_PUBLIC_CUSTOM_MODEL_NAME: process.env.CUSTOM_MODEL_NAME || secrets.CUSTOM_MODEL_NAME || "",
  },
  // Server-only secrets (AUTH_SECRET, PRISM_USER_TOKEN_SECRET,
  // TOOLS_SERVICE_API_SECRET, PRISM_ALLOWED_EMAILS, PRISM_USERS) are read
  // from process.env at runtime — boot.js loads them from the vault — and
  // must never be listed above: these values are inlined into the bundles,
  // the browser's included.
};

export default nextConfig;
