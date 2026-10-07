// ============================================================
// Prism — the signed-in user, for a route handler that acts for them
// ============================================================
// proxy.ts already gates every API route; the routes that hand out a
// token or act with a service secret check again here, so an edit to the
// matcher can never open them. They also refuse a cross-site request: the
// session cookie rides a top-level navigation from another site.
// ============================================================

import { ALLOWED_EMAILS, PRISM_USERS, auth } from "@/auth";
import { isEmailAllowed, isSameOriginRequest, prismUsernameFor } from "./access";
import { ACCESS_DENIED_MESSAGE, SIGN_IN_REQUIRED_MESSAGE } from "./gate";
import type { PrismUserIdentity } from "./prismUserToken";

const NO_STORE = { "Cache-Control": "no-store" };

/** The signed-in, allowlisted user — or the response that refuses the request. */
export async function requireSignedInUser(
  request: Request,
): Promise<PrismUserIdentity | Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json(
      { error: "Cross-site requests can't use Prism." },
      { status: 403, headers: NO_STORE },
    );
  }
  const session = await auth().catch(() => null);
  const email = session?.user?.email;
  if (!email) {
    return Response.json(
      { error: SIGN_IN_REQUIRED_MESSAGE },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!isEmailAllowed(email, ALLOWED_EMAILS)) {
    return Response.json(
      { error: ACCESS_DENIED_MESSAGE },
      { status: 403, headers: NO_STORE },
    );
  }
  const roles = Array.isArray(session.user.roles)
    ? session.user.roles.filter((role): role is string => typeof role === "string")
    : [];
  return {
    username: prismUsernameFor(email, PRISM_USERS),
    email: email.trim().toLowerCase(),
    roles,
  };
}
