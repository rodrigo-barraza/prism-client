// ============================================================
// Prism — who may use Prism, and as whom
// ============================================================
// Everything in prism-client sits behind a sign-in (proxy.ts): the
// signed-in email must be in PRISM_ALLOWED_EMAILS. There is no network
// bypass — a browser on the LAN signs in like any other. prism-service
// trusts only a token this app signs for that user (lib/prismUserToken),
// whose subject is the Prism username PRISM_USERS maps the email to.
//
// Pure helpers only: auth.ts reads the environment, proxy.ts and the
// route handlers apply these.
// ============================================================

import { SIGN_IN_PAGE } from "@/constants";

/** Parse a comma-separated email allowlist (case-insensitive). */
export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** An EMPTY allowlist admits no one — sign-in fails closed. */
export function isEmailAllowed(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  return !!email && allowlist.includes(email.trim().toLowerCase());
}

/** `email=username` pairs, comma-separated (PRISM_USERS) → email → Prism username. */
export function parsePrismUsers(value: string | undefined): Map<string, string> {
  const users = new Map<string, string>();
  for (const pair of (value ?? "").split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const email = pair.slice(0, separator).trim().toLowerCase();
    const username = pair.slice(separator + 1).trim();
    if (email && username) users.set(email, username);
  }
  return users;
}

/** The Prism username a login becomes: PRISM_USERS' entry, else the email's local part. */
export function prismUsernameFor(
  email: string,
  users: ReadonlyMap<string, string>,
): string {
  const normalized = email.trim().toLowerCase();
  return users.get(normalized) ?? normalized.split("@")[0];
}

/**
 * Paths that need no sign-in, besides those proxy.ts's matcher never
 * sends through (Auth.js's own routes, Next's build assets, favicon.ico,
 * sw.js): the sign-in page, and the files in `public/` and the app's
 * metadata routes (icons, the web manifest) — a browser fetches an
 * install icon or a manifest without the session cookie. A top-level
 * name with a static extension can only be one of those, or a 404: no
 * page or route lives there.
 */
const PUBLIC_FILE_PATH =
  /^\/(?:avatars\/)?[\w.-]+\.(?:png|jpe?g|gif|svg|ico|webp|js|webmanifest)$/i;

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PAGE ||
    pathname === `${SIGN_IN_PAGE}/` ||
    PUBLIC_FILE_PATH.test(pathname)
  );
}

/**
 * The origin the browser used. Next derives `nextUrl.origin` from the
 * server's own bind address (0.0.0.0:3333 in the container), so a redirect
 * built from it would send users behind the reverse proxy to that address.
 */
export function publicOrigin(headers: Headers, fallback: string): string {
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host");
  if (!host) return fallback;
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(fallback).protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Whether a request came from Prism's own pages (or the user typing the
 * URL). The session cookie is SameSite=Lax, so another site can still send
 * the user here by a top-level navigation; the routes that act with a
 * service secret or hand out a token refuse anything cross-site. Browsers
 * send Sec-Fetch-Site; older ones send Origin; a request with neither isn't
 * from a browser and can't be forged by one.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    const host =
      headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
