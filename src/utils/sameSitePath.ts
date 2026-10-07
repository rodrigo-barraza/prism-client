/**
 * Where the sign-in page sends the user afterwards: a page of this site,
 * never another site — `callbackUrl` is whatever the link said, and a
 * login page that follows it anywhere is an open redirect.
 */

export const DEFAULT_SIGNED_IN_PATH = "/chat";

export function sameSitePath(
  candidate: string | null | undefined,
  origin: string = typeof window === "undefined" ? "http://localhost" : window.location.origin,
): string {
  if (!candidate) return DEFAULT_SIGNED_IN_PATH;
  try {
    const url = new URL(candidate, origin);
    return url.origin === origin
      ? `${url.pathname}${url.search}${url.hash}`
      : DEFAULT_SIGNED_IN_PATH;
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
}
