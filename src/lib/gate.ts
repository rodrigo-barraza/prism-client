// ============================================================
// Prism — the sign-in gate's decision for one request
// ============================================================
// auth.ts's `authorized` callback is this, and proxy.ts runs it for every
// page and API route its matcher sends through:
//
//   • the sign-in page and public files              → through
//   • signed in with an email in PRISM_ALLOWED_EMAILS → through
//   • signed out:      pages go to /login, API routes get 401
//   • not allowlisted: pages go to /login (AccessDenied), API routes get 403
//
// Always, on the LAN too: there is no private-network bypass.
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import type { Session } from "next-auth";
import { SIGN_IN_PAGE } from "@/constants";
import { isEmailAllowed, isPublicPath, publicOrigin } from "./access";

export const SIGN_IN_REQUIRED_MESSAGE = "Sign in to use Prism.";
export const ACCESS_DENIED_MESSAGE = "This account may not use Prism.";

function isApi(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith("/api/");
}

/** The sign-in page at the origin the browser used, coming back to where it was going. */
export function signInUrl(request: NextRequest, error?: "AccessDenied"): URL {
  const url = new URL(
    SIGN_IN_PAGE,
    publicOrigin(request.headers, request.nextUrl.origin),
  );
  url.searchParams.set(
    "callbackUrl",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  if (error) url.searchParams.set("error", error);
  return url;
}

export function signInRequired(request: NextRequest): Response {
  return isApi(request)
    ? NextResponse.json({ error: SIGN_IN_REQUIRED_MESSAGE }, { status: 401 })
    : NextResponse.redirect(signInUrl(request));
}

export function accessDenied(request: NextRequest): Response {
  return isApi(request)
    ? NextResponse.json({ error: ACCESS_DENIED_MESSAGE }, { status: 403 })
    : NextResponse.redirect(signInUrl(request, "AccessDenied"));
}

/** Through (`true`), or the response that turns the request away. */
export function gateRequest(
  request: NextRequest,
  session: Session | null,
  allowlist: readonly string[],
): true | Response {
  if (isPublicPath(request.nextUrl.pathname)) return true;
  const email = session?.user?.email;
  if (!email) return signInRequired(request);
  if (!isEmailAllowed(email, allowlist)) return accessDenied(request);
  return true;
}
