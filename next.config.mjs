// ============================================================
// Prism Client — Next.js Configuration
// ============================================================
// Bootstraps secrets from Vault (or .env fallback) at startup
// and injects them into process.env for the app.
// ============================================================

import { createVaultClient } from "@rodrigo-barraza/utilities/node";

// ── Bootstrap secrets at build/dev time ────────────────────────
const vault = createVaultClient({
  localEnvFile: "./.env",
  fallbackEnvFile: "../vault-service/.env",
});

const secrets = await vault.fetch();

// Inject into process.env so secrets.js can read them
Object.assign(process.env, secrets);

// Resolved tools-service URL for the rewrite proxy (server-side only).
// Tools-service is internal (no public hostname) — the browser calls
// /api/tools/* which Next.js rewrites to this destination.
const TOOLS_SERVICE_URL = secrets.TOOLS_SERVICE_URL || "http://localhost:5590";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["prism.rod.dev"],
  turbopack: {},
  transpilePackages: ["@rodrigo-barraza/components", "@rodrigo-barraza/utilities"],

  // Expose resolved values to both server and client bundles.
  // config.js applies environment-aware overrides for browser contexts
  // (e.g. public domain for prism-service, proxy path for tools-service).
  env: {
    PRISM_CLIENT_PORT: secrets.PRISM_CLIENT_PORT || "3333",
    PRISM_SERVICE_URL: secrets.PRISM_SERVICE_URL || "http://localhost:7777",
    PRISM_WS_URL: secrets.PRISM_WS_URL || "ws://localhost:7777",
    TOOLS_SERVICE_URL: TOOLS_SERVICE_URL,
    MINIO_PUBLIC_URL: secrets.MINIO_PUBLIC_URL || "",
  },

  // ── Rewrite Proxy ──────────────────────────────────────────
  // Tools-service is internal-only (no public hostname like api.*.rod.dev).
  // Proxy /api/tools/* → tools-service so the browser never makes direct
  // requests to LAN IPs. Prism-service does NOT need a rewrite — it has
  // a public domain (api.prism.rod.dev), set in config.js for production.
  async rewrites() {
    return [
      {
        source: "/api/tools/:path*",
        destination: `${TOOLS_SERVICE_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
