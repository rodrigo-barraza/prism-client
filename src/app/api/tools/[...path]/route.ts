/**
 * /api/tools/* → tools-service, for the signed-in user.
 *
 * tools-service is internal (no public hostname) and its routes that run
 * code, touch files or act on the owner's accounts take a service secret.
 * The browser never holds it: this route checks the session (proxy.ts
 * gates it too), then forwards the request — path, query, method, body
 * streamed as it arrives — with `x-api-secret: TOOLS_SERVICE_API_SECRET`,
 * and streams the answer back (server-sent events included). The
 * browser's cookies and credentials stay here.
 */

import { AUTH_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { requireSignedInUser } from "@/lib/signedInUser";
import { forwardableRequestHeaders, relayResponse, upstreamInit } from "@/lib/upstream";
import { getErrorMessage } from "@/utils/errorMessage";

export const dynamic = "force-dynamic";

const ROUTE_PREFIX = "/api/tools";

async function forward(request: Request): Promise<Response> {
  const user = await requireSignedInUser(request);
  if (user instanceof Response) return user;

  const toolsServiceUrl = process.env.TOOLS_SERVICE_URL?.replace(/\/+$/, "");
  if (!toolsServiceUrl) {
    return Response.json(
      { error: "tools-service is not configured (TOOLS_SERVICE_URL)." },
      { status: 503 },
    );
  }

  const { pathname, search } = new URL(request.url);
  const target = `${toolsServiceUrl}${pathname.slice(ROUTE_PREFIX.length)}${search}`;
  const headers = forwardableRequestHeaders(request.headers);
  const secret = process.env.TOOLS_SERVICE_API_SECRET;
  if (secret) headers.set(AUTH_HEADERS.apiSecret, secret);

  try {
    return relayResponse(await fetch(target, upstreamInit(request, headers)));
  } catch (error: unknown) {
    console.error(
      `[api/tools] ${request.method} ${pathname} → tools-service failed:`,
      getErrorMessage(error),
    );
    return Response.json(
      { error: `Failed to reach tools-service: ${getErrorMessage(error)}` },
      { status: 502 },
    );
  }
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
};
