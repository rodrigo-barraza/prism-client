// ─────────────────────────────────────────────────────────────
// Admin access policy — single source of truth for who may see
// and open the Admin Side.
//
// Admin status is persisted as the "admin" role on accounts-service
// user records and stamped into the NextAuth session at sign-in
// (src/auth.ts). UI and route gates read the session; they never
// re-derive from emails or env.
// ─────────────────────────────────────────────────────────────

/** Role on accounts-service user records that unlocks the Admin Side. */
export const ADMIN_ROLE = "admin";

// Mirrors PRIVATE_HOST_REGEXP in @rodrigo-barraza/utilities-library/nextjs —
// that module is server-only (imports next/server), so the pattern is
// duplicated here for client bundles. Keep the two in sync.
const PRIVATE_HOST_REGEXP =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(:\d+)?$/;

/**
 * True for localhost/LAN hosts. On these hosts the auth middleware is
 * bypassed entirely (no session exists), so admin gating falls back to
 * the same network trust the middleware applies.
 */
export function isPrivateHost(host: string | null | undefined): boolean {
  return !!host && PRIVATE_HOST_REGEXP.test(host);
}

/** True when the session roles include the admin role. */
export function hasAdminRole(roles: readonly string[] | null | undefined): boolean {
  return !!roles?.includes(ADMIN_ROLE);
}

/**
 * Full Admin Side gate: an account holding the persisted admin role, or
 * any private-network host (where no session exists to check).
 */
export function canAccessAdminSide({
  roles,
  host,
}: {
  roles?: readonly string[] | null;
  host?: string | null;
}): boolean {
  return hasAdminRole(roles) || isPrivateHost(host);
}
