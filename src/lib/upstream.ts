// ============================================================
// Prism — relaying a request to an internal service
// ============================================================
// The route handlers that stand between the browser and a guarded service
// (the tools proxy, the workspace-agent downloads) stream both ways: the
// request body goes up as it arrives and the response comes back as it is
// produced — server-sent events included. These pick what crosses.
// ============================================================

import { AUTH_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";

/**
 * Never forwarded: the browser's credentials for THIS app (its session
 * cookie, any Authorization), hop-by-hop headers, the Host and length the
 * new request sets itself, and a service secret a caller might try to
 * supply — the route sets the real one.
 */
const DROPPED_REQUEST_HEADERS = new Set([
  "cookie",
  "authorization",
  AUTH_HEADERS.apiSecret,
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Never relayed: hop-by-hop headers, and cookies the service might set on
 * this app's origin.
 */
const DROPPED_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function forwardableRequestHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  headers.forEach((value, name) => {
    if (!DROPPED_REQUEST_HEADERS.has(name.toLowerCase())) forwarded.set(name, value);
  });
  return forwarded;
}

/** The service's response, streamed back with its status and its own headers. */
export function relayResponse(upstream: Response): Response {
  // fetch() hands over a compressed body already decoded: its encoding and
  // length then describe bytes the browser never gets.
  const isDecoded = upstream.headers.has("content-encoding");
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    const header = name.toLowerCase();
    if (DROPPED_RESPONSE_HEADERS.has(header)) return;
    if (isDecoded && (header === "content-encoding" || header === "content-length")) return;
    headers.append(name, value);
  });
  if (headers.get("content-type")?.includes("text/event-stream")) {
    // An event stream must reach the browser frame by frame: nothing
    // between here and it may buffer or compress it.
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

/** fetch() with a streamed request body (Node wants `duplex` for one). */
export function upstreamInit(
  request: Request,
  headers: Headers,
): RequestInit & { duplex?: "half" } {
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: request.signal,
    ...(hasBody && request.body ? { body: request.body, duplex: "half" } : {}),
  };
}
