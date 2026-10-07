// ─────────────────────────────────────────────────────────────
// Admin access policy — single source of truth for who may see
// and open the Admin Side.
//
// Admin status is persisted as the "admin" role on accounts-service
// user records and stamped into the NextAuth session at sign-in
// (src/auth.ts). UI and route gates read the session; they never
// re-derive from emails, env or the network: everyone is signed in
// (proxy.ts), on the LAN too.
// ─────────────────────────────────────────────────────────────

/** Role on accounts-service user records that unlocks the Admin Side. */
export const ADMIN_ROLE = "admin";

/** True when the session roles include the admin role. */
export function hasAdminRole(roles: readonly string[] | null | undefined): boolean {
  return !!roles?.includes(ADMIN_ROLE);
}
