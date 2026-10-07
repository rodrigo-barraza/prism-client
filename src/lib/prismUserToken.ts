// ============================================================
// Prism — the user token prism-service trusts
// ============================================================
// A JWT signed HS256 with PRISM_USER_TOKEN_SECRET (its UTF-8 bytes are the
// HMAC key), the one credential prism-service accepts from a browser:
//
//   { sub: <Prism username>, email, roles, iat, exp: iat + 1 h,
//     iss: "prism-client", aud: "prism-service" }
//
// Server-only: it is minted by GET /api/prism-token for the signed-in
// user, and by any route that calls prism-service on that user's behalf.
// The secret never leaves this server.
// ============================================================

import { createHmac } from "node:crypto";

export const PRISM_TOKEN_ISSUER = "prism-client";
export const PRISM_TOKEN_AUDIENCE = "prism-service";
export const PRISM_TOKEN_LIFETIME_SECONDS = 60 * 60;

export interface PrismUserIdentity {
  /** The Prism username (PRISM_USERS, or the email's local part). */
  username: string;
  email: string;
  roles: string[];
}

export interface PrismUserTokenGrant extends PrismUserIdentity {
  token: string;
  /** When the token expires, in epoch milliseconds (its `exp` × 1000). */
  expiresAt: number;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function mintPrismUserToken(
  identity: PrismUserIdentity,
  secret: string,
  nowMilliseconds: number = Date.now(),
): PrismUserTokenGrant {
  if (!secret) throw new Error("PRISM_USER_TOKEN_SECRET is not set");
  const issuedAt = Math.floor(nowMilliseconds / 1000);
  const expiresAt = issuedAt + PRISM_TOKEN_LIFETIME_SECONDS;
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    sub: identity.username,
    email: identity.email,
    roles: identity.roles,
    iat: issuedAt,
    exp: expiresAt,
    iss: PRISM_TOKEN_ISSUER,
    aud: PRISM_TOKEN_AUDIENCE,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return {
    ...identity,
    token: `${header}.${payload}.${signature}`,
    expiresAt: expiresAt * 1000,
  };
}
