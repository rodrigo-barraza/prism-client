import { createAuthMiddleware } from "@rodrigo-barraza/utilities-library/nextjs";
import { auth, AUTH_ENABLED } from "@/auth";

export const middleware = createAuthMiddleware({
  auth: auth as never,
  authEnabled: AUTH_ENABLED,
});

export const config = {
  // sw.js is public: a browser's service-worker update check must never be
  // redirected to the login page.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|sw\\.js).*)"],
};
