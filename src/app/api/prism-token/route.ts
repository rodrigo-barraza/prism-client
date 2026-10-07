/**
 * GET /api/prism-token — the signed-in user's token for prism-service.
 *
 * → 200 { token, expiresAt, username, roles }: an HS256 JWT signed with
 *   PRISM_USER_TOKEN_SECRET (server-only; lib/prismUserToken.ts has the
 *   claims), good for an hour; `expiresAt` is epoch milliseconds. The
 *   browser's token manager (services/prismTokenManager.ts) caches it and
 *   comes back five minutes before it expires.
 * → 401 signed out · 403 not allowlisted, or cross-site · 503 no secret
 *   configured (no token is ever minted without one).
 */

import { mintPrismUserToken } from "@/lib/prismUserToken";
import { requireSignedInUser } from "@/lib/signedInUser";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const user = await requireSignedInUser(request);
  if (user instanceof Response) return user;

  const secret = process.env.PRISM_USER_TOKEN_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Prism sign-in is not configured (PRISM_USER_TOKEN_SECRET)." },
      { status: 503, headers: NO_STORE },
    );
  }

  const grant = mintPrismUserToken(user, secret);
  return Response.json(
    {
      token: grant.token,
      expiresAt: grant.expiresAt,
      username: grant.username,
      roles: grant.roles,
    },
    { headers: NO_STORE },
  );
}
