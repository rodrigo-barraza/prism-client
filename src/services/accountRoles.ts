// ─────────────────────────────────────────────────────────────
// Account roles lookup — resolves persisted roles (e.g. "admin")
// from accounts-service by email. Server-side only: called from
// the NextAuth callbacks in src/auth.ts; the shared secret must
// never reach a client bundle.
// ─────────────────────────────────────────────────────────────

import { AUTH_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { ACCOUNTS_SERVICE_URL, ACCOUNTS_SERVICE_API_SECRET } from "@/config";

const LOOKUP_TIMEOUT_MILLISECONDS = 3000;

/**
 * Fetch the roles persisted on an account record. Fails closed: missing
 * email/config, unknown accounts, timeouts, and errors all resolve to no
 * roles rather than blocking sign-in.
 */
export async function fetchAccountRoles(
  emailAddress: string | null | undefined,
): Promise<string[]> {
  if (!emailAddress || !ACCOUNTS_SERVICE_URL || !ACCOUNTS_SERVICE_API_SECRET) {
    return [];
  }

  try {
    const lookupUrl = `${ACCOUNTS_SERVICE_URL}/auth/lookup?email=${encodeURIComponent(emailAddress)}`;
    const response = await fetch(lookupUrl, {
      headers: { [AUTH_HEADERS.apiSecret]: ACCOUNTS_SERVICE_API_SECRET },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      return [];
    }

    const userProfile = (await response.json()) as { roles?: unknown };
    return Array.isArray(userProfile?.roles)
      ? userProfile.roles.filter((role): role is string => typeof role === "string")
      : [];
  } catch {
    return [];
  }
}
