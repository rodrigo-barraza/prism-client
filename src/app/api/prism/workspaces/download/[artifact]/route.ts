/**
 * GET /api/prism/workspaces/download/{agent|tray-app}[?platform=…]
 * → prism-service's /workspaces/download/…, for the signed-in user.
 *
 * The Settings page's download buttons are plain links, and a navigation
 * cannot carry the Authorization header prism-service requires. This
 * route calls it on the user's behalf with a token minted for their
 * session — never the service secret, so the call is the user's own —
 * and streams the file back with its name (Content-Disposition).
 */

import { getErrorMessage } from "@/utils/errorMessage";
import { mintPrismUserToken } from "@/lib/prismUserToken";
import { requireSignedInUser } from "@/lib/signedInUser";
import { relayResponse } from "@/lib/upstream";

export const dynamic = "force-dynamic";

const ARTIFACTS = new Set(["agent", "tray-app"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifact: string }> },
): Promise<Response> {
  const user = await requireSignedInUser(request);
  if (user instanceof Response) return user;

  const { artifact } = await params;
  if (!ARTIFACTS.has(artifact)) {
    return Response.json({ error: `Unknown download: ${artifact}` }, { status: 404 });
  }
  const prismServiceUrl = process.env.PRISM_SERVICE_URL?.replace(/\/+$/, "");
  const secret = process.env.PRISM_USER_TOKEN_SECRET;
  if (!prismServiceUrl || !secret) {
    return Response.json(
      { error: "Prism is not configured (PRISM_SERVICE_URL, PRISM_USER_TOKEN_SECRET)." },
      { status: 503 },
    );
  }

  const platform = new URL(request.url).searchParams.get("platform");
  const target = `${prismServiceUrl}/workspaces/download/${artifact}${
    platform ? `?platform=${encodeURIComponent(platform)}` : ""
  }`;
  try {
    const upstream = await fetch(target, {
      headers: { Authorization: `Bearer ${mintPrismUserToken(user, secret).token}` },
      cache: "no-store",
      signal: request.signal,
    });
    return relayResponse(upstream);
  } catch (error: unknown) {
    return Response.json(
      { error: `Failed to reach prism-service: ${getErrorMessage(error)}` },
      { status: 502 },
    );
  }
}
