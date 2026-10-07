// ============================================================
// Prism — Next.js proxy (the sign-in gate)
// ============================================================
// Next.js 16 renamed middleware.ts to proxy.ts. Every page and API route
// the matcher sends here passes Auth.js's `authorized` callback
// (lib/gate.ts): signed in with an allowlisted email → through; otherwise
// pages go to /login and API routes get 401 (403 for an account that is
// not on the list). No private-network bypass: the LAN signs in too.
//
// Never sent here: Auth.js's own routes, Next's build assets, favicon.ico
// and sw.js (a service-worker update check must never be redirected).
// The sign-in page and public files pass without reading the session.
// ============================================================

import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { auth } from "@/auth";
import { isPublicPath } from "@/lib/access";

const gate = auth as unknown as (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response>;

export function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): Response | Promise<Response> {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  return gate(request, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|sw\\.js).*)"],
};
