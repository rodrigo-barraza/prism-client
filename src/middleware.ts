import { createAuthMiddleware } from "@rodrigo-barraza/utilities-library/nextjs";
import { auth, AUTH_ENABLED } from "@/auth";

export const middleware = createAuthMiddleware({
  auth: auth as never,
  authEnabled: AUTH_ENABLED,
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
